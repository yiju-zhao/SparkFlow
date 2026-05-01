"""Tests for workflows.matcher.job — Graph API + Send orchestrator-worker.

Strategy: test the node functions directly (orchestrator, assign_workers,
rank_bu, synthesize) rather than invoking the compiled graph. The compiled
graph wires Send dispatch through worker threads, where `with patch()`
doesn't propagate — module-level monkeypatch is more reliable. For the
HTTP route, we mock arq.create_pool so the FastAPI lifespan doesn't need
a live Redis.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from server.matcher_types import MatchJobResponse
from workflows.matcher.job import (
    _build_master,
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
# _build_master — schema-clamp + Int64 rank casting (issue #153)
# ---------------------------------------------------------------------------


def test_build_master_casts_unmatched_rank_to_nullable_int():
    """master[bu] should be Int64 (not float) so Excel doesn't show 1.0."""
    target_df = pd.DataFrame(
        [
            {"id": 1, "title": "row 1"},
            {"id": 2, "title": "row 2"},
            {"id": 3, "title": "row 3"},
        ]
    )
    # BU returns only 2 of the 3 target rows — row id=3 will be unmatched.
    results_by_bu = {
        "BU_A": pd.DataFrame(
            [
                {"id": 1, "rank": 1, "title": "row 1"},
                {"id": 2, "rank": 2, "title": "row 2"},
            ]
        )
    }

    master = _build_master(target_df, results_by_bu, include_reasons=False)

    assert master["BU_A"].dtype == pd.Int64Dtype(), (
        f"expected Int64, got {master['BU_A'].dtype!r}"
    )
    # Matched rows keep int values (no float upcast).
    assert master.loc[master["title"] == "row 1", "BU_A"].iloc[0] == 1
    assert master.loc[master["title"] == "row 2", "BU_A"].iloc[0] == 2
    # Unmatched row is pd.NA (nullable-int missing), not float NaN.
    unmatched = master.loc[master["title"] == "row 3", "BU_A"].iloc[0]
    assert unmatched is pd.NA
    assert not (isinstance(unmatched, float) and unmatched != unmatched)


def test_build_master_rejects_mixed_id_columns():
    """If two BUs disagree on id column, raise loudly with both BU names."""
    target_df = pd.DataFrame([{"id": 1, "title": "row 1"}])
    results_by_bu = {
        "BU_A": pd.DataFrame([{"id": 1, "rank": 1, "title": "row 1"}]),
        # BU_B intentionally lacks 'id' — its identity column is 'title'.
        "BU_B": pd.DataFrame([{"title": "row 1", "rank": 1}]),
    }

    with pytest.raises(ValueError) as excinfo:
        _build_master(target_df, results_by_bu, include_reasons=False)

    msg = str(excinfo.value)
    assert "BU_A" in msg
    assert "BU_B" in msg
    assert "id" in msg
    assert "title" in msg


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


# ---------------------------------------------------------------------------
# Terminal-status invariant in _run_and_persist
# ---------------------------------------------------------------------------


def _seed_job(req_overrides: dict | None = None) -> tuple[str, MagicMock]:
    """Seed a JobStore row + mock CreateMatchJobRequest sufficient for
    _run_and_persist to consume.
    """
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
    req = MagicMock()
    req.queries = []
    req.target_type = MagicMock(value="publication")
    req.top_k = 5
    req.search_k = 50
    req.include_reasons = True
    req.model_provider = "openai"
    req.model_name = "gpt-4o-mini"
    req.api_key = "sk-test"
    req.api_base = None
    if req_overrides:
        for k, v in req_overrides.items():
            setattr(req, k, v)
    return job_id, req


