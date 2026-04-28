"""Tests for workflows.wiki_ingest."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from workflows.wiki_ingest import (
    Edge,
    Extraction,
    Graph,
    Node,
    WikiExtractRequest,
    _build_extraction_report,
    _cluster_graph,
    _filter_source,
    _merge_graph,
)

# --- pure helper tests (no LLM) ---


def test_merge_graph_adds_new_nodes_and_edges():
    existing = Graph(
        nodes=[Node(id="n1", label="A", type="concept", summary="...", source_refs=["src_old"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n2", label="B", type="concept", summary="...", source_refs=["src_new"])],
        edges=[
            Edge(
                source="n1",
                target="n2",
                relation="rel",
                confidence="EXTRACTED",
                weight=1,
                source_ref="src_new",
            )
        ],
    )
    merged = _merge_graph(existing, extracted)
    assert {n.id for n in merged.nodes} == {"n1", "n2"}
    assert len(merged.edges) == 1


def test_merge_graph_preserves_existing_source_refs():
    existing = Graph(
        nodes=[Node(id="n1", label="A", type="c", summary="s", source_refs=["src_a"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="A", type="c", summary="s", source_refs=["src_b"])],
        edges=[],
    )
    merged = _merge_graph(existing, extracted)
    n = next(n for n in merged.nodes if n.id == "n1")
    assert set(n.source_refs) == {"src_a", "src_b"}


def test_extraction_report_crossrefs_when_node_already_exists():
    existing = Graph(
        nodes=[Node(id="n1", label="DPO", type="c", summary="...", source_refs=["paper_a"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="DPO", type="c", summary="...", source_refs=["paper_b"])],
        edges=[],
    )
    report = _build_extraction_report(existing, extracted)
    cross = [c for c in report["crossRefs"] if c["label"] == "DPO"]
    assert cross and cross[0]["existingSourceIds"] == ["paper_a"]


def test_cluster_graph_returns_dict_of_communities():
    g = Graph(
        nodes=[
            Node(id=f"n{i}", label=f"L{i}", type="c", summary="", source_refs=["s"])
            for i in range(4)
        ],
        edges=[
            Edge(
                source="n0",
                target="n1",
                relation="r",
                confidence="EXTRACTED",
                weight=1,
                source_ref="s",
            ),
            Edge(
                source="n2",
                target="n3",
                relation="r",
                confidence="EXTRACTED",
                weight=1,
                source_ref="s",
            ),
        ],
    )
    communities = _cluster_graph(g)
    assert isinstance(communities, dict)
    # Two disconnected pairs → at least 2 communities
    assert len(communities) >= 2


def test_cluster_graph_empty_returns_empty():
    g = Graph(nodes=[], edges=[])
    assert _cluster_graph(g) == {}


def test_annotate_communities_stamps_community_on_each_node():
    from workflows.wiki_ingest import _annotate_communities

    g = Graph(
        nodes=[
            Node(id="a", label="A", type="c", summary=""),
            Node(id="b", label="B", type="c", summary=""),
            Node(id="c", label="C", type="c", summary=""),
        ],
        edges=[],
    )
    _annotate_communities(g, {0: ["a", "b"], 1: ["c"]})
    by_id = {n.id: n for n in g.nodes}
    assert by_id["a"].community == 0
    assert by_id["b"].community == 0
    assert by_id["c"].community == 1


def test_filter_source_drops_nodes_with_only_that_source():
    g = Graph(
        nodes=[
            Node(id="n1", label="A", type="c", summary="", source_refs=["src_remove"]),
            Node(id="n2", label="B", type="c", summary="", source_refs=["src_remove", "src_keep"]),
        ],
        edges=[
            Edge(
                source="n1",
                target="n2",
                relation="r",
                confidence="EXTRACTED",
                weight=1,
                source_ref="src_remove",
            )
        ],
    )
    out = _filter_source(g, "src_remove")
    assert {n.id for n in out.nodes} == {"n2"}
    n2 = next(n for n in out.nodes if n.id == "n2")
    assert n2.source_refs == ["src_keep"]
    assert out.edges == []


# --- LLM @task tests ---


@pytest.mark.asyncio
async def test_extract_graph_parses_llm_response(monkeypatch):
    from workflows.wiki_ingest import (
        _extract_graph_impl,
        _ExtractOut,
        _NodeOut,
    )

    async def fake(prompt, schema, lm):
        assert schema is _ExtractOut
        return _ExtractOut(
            normalized_title="DPO Paper",
            nodes=[_NodeOut(id="dpo", label="DPO", type="method", summary="...")],
            edges=[],
        )

    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)

    extraction = await _extract_graph_impl(
        "body", "T", "src1", [], {"provider": "openai", "model": "gpt-4o", "api_key": "k"}
    )
    assert extraction.normalized_title == "DPO Paper"
    assert extraction.nodes[0].label == "DPO"
    assert extraction.nodes[0].source_refs == ["src1"]


@pytest.mark.asyncio
async def test_extract_graph_falls_back_to_title_when_normalized_blank(monkeypatch):
    """If the LLM returns empty normalized_title, fall back to the source title."""
    from workflows.wiki_ingest import _extract_graph_impl, _ExtractOut

    async def fake(prompt, schema, lm):
        return _ExtractOut(normalized_title="", nodes=[], edges=[])

    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)
    extraction = await _extract_graph_impl(
        "body",
        "Source Title",
        "src1",
        [],
        {"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    assert extraction.normalized_title == "Source Title"


# --- entrypoint end-to-end tests ---


@pytest.mark.asyncio
async def test_extract_wiki_end_to_end(monkeypatch):
    from workflows.wiki_ingest import (
        _EdgeOut,
        _ExtractOut,
        _NodeOut,
        _PageOut,
        extract_wiki,
    )

    async def fake(prompt, schema, lm):
        if schema is _ExtractOut:
            return _ExtractOut(
                normalized_title="Paper",
                nodes=[
                    _NodeOut(id="a", label="A", type="c", summary="s"),
                    _NodeOut(id="b", label="B", type="c", summary="s"),
                ],
                edges=[_EdgeOut(source="a", target="b", relation="r", confidence="EXTRACTED")],
            )
        if schema is _PageOut:
            return _PageOut(title="Cluster 0", markdown="about [source:src1]")
        raise AssertionError(f"unexpected schema {schema}")

    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)

    async def fake_state(notebook_id):
        return None, None, None

    monkeypatch.setattr("workflows.wiki_ingest._load_state", fake_state)

    req = WikiExtractRequest(
        mode="extract",
        notebook_id="nb1",
        source_id="src1",
        user_id="u",
        source_title="t",
        source_content="body",
        existing_node_labels=[],
        source_map={"src1": "Paper"},
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.normalized_title == "Paper"
    assert len(result.community_pages) >= 1
    assert result.index_page.slug == "index"
    assert result.extraction_report["crossRefs"] == []


@pytest.mark.asyncio
async def test_extract_wiki_remove_mode(monkeypatch):
    from workflows.wiki_ingest import _PageOut, extract_wiki

    async def fake(prompt, schema, lm):
        return _PageOut(title="page", markdown="...")

    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)

    existing = Graph(
        nodes=[
            Node(id="x", label="X", type="c", summary="", source_refs=["src_remove", "src_other"]),
            Node(id="y", label="Y", type="c", summary="", source_refs=["src_remove"]),
        ],
        edges=[],
    )

    async def fake_state(notebook_id):
        return existing, None, None

    monkeypatch.setattr("workflows.wiki_ingest._load_state", fake_state)

    req = WikiExtractRequest(
        mode="remove",
        notebook_id="nb1",
        source_id="src_remove",
        user_id="u",
        source_title="t",
        source_map={},
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.extraction is None
    assert result.extraction_report is None
    assert {n.id for n in result.merged_graph.nodes} == {"x"}


@pytest.mark.asyncio
async def test_build_wiki_pages_skips_llm_on_cache_hit(monkeypatch):
    """Cached communities reuse stored markdown without an LLM call."""
    from workflows.wiki_ingest import _build_wiki_pages_impl

    fake = AsyncMock()
    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)

    g = Graph(
        nodes=[
            Node(id="a", label="A", type="c", summary="", source_refs=["s1"]),
            Node(id="b", label="B", type="c", summary="", source_refs=["s1"]),
        ],
        edges=[],
    )
    communities = {0: ["a", "b"]}
    cache = {
        (frozenset({"a", "b"}), frozenset({"s1"})): {
            "title": "Cached",
            "markdown": "cached body",
        },
    }
    pages = await _build_wiki_pages_impl(
        g, communities, {"s1": "S1"}, {"provider": "x", "model": "m", "api_key": "k"}, cache=cache
    )
    assert pages[0].title == "Cached"
    assert pages[0].markdown == "cached body"
    fake.assert_not_called()


@pytest.mark.asyncio
async def test_build_wiki_pages_misses_call_llm(monkeypatch):
    """Communities whose fingerprint isn't in the cache hit the LLM."""
    from workflows.wiki_ingest import _build_wiki_pages_impl, _PageOut

    fake = AsyncMock(return_value=_PageOut(title="Fresh", markdown="fresh body"))
    monkeypatch.setattr("workflows.wiki_ingest._llm_json", fake)

    g = Graph(
        nodes=[Node(id="a", label="A", type="c", summary="", source_refs=["s1"])],
        edges=[],
    )
    pages = await _build_wiki_pages_impl(
        g, {0: ["a"]}, {"s1": "S1"}, {"provider": "x", "model": "m", "api_key": "k"}, cache={}
    )
    assert pages[0].title == "Fresh"
    fake.assert_awaited_once()


