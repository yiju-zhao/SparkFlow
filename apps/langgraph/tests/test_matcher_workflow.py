"""Tests for workflows.matcher.job — Graph API + Send orchestrator-worker.

Strategy: test the node functions directly (orchestrator, assign_workers,
rank_bu, synthesize) rather than invoking the compiled graph. The compiled
graph wires Send dispatch through worker threads, where `with patch()`
doesn't propagate — module-level monkeypatch is more reliable. For the
HTTP route, we mock arq.create_pool so the FastAPI lifespan doesn't need
a live Redis.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from server.matcher_types import MatchJobResponse
from workflows.matcher.job import (
    assign_workers,
    orchestrator,
    rank_bu,
    synthesize,
)
from workflows.matcher.job_store import JobStore


@pytest.fixture(autouse=True)
def _reset_job_store():
    JobStore()._jobs.clear()
    yield
    JobStore()._jobs.clear()


@pytest.fixture
def client(monkeypatch):
    """TestClient with arq.create_pool mocked so lifespan doesn't need Redis."""
    monkeypatch.setattr(
        "server.app.create_pool", AsyncMock(return_value=AsyncMock(aclose=AsyncMock()))
    )
    monkeypatch.setattr("server.routes.matcher_jobs._run_and_persist", AsyncMock())
    from server.app import app

    with TestClient(app) as c:
        yield c


def _fake_optimized(bu: str):
    obj = MagicMock()
    obj.optimized_query_en = f"english query for {bu}"
    obj.optimized_query_native = f"原查询 {bu}"
    obj.source_queries = [f"q-{bu}"]
    obj.focuses = [bu]
    obj.used_llm = True
    return obj


def _make_req(queries, target_type="publication"):
    req = MagicMock()
    req.queries = queries
    req.target_type = target_type
    req.top_k = 5
    req.search_k = 50
    req.include_reasons = True
    req.lm = MagicMock(provider="openai", model="gpt-4o-mini", api_key="sk-t", api_base=None)
    return req


# ---------------------------------------------------------------------------
# Direct node-level tests
# ---------------------------------------------------------------------------


def test_orchestrator_groups_queries_by_bu(monkeypatch):
    fake_qo = MagicMock()
    fake_qo.return_value.optimize_queries = MagicMock(
        side_effect=lambda **kw: _fake_optimized(kw["bu"])
    )
    monkeypatch.setattr("workflows.matcher.job.QueryOptimizer", fake_qo)

    req = _make_req(
        [
            {"bu": "BU_A", "query": "q1"},
            {"bu": "BU_A", "query": "q1b"},
            {"bu": "BU_B", "query": "q2"},
        ]
    )
    job_id = JobStore().create_job(
        user_id="u",
        instance_id="i",
        target_type="publication",
        top_k=5,
        search_k=50,
        include_reasons=True,
        query_data=req.queries,
        query_count=3,
        target_data=[],
        model_provider="openai",
        model_name="gpt-4o-mini",
    )

    state = {"job_id": job_id, "target_df": pd.DataFrame(), "req": req, "results_by_bu": {}}
    out = orchestrator(state)

    assert set(out["queries_by_bu"].keys()) == {"BU_A", "BU_B"}
    assert out["queries_by_bu"]["BU_A"] == ["q1", "q1b"]
    assert set(out["optimized"].keys()) == {"BU_A", "BU_B"}
    assert "index_dir" in out
    job = JobStore().get_job(job_id)
    assert job["status"] == "PROCESSING"
    assert job["progress"] == 30


def test_assign_workers_emits_one_send_per_bu():
    state = {
        "target_df": pd.DataFrame(),
        "req": _make_req([{"bu": "BU_A", "query": "q1"}]),
        "optimized": {"BU_A": _fake_optimized("BU_A"), "BU_B": _fake_optimized("BU_B")},
        "index_dir": "/tmp/x",
    }
    sends = assign_workers(state)
    assert len(sends) == 2
    assert {s.node for s in sends} == {"rank_bu"}
    assert {s.arg["bu"] for s in sends} == {"BU_A", "BU_B"}


def test_rank_bu_invokes_lotus_and_returns_results_by_bu(monkeypatch):
    fake_matcher = MagicMock()
    fake_matcher.build_text_column = MagicMock(return_value=pd.DataFrame([{"id": 1}]))
    fake_matcher.run_pipeline = MagicMock(return_value=pd.DataFrame([{"id": 1, "title": "match"}]))
    monkeypatch.setattr("workflows.matcher.job.LotusMatcher", MagicMock(return_value=fake_matcher))

    ws = {
        "bu": "BU_X",
        "optimized": _fake_optimized("BU_X"),
        "target_df": pd.DataFrame([{"id": 1}]),
        "req": _make_req([{"bu": "BU_X", "query": "q"}]),
        "index_dir": "/tmp/x",
    }
    out = rank_bu(ws)
    assert "results_by_bu" in out
    assert "BU_X" in out["results_by_bu"]
    df = out["results_by_bu"]["BU_X"]
    assert "bu" in df.columns
    assert "rank" in df.columns


