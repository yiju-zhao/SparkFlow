"""Smoke tests to verify pytest infrastructure and FastAPI app bootstrap.

These tests intentionally do NOT exercise the semantic operators or any
external services — they only prove that:
  1. pytest can discover and run tests in apps/semops/tests/
  2. conftest.py's TestClient fixture can import api.main.app successfully
  3. A trivial existing endpoint responds with a non-5xx status
"""


def test_sanity():
    """Baseline: pytest itself is wired up."""
    assert 1 + 1 == 2


def test_health_endpoint(client):
    """The /health endpoint defined in api/main.py should respond OK."""
    response = client.get("/health")
    assert response.status_code < 500
    assert response.status_code == 200
    body = response.json()
    assert body.get("status") == "healthy"
    assert body.get("service") == "semops"