def test_build_page_cache_indexes_by_fingerprint():
    from workflows.wiki_ingest import _build_page_cache

    g = Graph(
        nodes=[
            Node(id="a", label="A", type="c", summary="", source_refs=["s1"]),
            Node(id="b", label="B", type="c", summary="", source_refs=["s1"]),
        ],
        edges=[],
    )
    cache = _build_page_cache(
        g,
        {"0": ["a", "b"]},
        [{"slug": "community-0", "title": "T", "markdown": "M"}],
    )
    key = (frozenset({"a", "b"}), frozenset({"s1"}))
    assert cache[key] == {"title": "T", "markdown": "M"}


@pytest.mark.asyncio
async def test_extract_wiki_remove_no_graph_returns_empty(monkeypatch):
    """When the notebook has no graph yet, mode=remove is a no-op."""
    from workflows.wiki_ingest import extract_wiki

    async def fake_state(notebook_id):
        return None, None, None

    monkeypatch.setattr("workflows.wiki_ingest._load_state", fake_state)

    req = WikiExtractRequest(
        mode="remove",
        notebook_id="n",
        source_id="s",
        user_id="u",
        source_title="t",
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.merged_graph.nodes == []
    assert result.community_pages == []
    assert result.communities == {}


@pytest.mark.asyncio
async def test_apikey_not_in_caplog_on_error(monkeypatch, caplog):
    from workflows.wiki_ingest import extract_wiki

    async def boom(prompt, schema, lm):
        raise RuntimeError("upstream 502")

    monkeypatch.setattr("workflows.wiki_ingest._llm_json", boom)

    async def fake_state(notebook_id):
        return None, None, None

    monkeypatch.setattr("workflows.wiki_ingest._load_state", fake_state)

    req = WikiExtractRequest(
        mode="extract",
        notebook_id="n",
        source_id="s",
        user_id="u",
        source_title="t",
        source_content="body",
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "sk-SECRET-DO-NOT-LEAK"},
    )
    with pytest.raises(Exception):
        await extract_wiki.ainvoke(req)
    assert "sk-SECRET-DO-NOT-LEAK" not in caplog.text
