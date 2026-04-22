"""Contract regression tests for /api/jobs.

Goal
----
Pin the existing HTTP contract of the six job routes so that the upcoming
``matcher`` → ``semops`` rename (Tasks 7-10) can't silently break the public
surface. These tests deliberately do NOT exercise real LOTUS, do NOT spawn
real background work, and do NOT touch the filesystem.

Patching strategy
-----------------
We patch ``api.routes.jobs.JobRunner`` at the module boundary — the route
constructs a new ``JobRunner(...)`` per request and schedules ``run_job``
via ``BackgroundTasks``. By replacing the class itself with a ``MagicMock``,
both the constructor call AND the ``run_job`` scheduling are captured,
and the real ``JobRunner`` internals (which would try to reach LOTUS /
Xinference / query optimizer) never execute.

Singleton reset
---------------
``JobStore`` is a process-global singleton (``_instance`` with ``_jobs``
dict). Without an explicit reset, state leaks between tests: a job created
in test A shows up in the GET-unknown test in test B. The
``_reset_job_store`` fixture below clears ``_jobs`` before each test.

The SSE ``/stream`` endpoint and the ``/download`` endpoint are intentionally
NOT tested here — the former is an async loop with real sleeps (out of
scope for regression pins), and the latter has no cheap failure branch
that doesn't require a completed job with bytes in memory.
"""

from __future__ import annotations

import pytest

from api.types import JobProgressResponse, MatchJobResponse
from tools.job_store import JobStore


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def _reset_job_store():
    """Reset the process-global JobStore before every test.

    ``JobStore`` is a singleton with a module-lifetime ``_jobs`` dict. Without
    this reset, a job created in test N leaks into test N+1, breaking the
    "GET unknown id returns 404" assertion and making created-job ID
    assertions non-deterministic.
    """
    JobStore()._jobs.clear()
    yield
    JobStore()._jobs.clear()


@pytest.fixture(autouse=True)
def _patch_job_runner(mocker):
    """Replace ``JobRunner`` in the jobs route with a MagicMock class.

    The route does ``JobRunner(matcher=..., excel_processor=..., ...)`` then
    ``background_tasks.add_task(job_runner.run_job, job_id, target_data)``.
    Patching the class itself means:

    * the constructor call is captured (we can assert deps were threaded
      through, if we care — we mostly don't),
    * ``.run_job`` on the returned instance is a ``MagicMock`` method, so
      ``BackgroundTasks`` scheduling is captured without executing anything,
    * the real ``JobRunner`` module's imports (QueryOptimizer, LotusMatcher
      machinery) are never hit on the hot path.
    """
    return mocker.patch("api.routes.jobs.JobRunner")


@pytest.fixture
def valid_job_request() -> dict:
    """A plausible, valid POST body for ``POST /api/jobs``."""
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
# POST /api/jobs
# ---------------------------------------------------------------------------


def test_create_job_happy_path(client, valid_job_request, _patch_job_runner):
    """POST with a valid body returns 200 with the full MatchJobResponse shape."""
    response = client.post("/api/jobs", json=valid_job_request)
    assert response.status_code == 200, response.text

    body = response.json()

    # Exact contract: response keys == MatchJobResponse fields.
    assert set(body.keys()) == set(MatchJobResponse.model_fields.keys())

    # Initial state of a freshly-created job.
    assert body["status"] == "PENDING"
    assert body["progress"] == 0
    assert body["query_count"] == len(valid_job_request["queries"])
    assert body["match_count"] == 0

    # id is a non-empty string (UUID-ish, but we don't over-assert the format).
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
    # FastAPI BackgroundTasks forwards positional args as passed.
    assert args[0] == body["id"]
    assert args[1] == valid_job_request["target_data"]


def test_create_job_rejects_empty_queries(client, valid_job_request):
    body = dict(valid_job_request)
    body["queries"] = []

    response = client.post("/api/jobs", json=body)
    assert response.status_code == 400, response.text
    assert response.json().get("detail") == "No queries provided"


def test_create_job_rejects_empty_target_data(client, valid_job_request):
    body = dict(valid_job_request)
    body["target_data"] = []

    response = client.post("/api/jobs", json=body)
    assert response.status_code == 400, response.text
    assert response.json().get("detail") == "No target data provided"


def test_create_job_validation_error(client, valid_job_request):
    """Dropping a required field (``user_id``) must produce FastAPI 422."""
    body = dict(valid_job_request)
    del body["user_id"]

    response = client.post("/api/jobs", json=body)
    assert response.status_code == 422, response.text


# ---------------------------------------------------------------------------
# GET /api/jobs/{id}
# ---------------------------------------------------------------------------


def test_get_job_returns_full_record(client, valid_job_request):
    """GET /{id} returns the same MatchJobResponse shape as create."""
    create_resp = client.post("/api/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    get_resp = client.get(f"/api/jobs/{job_id}")
    assert get_resp.status_code == 200, get_resp.text

    body = get_resp.json()
    assert set(body.keys()) == set(MatchJobResponse.model_fields.keys())
    assert body["id"] == job_id
    assert body["status"] == "PENDING"
    assert body["query_count"] == len(valid_job_request["queries"])


def test_get_job_returns_404_for_unknown_id(client):
    response = client.get("/api/jobs/does-not-exist")
    assert response.status_code == 404, response.text
    assert response.json().get("detail") == "Job not found"


# ---------------------------------------------------------------------------
# GET /api/jobs/{id}/progress
# ---------------------------------------------------------------------------


def test_get_progress_snapshot(client, valid_job_request):
    """GET /{id}/progress returns exactly the JobProgressResponse field set."""
    create_resp = client.post("/api/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    progress_resp = client.get(f"/api/jobs/{job_id}/progress")
    assert progress_resp.status_code == 200, progress_resp.text

    body = progress_resp.json()
    assert set(body.keys()) == set(JobProgressResponse.model_fields.keys())
    assert body["id"] == job_id
    assert body["status"] == "PENDING"
    assert body["progress"] == 0
    assert body["query_count"] == len(valid_job_request["queries"])
    assert body["match_count"] == 0


# ---------------------------------------------------------------------------
# DELETE /api/jobs/{id}
# ---------------------------------------------------------------------------


def test_delete_job_cancels(client, valid_job_request):
    """DELETE a PENDING job flips its status to CANCELLED.

    The current route returns 200 with ``{"message": "Job cancelled"}`` (no
    explicit status_code on the decorator → FastAPI default). We pin that
    behavior as-is. A follow-up GET must show ``status == "CANCELLED"``.
    """
    create_resp = client.post("/api/jobs", json=valid_job_request)
    assert create_resp.status_code == 200, create_resp.text
    job_id = create_resp.json()["id"]

    delete_resp = client.delete(f"/api/jobs/{job_id}")
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Job cancelled"}

    # Job is retained in the store, just with a CANCELLED status.
    get_resp = client.get(f"/api/jobs/{job_id}")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["status"] == "CANCELLED"
