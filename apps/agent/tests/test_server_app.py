"""Tests for the apps/agent FastAPI workflow server."""

from fastapi.testclient import TestClient


def test_healthz_returns_ok():
    from server.app import app
    client = TestClient(app)
    resp = client.get("/v1/healthz")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}