def test_run_and_persist_marks_failed_on_cancellation(monkeypatch):
    """SIGTERM mid-rank → row must end FAILED with error_message='cancelled'.

    Reproduces the production symptom: the workflows-api container gets
    redeployed mid-job (asyncio cancels the BackgroundTask) and the row
    used to be left at PROCESSING forever.
    """
    from server.routes import matcher_jobs as routes

    job_id, req = _seed_job()

    async def _raise_cancelled(*_args, **_kwargs):
        raise asyncio.CancelledError()

    monkeypatch.setattr(routes.asyncio, "to_thread", _raise_cancelled)

    with pytest.raises(asyncio.CancelledError):
        asyncio.run(routes._run_and_persist(job_id, req, []))

    job = JobStore().get_job(job_id)
    assert job is not None
    assert job["status"] == "FAILED"
    assert job["error_message"] == "cancelled"
    assert job["completed_at"] is not None


def test_run_and_persist_marks_failed_on_exception(monkeypatch):
    """Generic exception in the worker thread → row must end FAILED with the
    exception's message. No re-raise — BackgroundTasks shouldn't crash the
    app event loop on a per-job failure.
    """
    from server.routes import matcher_jobs as routes

    job_id, req = _seed_job()

    async def _raise_value_error(*_args, **_kwargs):
        raise ValueError("boom")

    monkeypatch.setattr(routes.asyncio, "to_thread", _raise_value_error)

    # Should NOT raise — generic exceptions are swallowed by design.
    asyncio.run(routes._run_and_persist(job_id, req, []))

    job = JobStore().get_job(job_id)
    assert job is not None
    assert job["status"] == "FAILED"
    assert job["error_message"] == "boom"
    assert job["completed_at"] is not None


def test_run_and_persist_marks_completed_on_success(monkeypatch):
    """Happy path stays happy — graph returns excel_bytes, row goes COMPLETED."""
    from server.routes import matcher_jobs as routes

    job_id, req = _seed_job()

    async def _ok(*_args, **_kwargs):
        return {"excel_bytes": b"BYTES", "total_matches": 7}

    monkeypatch.setattr(routes.asyncio, "to_thread", _ok)

    asyncio.run(routes._run_and_persist(job_id, req, []))

    job = JobStore().get_job(job_id)
    assert job is not None
    assert job["status"] == "COMPLETED"
    assert job["progress"] == 100
    assert job["match_count"] == 7
    assert job["error_message"] is None


# ---------------------------------------------------------------------------
# JobStore status-change callback
# ---------------------------------------------------------------------------


def test_update_job_fires_callback_on_status_transition(monkeypatch):
    """Genuine status flip (PENDING → PROCESSING) triggers a callback POST."""
    from workflows.matcher import job_store as js_module

    captured: dict = {}

    def _fake_post(job_id: str, payload: dict) -> None:
        captured["job_id"] = job_id
        captured["payload"] = payload

    monkeypatch.setattr(js_module, "_post_status_callback", _fake_post)

    store = JobStore()
    job_id = store.create_job(
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

    store.update_job(job_id, status="PROCESSING", progress=10)

    assert captured["job_id"] == job_id
    assert captured["payload"]["status"] == "PROCESSING"
    assert captured["payload"]["progress"] == 10


def test_update_job_does_not_fire_callback_on_progress_only(monkeypatch):
    """Progress-only ticks don't trigger the callback — too noisy and the SSE
    stream already covers them.
    """
    from workflows.matcher import job_store as js_module

    calls: list = []

    def _fake_post(job_id: str, payload: dict) -> None:
        calls.append((job_id, payload))

    monkeypatch.setattr(js_module, "_post_status_callback", _fake_post)

    store = JobStore()
    job_id = store.create_job(
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

    # Move to PROCESSING (one callback expected).
    store.update_job(job_id, status="PROCESSING")
    assert len(calls) == 1

    # Several progress-only ticks — no extra callbacks.
    store.update_job(job_id, progress=20)
    store.update_job(job_id, progress=50)
    store.update_job(job_id, progress=80)
    assert len(calls) == 1

    # Setting status to its current value is a no-op (no transition).
    store.update_job(job_id, status="PROCESSING", progress=85)
    assert len(calls) == 1

    # Terminal flip fires another callback.
    store.update_job(job_id, status="COMPLETED", progress=100)
    assert len(calls) == 2
    assert calls[1][1]["status"] == "COMPLETED"
