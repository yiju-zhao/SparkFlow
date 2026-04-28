"""Wiki-ingest workflow — port of apps/web/lib/services/graph-service.ts.

Pattern: Functional API chain (ref doc §Functional API). LLM-bound steps
(extract_graph, build_wiki_pages) are @task; pure helpers stay inline.

Modes:
  - "extract": new source ingest (LLM extract → merge → cluster → pages)
  - "remove": surgical source removal (filter graph → re-cluster → pages)

The Node-side worker calls POST /v1/workflows/wiki/extract with a Pydantic
discriminated-union request (see server/wiki_ingest_types.py) and runs the
prisma.$transaction on the response — that part stays in Node.
"""

from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass, field
from typing import Any, Literal

import networkx as nx
import psycopg
from langchain_openai import ChatOpenAI
from langgraph.func import entrypoint, task
from pydantic import BaseModel, Field

# --- types ---


@dataclass
class Node:
    id: str
    label: str
    type: str
    summary: str
    source_refs: list[str] = field(default_factory=list)
    # Filled in by ``extract_wiki`` after Louvain assigns each node to a
    # community. The wiki UI groups nodes by this field to render the
    # "topics" list — without it the panel only shows entities and no
    # topic count. Stays None when the graph has 0 nodes (no clustering
    # happens) which the UI handles via its `node.community === undefined`
    # guard.
    community: int | None = None


@dataclass
class Edge:
    source: str
    target: str
    relation: str
    confidence: Literal["EXTRACTED", "INFERRED"]
    weight: int
    source_ref: str


@dataclass
class Graph:
    nodes: list[Node]
    edges: list[Edge]


@dataclass
class Extraction:
    normalized_title: str
    nodes: list[Node]
    edges: list[Edge]


@dataclass
class WikiPagePayload:
    slug: str
    title: str
    markdown: str
    source_ids: list[str]


@dataclass
class WikiExtractRequest:
    """Plain dataclass form. The HTTP route binds this from the Pydantic
    discriminated-union (server/wiki_ingest_types.py) so this dataclass
    is what the Functional API entrypoint actually consumes.

    Existing notebook state (graph, communities, prior community pages)
    is loaded directly from Postgres by `_load_state` keyed on
    notebook_id — it's no longer carried in the HTTP body.
    """

    mode: Literal["extract", "remove"]
    notebook_id: str
    source_id: str
    user_id: str
    source_title: str
    source_content: str = ""
    existing_node_labels: list[str] = field(default_factory=list)
    source_map: dict[str, str] = field(default_factory=dict)
    lm: dict = field(default_factory=dict)


@dataclass
class WikiExtractResult:
    normalized_title: str
    extraction: Extraction | None
    extraction_report: dict[str, Any] | None
    merged_graph: Graph
    communities: dict[int, list[str]]
    community_pages: list[WikiPagePayload]
    index_page: WikiPagePayload
    log_entry: str


# --- pure helpers (no @task) ---


def _merge_graph(existing: Graph | None, extracted: Extraction) -> Graph:
    """Merge `extracted` into `existing` (None → empty graph).

    Same semantics as graph-service.ts:mergeGraph: node id collisions
    union source_refs; new nodes append; edges append (no dedup).
    """
    merged_nodes: dict[str, Node] = {
        n.id: Node(
            id=n.id, label=n.label, type=n.type, summary=n.summary, source_refs=list(n.source_refs)
        )
        for n in (existing.nodes if existing else [])
    }
    for n in extracted.nodes:
        if n.id in merged_nodes:
            existing_refs = merged_nodes[n.id].source_refs
            for ref in n.source_refs:
                if ref not in existing_refs:
                    existing_refs.append(ref)
        else:
            merged_nodes[n.id] = Node(
                id=n.id,
                label=n.label,
                type=n.type,
                summary=n.summary,
                source_refs=list(n.source_refs),
            )
    merged_edges = list((existing.edges if existing else []))
    merged_edges.extend(extracted.edges)
    return Graph(nodes=list(merged_nodes.values()), edges=merged_edges)


