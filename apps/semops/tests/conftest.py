"""Shared pytest fixtures for apps/semops tests."""

import os
import sys

# Ensure parent directory on sys.path so tests can import api, services, tools
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import pytest
from fastapi.testclient import TestClient

from api.main import app


@pytest.fixture
def client():
    """FastAPI TestClient for integration tests."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def sample_candidates():
    """A small list of candidate dicts resembling WeChat-like articles."""
    return [
        {"id": "a1", "text": "Title: LLM Agent in enterprise legal | Summary: four case studies"},
        {"id": "a2", "text": "Title: Diffusion for video generation | Summary: DiT architecture"},
        {"id": "a3", "text": "Title: Cooking pasta | Summary: five easy recipes"},
    ]
