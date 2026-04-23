"""Contract regression tests for /v1/workflows/matcher/jobs.

Goal
----
Pin the HTTP contract of the matcher job routes now that they live in
apps/agent/workflows/matcher/. These tests deliberately do NOT exercise
real LOTUS, do NOT spawn real background work, and do NOT touch the filesystem.

Patching strategy
-----------------
We patch ``server.routes.matcher_jobs.JobRunner`` at the module boundary so
that the route's ``JobRunner(matcher=..., ...)`` constructor and the
``background_tasks.add_task(job_runner.run_job, ...)`` call are captured
without running any real LOTUS / Xinference / QueryOptimizer logic.

Singleton reset
---------------
``JobStore`` (workflows.matcher.job_store) is a process-global singleton.
The ``_reset_job_store`` fixture clears ``_jobs`` before and after each test
to prevent cross-test state leakage.

The SSE ``/stream`` endpoint and the ``/download`` endpoint are intentionally
NOT tested here — same rationale as the original semops tests.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from server.app import app
from server.matcher_types import JobProgressResponse, MatchJobResponse
from workflows.matcher.job_store import JobStore


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def client():
    """FastAPI TestClient backed by the agent workflow server."""
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def _reset_job_store():
    """Reset the process-global JobStore before every test."""
    JobStore()._jobs.clear()
    yield
    JobStore()._jobs.clear()


@pytest.fixture(autouse=True)
def _patch_job_runner(mocker):
    """Replace ``JobRunner`` in the matcher_jobs route with a MagicMock class.

    The route does ``JobRunner(matcher=..., excel_processor=..., ...)`` then
    ``background_tasks.add_task(job_runner.run_job, job_id, target_data)``.
    Patching the class itself means:

    * the constructor call is captured,
    * ``.run_job`` on the returned instance is a MagicMock method so
      BackgroundTasks scheduling is captured without executing anything,
    * the real JobRunner internals (LotusMatcher, httpx calls to semops,
      QueryOptimizer) never execute.
    """
    return mocker.patch("server.routes.matcher_jobs.JobRunner")


@pytest.fixture
def valid_job_request() -> dict:
    """A plausible, valid POST body for POST /v1/workflows/matcher/jobs."""
    return {
        "user_id": "user-1",
        "instance_id": "inst-1",
        "target_type": "SESSION",
        "queries": [
            {"id": "q1", "bu": "BU-A", "query": "llm for legal", "row_index": 0}
        ],
        "target_data": [
            {
                "id": "s1",
                "title": "LLM in enterprise legal",
                "abstract": "four case studies",
            }
        ],
        "top_k": 10,
        "search_k": 50,
        "include_reasons": True,
        "model_provider": "google",
        "model_name": "gemini-2.5-flash",
    }


# ---------------------------------------------------------------------------
# POST /v1/workflows/matcher/jobs
# ---------------------------------------------------------------------------


def test_create_job_happy_path(client, valid_job_request, _patch_job_runner):
    """POST with a valid body returns 200 with the full MatchJobResponse shape."""
    response = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert response.status_code == 200, response.text

    body = response.json()

    # Exact contract: response keys == MatchJobResponse fields.
    assert set(body.keys()) == set(MatchJobResponse.model_fields.keys())

    # Initial state of a freshly-created job.
    assert body["status"] == "PENDING"
    assert body["progress"] == 0
    assert body["query_count"] == len(valid_job_request["queries"])
    assert body["match_count"] == 0

    # id is a non-empty string.
    assert isinstance(body["id"], str)
    assert body["id"]

    # query_data echoes the submitted queries as dicts.
    assert isinstance(body["query_data"], list)
    assert len(body["query_data"]) == len(valid_job_request["queries"])
    for sent, got in zip(valid_job_request["queries"], body["query_data"]):
        assert got["id"] == sent["id"]
        assert got["bu"] == sent["bu"]
        assert got["query"] == sent["query"]
        assert got["row_index"] == sent["row_index"]

    # Scalar config round-trips.
    assert body["user_id"] == valid_job_request["user_id"]
    assert body["instance_id"] == valid_job_request["instance_id"]
    assert body["target_type"] == valid_job_request["target_type"]
    assert body["top_k"] == valid_job_request["top_k"]
    assert body["search_k"] == valid_job_request["search_k"]
    assert body["include_reasons"] == valid_job_request["include_reasons"]

    # JobRunner.run_job was scheduled exactly once with (job_id, target_data).
    instance = _patch_job_runner.return_value
    assert instance.run_job.call_count == 1
    args, kwargs = instance.run_job.call_args
    assert args[0] == body["id"]
    assert args[1] == valid_job_request["target_data"]


def test_create_job_rejects_empty_queries(client, valid_job_request):
    body = dict(valid_job_request)
    body["queries"] = []

    response = client.post("/v1/workflows/matcher/jobs", json=body)
    assert response.status_code == 400, response.text
    assert response.json().get("detail") == "No queries provided"


def test_create_job_rejects_empty_target_data(client, valid_job_request):
    body = dict(valid_job_request)
    body["target_data"] = []

    response = client.post("/v1/workflows/matcher/jobs", json=body)
    assert response.status_code == 400, response.text
    assert response.json().get("detail") == "No target data provided"


def test_create_job_validation_error(client, valid_job_request):
    """Dropping a required field (user_id) must produce FastAPI 422."""
    body = dict(valid_job_request)
    del body["user_id"]

    response = client.post("/v1/workflows/matcher/jobs", json=body)
    assert response.status_code == 422, response.text


# ---------------------------------------------------------------------------
# GET /v1/workflows/matcher/jobs/{id}
# ---------------------------------------------------------------------------


def test_get_job_returns_full_record(client, valid_job_request):
    """GET /{id} returns the same MatchJobResponse shape as create."""
    create_resp = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    get_resp = client.get(f"/v1/workflows/matcher/jobs/{job_id}")
    assert get_resp.status_code == 200, get_resp.text

    body = get_resp.json()
    assert set(body.keys()) == set(MatchJobResponse.model_fields.keys())
    assert body["id"] == job_id
    assert body["status"] == "PENDING"
    assert body["query_count"] == len(valid_job_request["queries"])


def test_get_job_returns_404_for_unknown_id(client):
    response = client.get("/v1/workflows/matcher/jobs/does-not-exist")
    assert response.status_code == 404, response.text
    assert response.json().get("detail") == "Job not found"


# ---------------------------------------------------------------------------
# GET /v1/workflows/matcher/jobs/{id}/progress
# ---------------------------------------------------------------------------


def test_get_progress_snapshot(client, valid_job_request):
    """GET /{id}/progress returns exactly the JobProgressResponse field set."""
    create_resp = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    progress_resp = client.get(f"/v1/workflows/matcher/jobs/{job_id}/progress")
    assert progress_resp.status_code == 200, progress_resp.text

    body = progress_resp.json()
    assert set(body.keys()) == set(JobProgressResponse.model_fields.keys())
    assert body["id"] == job_id
    assert body["status"] == "PENDING"
    assert body["progress"] == 0
    assert body["query_count"] == len(valid_job_request["queries"])
    assert body["match_count"] == 0


# ---------------------------------------------------------------------------
# DELETE /v1/workflows/matcher/jobs/{id}
# ---------------------------------------------------------------------------


def test_delete_job_cancels(client, valid_job_request):
    """DELETE a PENDING job flips its status to CANCELLED."""
    create_resp = client.post("/v1/workflows/matcher/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/v1/workflows/matcher/jobs/{job_id}")
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Job cancelled"}

    # Job is retained in the store, just with a CANCELLED status.
    get_resp = client.get(f"/v1/workflows/matcher/jobs/{job_id}")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["status"] == "CANCELLED"