def _build_extraction_report(existing: Graph | None, extracted: Extraction) -> dict[str, Any]:
    """Build the {nodes, edges, crossRefs} payload the Node-side UI consumes
    (graph-service.ts:610-625 equivalent). crossRefs lists nodes the LLM
    extracted that already exist in the prior graph, with their existing
    source IDs.
    """
    existing_node_ids = {n.id: n for n in (existing.nodes if existing else [])}
    cross_refs = []
    for n in extracted.nodes:
        if n.id in existing_node_ids:
            cross_refs.append(
                {
                    "label": n.label,
                    "existingSourceIds": list(existing_node_ids[n.id].source_refs),
                }
            )
    return {
        "nodes": [n.__dict__ for n in extracted.nodes],
        "edges": [e.__dict__ for e in extracted.edges],
        "crossRefs": cross_refs,
    }


def _annotate_communities(g: Graph, communities: dict[int, list[str]]) -> None:
    """Stamp each node's `community` with its Louvain cluster id (in place).

    The wiki UI groups graph nodes by ``node.community`` to render the
    "topics" list — without this stamp the front-end falls through and
    only shows the entities count, never the topics. Mirrors what the
    pre-Python ``graph-service.ts:clusterGraph`` used to bake into
    ``notebookGraph.graphData`` directly.
    """
    by_id = {n.id: n for n in g.nodes}
    for cid, node_ids in communities.items():
        for nid in node_ids:
            node = by_id.get(nid)
            if node is not None:
                node.community = cid


def _cluster_graph(g: Graph) -> dict[int, list[str]]:
    """Run Louvain on `g`. Returns {community_id: [node_id, ...]}.

    IDs differ across runs (random tie-breaks) and across implementations
    (TS graphology vs. Python networkx). The Node-side orphan-page delete
    handles re-numbering atomically.
    """
    nx_graph = nx.Graph()
    for n in g.nodes:
        nx_graph.add_node(n.id)
    for e in g.edges:
        nx_graph.add_edge(e.source, e.target, weight=e.weight)
    if len(nx_graph.nodes) == 0:
        return {}
    communities = nx.community.louvain_communities(nx_graph, seed=42)
    return {i: sorted(c) for i, c in enumerate(communities)}


def _filter_source(g: Graph, source_id: str) -> Graph:
    """Mode=remove implementation. Mirrors graph-service.ts:removeSourceFromGraph.

    Drop nodes whose only source_ref is this source. For nodes co-referenced
    by other sources, strip just this source from their source_refs.
    Drop edges that reference dropped nodes OR were emitted by this source.
    """
    surviving_nodes: list[Node] = []
    dropped_node_ids: set[str] = set()
    for n in g.nodes:
        new_refs = [r for r in n.source_refs if r != source_id]
        if not new_refs:
            dropped_node_ids.add(n.id)
            continue
        surviving_nodes.append(
            Node(id=n.id, label=n.label, type=n.type, summary=n.summary, source_refs=new_refs)
        )
    surviving_edges = [
        e
        for e in g.edges
        if e.source not in dropped_node_ids
        and e.target not in dropped_node_ids
        and e.source_ref != source_id
    ]
    return Graph(nodes=surviving_nodes, edges=surviving_edges)


# --- LLM tasks ---


_EXTRACT_PROMPT = """\
You are a knowledge-graph extractor. Given the following source document,
extract:
- nodes: entities/concepts (id, label, type, summary). Use a stable
  slug-style id (e.g., "direct_preference_optimization"). Avoid
  duplicates — if the existing graph already has a node by that id,
  reuse the same id.
- edges: relationships between nodes (source_id, target_id, relation,
  confidence: "EXTRACTED" if directly stated, "INFERRED" if derived).

Output JSON:
{{
  "normalized_title": "...",
  "nodes": [{{"id":"...","label":"...","type":"...","summary":"..."}}, ...],
  "edges": [{{"source":"...","target":"...","relation":"...","confidence":"EXTRACTED|INFERRED"}}, ...]
}}

Existing node labels (avoid duplicating these as new nodes):
{existing_labels}

Source title: {title}
Source body:
{content}
"""