def test_synthesize_writes_excel_bytes_and_total_matches(monkeypatch):
    fake_xls = MagicMock()
    fake_xls.return_value.create_result_excel = MagicMock(return_value=b"BYTES")
    monkeypatch.setattr("workflows.matcher.job.ExcelProcessor", fake_xls)
    monkeypatch.setattr("workflows.matcher.job._build_master", lambda df, rbu, ir: df)

    job_id = JobStore().create_job(
        user_id="u",
        instance_id="i",
        target_type="publication",
        top_k=5,
        search_k=50,
        include_reasons=True,
        query_data=[],
        query_count=0,
        target_data=[],
        model_provider="openai",
        model_name="gpt-4o-mini",
    )
    state = {
        "job_id": job_id,
        "target_df": pd.DataFrame([{"id": 1}]),
        "req": _make_req([]),
        "results_by_bu": {
            "BU_A": pd.DataFrame([{"id": 1}, {"id": 2}]),
            "BU_B": pd.DataFrame([{"id": 3}]),
        },
    }
    out = synthesize(state)
    assert out["excel_bytes"] == b"BYTES"
    assert out["total_matches"] == 3


# ---------------------------------------------------------------------------
# HTTP route — POST /v1/workflows/matcher/jobs
# ---------------------------------------------------------------------------


@pytest.fixture
def valid_job_request() -> dict:
    return {
        "user_id": "user-1",
        "instance_id": "inst-1",
        "target_type": "SESSION",
        "queries": [{"id": "q1", "bu": "BU-A", "query": "llm for legal", "row_index": 0}],
        "target_data": [{"id": "s1", "title": "x", "abstract": "y"}],
        "top_k": 10,
        "search_k": 50,
        "include_reasons": True,
        "model_provider": "google",
        "model_name": "gemini-2.5-flash",
        "api_key": "fake-test-key",
    }


def test_create_job_happy_path(client, valid_job_request):
    response = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body.keys()) == set(MatchJobResponse.model_fields.keys())
    assert body["status"] == "PENDING"
    assert body["progress"] == 0


def test_create_job_rejects_empty_queries(client, valid_job_request):
    valid_job_request["queries"] = []
    response = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert response.status_code == 400


def test_create_job_rejects_empty_target_data(client, valid_job_request):
    valid_job_request["target_data"] = []
    response = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert response.status_code == 400


def test_get_job_returns_404_for_unknown_id(client):
    response = client.get("/v1/workflows/matcher/jobs/no-such-job")
    assert response.status_code == 404


# ---------------------------------------------------------------------------
# Regression: NaN candidates must not blow up json.dumps
# ---------------------------------------------------------------------------


def test_run_pipeline_replaces_nan_with_none_before_serialization(monkeypatch):
    """
    df.to_dict('records') keeps pandas NaN (float). httpx then runs the
    request through stdlib json.dumps, whose strict encoder rejects NaN
    and dies in build_request with
    "Out of range float values are not JSON compliant: nan".

    Empty Excel cells produced exactly that on the prod server. Verify
    NaN gets replaced with None (JSON null) before _rank_via_semops is
    called, and that the resulting payload is strict-JSON serializable.
    """
    import json

    import numpy as np

    from workflows.matcher.lotus import LotusMatcher

    captured: dict = {}

    def _fake_rank(*, candidates, **kwargs):
        captured["candidates"] = candidates
        captured["kwargs"] = kwargs
        return [{"id": 1, "rank": 1}]

    monkeypatch.setattr("workflows.matcher.lotus._rank_via_semops", _fake_rank)

    df = pd.DataFrame(
        [
            {"id": 1, "title": "row 1", "abstract": "non-empty", "match_text": "t1"},
            {"id": 2, "title": "row 2", "abstract": np.nan, "match_text": "t2"},
            {"id": 3, "title": np.nan, "abstract": np.nan, "match_text": "t3"},
        ]
    )

    LotusMatcher().run_pipeline(
        df=df,
        query_text="q",
        query_name="test",
        top_k=5,
        search_k=50,
        include_reasons=False,
        model_provider="openai",
        model_name="gpt-4o-mini",
        api_key="sk-test",
    )

    candidates = captured["candidates"]
    assert len(candidates) == 3

    for row in candidates:
        for key, val in row.items():
            assert not (
                isinstance(val, float) and val != val
            ), f"NaN leaked in candidate field {key!r}: {row!r}"

    json.dumps(candidates, allow_nan=False)
