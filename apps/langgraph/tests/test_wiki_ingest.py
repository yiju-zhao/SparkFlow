"""Tests for workflows.wiki_ingest."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from workflows.wiki_ingest import (
    Extraction, Graph, Node, Edge, WikiExtractRequest,
    _merge_graph, _build_extraction_report, _cluster_graph, _filter_source,
)


# --- pure helper tests (no LLM) ---


def test_merge_graph_adds_new_nodes_and_edges():
    existing = Graph(
        nodes=[Node(id="n1", label="A", type="concept", summary="...",
                    source_refs=["src_old"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n2", label="B", type="concept", summary="...",
                    source_refs=["src_new"])],
        edges=[Edge(source="n1", target="n2", relation="rel",
                    confidence="EXTRACTED", weight=1, source_ref="src_new")],
    )
    merged = _merge_graph(existing, extracted)
    assert {n.id for n in merged.nodes} == {"n1", "n2"}
    assert len(merged.edges) == 1


def test_merge_graph_preserves_existing_source_refs():
    existing = Graph(
        nodes=[Node(id="n1", label="A", type="c", summary="s",
                    source_refs=["src_a"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="A", type="c", summary="s",
                    source_refs=["src_b"])],
        edges=[],
    )
    merged = _merge_graph(existing, extracted)
    n = next(n for n in merged.nodes if n.id == "n1")
    assert set(n.source_refs) == {"src_a", "src_b"}


def test_extraction_report_crossrefs_when_node_already_exists():
    existing = Graph(
        nodes=[Node(id="n1", label="DPO", type="c", summary="...",
                    source_refs=["paper_a"])],
        edges=[],
    )
    extracted = Extraction(
        normalized_title="t",
        nodes=[Node(id="n1", label="DPO", type="c", summary="...",
                    source_refs=["paper_b"])],
        edges=[],
    )
    report = _build_extraction_report(existing, extracted)
    cross = [c for c in report["crossRefs"] if c["label"] == "DPO"]
    assert cross and cross[0]["existingSourceIds"] == ["paper_a"]


def test_cluster_graph_returns_dict_of_communities():
    g = Graph(
        nodes=[Node(id=f"n{i}", label=f"L{i}", type="c", summary="",
                    source_refs=["s"]) for i in range(4)],
        edges=[Edge(source="n0", target="n1", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="s"),
               Edge(source="n2", target="n3", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="s")],
    )
    communities = _cluster_graph(g)
    assert isinstance(communities, dict)
    # Two disconnected pairs → at least 2 communities
    assert len(communities) >= 2


def test_cluster_graph_empty_returns_empty():
    g = Graph(nodes=[], edges=[])
    assert _cluster_graph(g) == {}


def test_filter_source_drops_nodes_with_only_that_source():
    g = Graph(
        nodes=[Node(id="n1", label="A", type="c", summary="",
                    source_refs=["src_remove"]),
               Node(id="n2", label="B", type="c", summary="",
                    source_refs=["src_remove", "src_keep"])],
        edges=[Edge(source="n1", target="n2", relation="r",
                    confidence="EXTRACTED", weight=1, source_ref="src_remove")],
    )
    out = _filter_source(g, "src_remove")
    assert {n.id for n in out.nodes} == {"n2"}
    n2 = next(n for n in out.nodes if n.id == "n2")
    assert n2.source_refs == ["src_keep"]
    assert out.edges == []


# --- LLM @task tests ---


@pytest.mark.asyncio
async def test_extract_graph_parses_llm_response(monkeypatch):
    from workflows.wiki_ingest import _extract_graph_impl

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content": """
    {"normalized_title":"DPO Paper",
     "nodes":[{"id":"dpo","label":"DPO","type":"method","summary":"..."}],
     "edges":[]}
    """})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    extraction = await _extract_graph_impl("body", "T", "src1", [], {
        "provider": "openai", "model": "gpt-4o", "api_key": "k"})
    assert extraction.normalized_title == "DPO Paper"
    assert extraction.nodes[0].label == "DPO"
    assert extraction.nodes[0].source_refs == ["src1"]


@pytest.mark.asyncio
async def test_extract_graph_strips_markdown_codefence(monkeypatch):
    from workflows.wiki_ingest import _extract_graph_impl

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content": """```json
    {"normalized_title":"x","nodes":[],"edges":[]}
    ```"""})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)
    extraction = await _extract_graph_impl("body", "T", "src1", [], {
        "provider": "openai", "model": "gpt-4o", "api_key": "k"})
    assert extraction.normalized_title == "x"


# --- entrypoint end-to-end tests ---


@pytest.mark.asyncio
async def test_extract_wiki_end_to_end(monkeypatch):
    from workflows.wiki_ingest import extract_wiki

    iter_calls = iter([
        type("R", (), {"content":
            """{"normalized_title":"Paper","nodes":[
                {"id":"a","label":"A","type":"c","summary":"s"},
                {"id":"b","label":"B","type":"c","summary":"s"}],
              "edges":[{"source":"a","target":"b","relation":"r","confidence":"EXTRACTED"}]}"""})(),
        type("R", (), {"content":
            """{"title":"Cluster 0","markdown":"about [source:src1]"}"""})(),
    ])
    canned = AsyncMock()
    canned.ainvoke = AsyncMock(side_effect=lambda p: next(iter_calls))
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    req = WikiExtractRequest(
        mode="extract", notebook_id="nb1", source_id="src1", user_id="u",
        source_title="t", source_content="body",
        existing_node_labels=[], existing_graph=None,
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
    from workflows.wiki_ingest import extract_wiki

    canned = AsyncMock()
    canned.ainvoke = AsyncMock(return_value=type("R", (), {"content":
        """{"title":"page","markdown":"..."}"""})())
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)

    existing = Graph(
        nodes=[Node(id="x", label="X", type="c", summary="",
                    source_refs=["src_remove", "src_other"]),
               Node(id="y", label="Y", type="c", summary="",
                    source_refs=["src_remove"])],
        edges=[],
    )
    req = WikiExtractRequest(
        mode="remove", notebook_id="nb1", source_id="src_remove", user_id="u",
        source_title="t", existing_graph=existing, source_map={},
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    result = await extract_wiki.ainvoke(req)
    assert result.extraction is None
    assert result.extraction_report is None
    assert {n.id for n in result.merged_graph.nodes} == {"x"}


@pytest.mark.asyncio
async def test_extract_wiki_remove_requires_existing_graph():
    from workflows.wiki_ingest import extract_wiki
    req = WikiExtractRequest(
        mode="remove", notebook_id="n", source_id="s", user_id="u",
        source_title="t", existing_graph=None,
        lm={"provider": "openai", "model": "gpt-4o", "api_key": "k"},
    )
    with pytest.raises(ValueError, match="existing_graph required"):
        await extract_wiki.ainvoke(req)


@pytest.mark.asyncio
async def test_apikey_not_in_caplog_on_error(monkeypatch, caplog):
    from workflows.wiki_ingest import extract_wiki

    async def boom(prompt):
        raise RuntimeError("upstream 502")
    canned = AsyncMock()
    canned.ainvoke = boom
    monkeypatch.setattr("workflows.wiki_ingest._resolve_llm", lambda lm: canned)
    req = WikiExtractRequest(
        mode="extract", notebook_id="n", source_id="s", user_id="u",
        source_title="t", source_content="body",
        lm={"provider": "openai", "model": "gpt-4o",
            "api_key": "sk-SECRET-DO-NOT-LEAK"},
    )
    with pytest.raises(Exception):
        await extract_wiki.ainvoke(req)
    assert "sk-SECRET-DO-NOT-LEAK" not in caplog.text