_PAGE_PROMPT = """\
You are writing a wiki page for a community of related concepts.

Community concepts:
{community_nodes}

Source materials referenced (id → title):
{source_map}

Write a concise wiki page in Markdown explaining how these concepts
relate. Cite sources inline as [source:<id>]. Do not exceed 500 words.

Output JSON:
{{
  "title": "...",
  "markdown": "..."
}}
"""


def _resolve_llm(lm: dict) -> ChatOpenAI:
    """BYOK threading: lm is a dict with provider/model/api_key/api_base."""
    return ChatOpenAI(
        model=lm["model"],
        api_key=lm["api_key"],
        base_url=lm.get("api_base"),
        timeout=120,
    )


# --- Pydantic schemas for structured-output LLM calls ---


class _NodeOut(BaseModel):
    id: str
    label: str
    type: str = "concept"
    summary: str = ""


class _EdgeOut(BaseModel):
    source: str
    target: str
    relation: str = ""
    confidence: Literal["EXTRACTED", "INFERRED"] = "EXTRACTED"
    weight: int = 1


class _ExtractOut(BaseModel):
    normalized_title: str = ""
    nodes: list[_NodeOut] = Field(default_factory=list)
    edges: list[_EdgeOut] = Field(default_factory=list)


class _PageOut(BaseModel):
    title: str = ""
    markdown: str = ""


async def _llm_json(prompt: str, schema: type[BaseModel], lm: dict) -> Any:
    """Call the LLM and validate the response against `schema`.

    Uses ``method="json_mode"`` so any OpenAI-compatible provider works
    (DeepSeek, Kimi, GLM, MiniMax, Gemini-OpenAI-compat) without
    function-calling support — all that's needed is a JSON-mode
    response_format. The prompts already say "Output JSON: { ... }".

    Tests can monkeypatch this helper to bypass the network entirely.
    """
    llm = _resolve_llm(lm)
    return await llm.with_structured_output(schema, method="json_mode").ainvoke(prompt)


async def _extract_graph_impl(
    content: str, title: str, source_id: str, existing_labels: list[str], lm: dict
) -> Extraction:
    """LLM call: extract nodes + edges from source content. Plain async so tests
    can call it directly outside an entrypoint context.
    """
    # 60k chars ≈ 15k tokens — fits in every modern LLM context window
    # (gpt-4o, gemini, deepseek all 128k+) without dropping mid-paper
    # sections the way the old 20k cap silently did. Anything above that
    # would call for chunked map-reduce extraction, not a bigger cap.
    prompt = _EXTRACT_PROMPT.format(
        existing_labels=", ".join(existing_labels) or "(none)",
        title=title,
        content=content[:60000],
    )
    out: _ExtractOut = await _llm_json(prompt, _ExtractOut, lm)
    nodes = [
        Node(id=n.id, label=n.label, type=n.type, summary=n.summary, source_refs=[source_id])
        for n in out.nodes
    ]
    edges = [
        Edge(
            source=e.source,
            target=e.target,
            relation=e.relation,
            confidence=e.confidence,
            weight=e.weight,
            source_ref=source_id,
        )
        for e in out.edges
    ]
    return Extraction(normalized_title=out.normalized_title or title, nodes=nodes, edges=edges)


def _build_page_cache(
    existing_graph: Graph | None,
    existing_communities: dict[str, list[str]] | None,
    existing_pages: list[dict] | None,
) -> dict[tuple[frozenset, frozenset], dict]:
    """Index prior community pages by their (node_id_set, source_ref_set)
    fingerprint. A new community whose fingerprint matches one of these
    keys can reuse the stored markdown without an LLM call.
    """
    if not existing_graph or not existing_communities or not existing_pages:
        return {}
    nodes_by_id = {n.id: n for n in existing_graph.nodes}
    pages_by_slug = {p["slug"]: p for p in existing_pages}
    cache: dict[tuple[frozenset, frozenset], dict] = {}
    for cid_str, node_ids in existing_communities.items():
        page = pages_by_slug.get(f"community-{cid_str}")
        if not page:
            continue
        node_set = frozenset(node_ids)
        source_set = frozenset(
            s
            for nid in node_ids
            for s in (nodes_by_id[nid].source_refs if nid in nodes_by_id else [])
        )
        cache[(node_set, source_set)] = {
            "title": page["title"],
            "markdown": page["markdown"],
        }
    return cache


async def _build_wiki_pages_impl(
    g: Graph,
    communities: dict[int, list[str]],
    source_map: dict[str, str],
    lm: dict,
    cache: dict[tuple[frozenset, frozenset], dict] | None = None,
) -> list[WikiPagePayload]:
    """LLM call per community, fanned out concurrently via asyncio.gather.

    Communities whose (node_id_set, source_ref_set) fingerprint matches
    an entry in `cache` skip the LLM entirely and reuse the stored
    markdown — typical incremental ingest hits cache for most existing
    communities, dropping wall-clock to ~max(LLM_call) for the deltas.
    """
    if not communities:
        return []
    nodes_by_id = {n.id: n for n in g.nodes}
    empty = Node(id="", label="", type="", summary="")
    cache = cache or {}

    def _fingerprint(node_ids: list[str]) -> tuple[frozenset, frozenset]:
        return (
            frozenset(node_ids),
            frozenset(s for nid in node_ids for s in nodes_by_id.get(nid, empty).source_refs),
        )

    async def _build_one(cid: int, node_ids: list[str]) -> WikiPagePayload:
        node_set, source_set = _fingerprint(node_ids)
        source_ids = sorted(source_set)
        cached = cache.get((node_set, source_set))
        if cached is not None:
            return WikiPagePayload(
                slug=f"community-{cid}",
                title=cached["title"],
                markdown=cached["markdown"],
                source_ids=source_ids,
            )
        community_nodes = "\n".join(
            f"- {nodes_by_id[nid].label} ({nodes_by_id[nid].type}): {nodes_by_id[nid].summary}"
            for nid in node_ids
            if nid in nodes_by_id
        )
        source_lines = "\n".join(f"- [{sid}] {source_map.get(sid, sid)}" for sid in source_ids)
        prompt = _PAGE_PROMPT.format(community_nodes=community_nodes, source_map=source_lines)
        out: _PageOut = await _llm_json(prompt, _PageOut, lm)
        return WikiPagePayload(
            slug=f"community-{cid}",
            title=out.title or f"Community {cid}",
            markdown=out.markdown,
            source_ids=source_ids,
        )

    return list(await asyncio.gather(*(_build_one(cid, nids) for cid, nids in communities.items())))


# @task wrappers — call from inside an @entrypoint
@task
async def extract_graph(
    content: str, title: str, source_id: str, existing_labels: list[str], lm: dict
) -> Extraction:
    return await _extract_graph_impl(content, title, source_id, existing_labels, lm)


@task
async def build_wiki_pages(
    g: Graph,
    communities: dict[int, list[str]],
    source_map: dict[str, str],
    lm: dict,
    cache: dict[tuple[frozenset, frozenset], dict] | None = None,
) -> list[WikiPagePayload]:
    return await _build_wiki_pages_impl(g, communities, source_map, lm, cache)


def _build_index_page(
    g: Graph, communities: dict[int, list[str]], pages: list[WikiPagePayload]
) -> WikiPagePayload:
    """Generate the deterministic index page (no LLM call)."""
    lines = ["# Wiki Index\n"]
    for p in pages:
        lines.append(f"- [{p.title}](./{p.slug}.md)")
    return WikiPagePayload(
        slug="index",
        title="Wiki Index",
        markdown="\n".join(lines),
        source_ids=sorted({s for p in pages for s in p.source_ids}),
    )


def _format_log(source_id: str, extraction: Extraction | None, n_pages: int) -> str:
    n_nodes = len(extraction.nodes) if extraction else 0
    n_edges = len(extraction.edges) if extraction else 0
    return f"{source_id} extracted {n_nodes} nodes, {n_edges} edges; {n_pages} community pages"


# --- DB state loader ---


async def _load_state(
    notebook_id: str,
) -> tuple[Graph | None, dict[str, list[str]] | None, list[dict] | None]:
    """Load existing graph + communities + community pages from Postgres.

    Returns `(None, None, None)` when no graph row exists yet (first
    ingest into a fresh notebook). Mirrors the connection pattern in
    ``apps/langgraph/tools/hub_toolbox.py``: per-call async connection,
    positional ``%s`` placeholders, no shared state.
    """
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL environment variable is not set")
    async with await psycopg.AsyncConnection.connect(conninfo=dsn) as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                'SELECT "graphData", communities FROM notebook_graphs WHERE "notebookId" = %s',
                (notebook_id,),
            )
            row = await cur.fetchone()
            if row is None:
                return None, None, None
            graph_data, communities = row
            graph = Graph(
                nodes=[
                    Node(
                        id=n["id"],
                        label=n["label"],
                        type=n["type"],
                        summary=n.get("summary", ""),
                        source_refs=list(n.get("source_refs") or n.get("sourceRefs") or []),
                    )
                    for n in (graph_data or {}).get("nodes", [])
                ],
                edges=[
                    Edge(
                        source=e["source"],
                        target=e["target"],
                        relation=e.get("relation", ""),
                        confidence=e.get("confidence", "EXTRACTED"),
                        weight=int(e.get("weight", 1)),
                        source_ref=e.get("source_ref") or e.get("sourceRef") or "",
                    )
                    for e in (graph_data or {}).get("edges", [])
                ],
            )
            await cur.execute(
                "SELECT slug, title, content FROM wiki_pages "
                "WHERE \"notebookId\" = %s AND slug LIKE 'community-%%'",
                (notebook_id,),
            )
            page_rows = await cur.fetchall()
            pages = [
                {"slug": slug, "title": title, "markdown": content}
                for (slug, title, content) in page_rows
            ]
    return graph, communities, pages


# --- entrypoint ---


@entrypoint()
async def extract_wiki(req: WikiExtractRequest) -> WikiExtractResult:
    existing_graph, existing_communities, existing_pages = await _load_state(
        req.notebook_id,
    )

    if req.mode == "extract":
        extraction = await extract_graph(
            req.source_content,
            req.source_title,
            req.source_id,
            req.existing_node_labels,
            req.lm,
        )
        merged = _merge_graph(existing_graph, extraction)
        extraction_report = _build_extraction_report(existing_graph, extraction)
        normalized_title = extraction.normalized_title or req.source_title
    else:  # remove
        if existing_graph is None:
            # No graph yet → nothing to remove. Return an empty payload so
            # the Node side can short-circuit without entering its commit
            # transaction.
            return WikiExtractResult(
                normalized_title=req.source_title,
                extraction=None,
                extraction_report=None,
                merged_graph=Graph(nodes=[], edges=[]),
                communities={},
                community_pages=[],
                index_page=WikiPagePayload(
                    slug="index",
                    title="Wiki Index",
                    markdown="",
                    source_ids=[],
                ),
                log_entry="",
            )
        merged = _filter_source(existing_graph, req.source_id)
        extraction = None
        extraction_report = None
        normalized_title = req.source_title

    communities = _cluster_graph(merged)
    _annotate_communities(merged, communities)
    page_cache = _build_page_cache(
        existing_graph,
        existing_communities,
        existing_pages,
    )
    community_pages = await build_wiki_pages(
        merged,
        communities,
        req.source_map,
        req.lm,
        page_cache,
    )
    index_page = _build_index_page(merged, communities, community_pages)
    log_entry = _format_log(req.source_id, extraction, len(community_pages))

    return WikiExtractResult(
        normalized_title=normalized_title,
        extraction=extraction,
        extraction_report=extraction_report,
        merged_graph=merged,
        communities=communities,
        community_pages=community_pages,
        index_page=index_page,
        log_entry=log_entry,
    )
