# Semops Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract a generic `SemanticOperators` abstraction from the existing LOTUS-backed matcher service, expose it as `POST /api/operators/rank`, and rename `apps/matcher` → `apps/semops` to reflect the broader scope. The existing Conference Matcher UI and `/api/jobs` contract remain unchanged externally; only internals are refactored and the service is renamed at its boundaries.

**Architecture:** Two phases. Phase 1 is a pure internal refactor inside `apps/matcher` — add `services/semantic_operators.py`, refactor `LotusMatcher.run_pipeline` to delegate `sem_topk`/`sem_map` to it, add new `/api/operators/rank` route, preserve all existing APIs. Phase 2 renames the directory and its HTTP/env/DB-column surface: `apps/matcher` → `apps/semops`, `NEXT_PUBLIC_MATCHER_API_URL` → `NEXT_PUBLIC_SEMOPS_API_URL`, `UserSettings.matcherModelProvider/Name` → `semopsModelProvider/Name`. The Conference Matcher *application* (UI, BFF routes under `app/api/matcher/*`, wizard components) keeps the "matcher" name — that's the product feature, not the service.

**Tech Stack:** Python 3.11, FastAPI, LOTUS, pytest (new). TypeScript, Next.js 16, Prisma 7.

---

## File Structure

### New files (Phase 1)

- `apps/matcher/services/semantic_operators.py` — generic ranker; takes candidate list + text_field + query + model_config; returns ranked + reasons; per-request LOTUS LM configuration
- `apps/matcher/api/routes/operators.py` — `POST /api/operators/rank` route
- `apps/matcher/tests/__init__.py`
- `apps/matcher/tests/conftest.py` — shared pytest fixtures, TestClient setup
- `apps/matcher/tests/test_semantic_operators.py` — unit tests for `SemanticOperators.rank`
- `apps/matcher/tests/test_operators_route.py` — HTTP-level test for `/api/operators/rank`
- `apps/matcher/tests/test_jobs_regression.py` — regression asserting `/api/jobs` contract unchanged
- `apps/matcher/pytest.ini` — pytest config

### Modified files (Phase 1)

- `apps/matcher/requirements.txt` — add pytest + pytest-mock + httpx
- `apps/matcher/services/lotus_matcher.py` — `run_pipeline` delegates `sem_topk` + `sem_map` to `SemanticOperators`; accepts `model_config`
- `apps/matcher/services/job_runner.py` — passes `ModelConfig` into `run_pipeline`
- `apps/matcher/api/main.py` — register `operators` router

### Renamed / modified files (Phase 2)

- `apps/matcher/` → `apps/semops/` (git mv)
- `apps/web/.env.example` — `NEXT_PUBLIC_MATCHER_API_URL` → `NEXT_PUBLIC_SEMOPS_API_URL` (keep old as deprecated fallback)
- `apps/web/lib/semops-url.ts` (new) — central resolver with legacy fallback
- `apps/web/lib/matcher/client.ts` — read URL via resolver
- `apps/web/app/api/matcher/jobs/route.ts` — same resolver
- `apps/web/app/api/matcher/jobs/[jobId]/route.ts` — same
- `apps/web/app/api/matcher/jobs/[jobId]/stream/route.ts` — same
- `apps/web/prisma/schema.prisma` — rename `matcherModelProvider` → `semopsModelProvider`, `matcherModelName` → `semopsModelName`
- `apps/web/prisma/migrations/<ts>_rename_matcher_model_to_semops/migration.sql` — hand-edited `ALTER TABLE ... RENAME COLUMN`
- `apps/web/app/api/settings/route.ts` — update field names
- `apps/web/components/settings/settings-workspace.tsx` — update field names and React state
- `apps/web/config/models.json` — rename `matcherModel` key → `semopsModel`
- `CLAUDE.md` (root) — update table rows + env reference
- `apps/web/CLAUDE.md` — update any matcher-service references (UI/app name stays)

---

# Phase 1 — Internal refactor (no external contract change)

### Task 1: Add pytest infrastructure to apps/matcher

**Files:**
- Modify: `apps/matcher/requirements.txt`
- Create: `apps/matcher/pytest.ini`
- Create: `apps/matcher/tests/__init__.py`
- Create: `apps/matcher/tests/conftest.py`

- [ ] **Step 1: Append pytest deps to `apps/matcher/requirements.txt`**

Append at end of file:

```
# Testing
pytest>=8.0.0
pytest-mock>=3.12.0
httpx>=0.27.0
```

- [ ] **Step 2: Create `apps/matcher/pytest.ini`**

```ini
[pytest]
testpaths = tests
python_files = test_*.py
addopts = -v
```

- [ ] **Step 3: Create `apps/matcher/tests/__init__.py` (empty file)**

- [ ] **Step 4: Create `apps/matcher/tests/conftest.py`**

```python
"""Shared pytest fixtures for apps/matcher tests."""

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
```

- [ ] **Step 5: Install new deps locally**

```bash
cd apps/matcher && pip install pytest pytest-mock httpx
```

Expected: three packages install without errors.

- [ ] **Step 6: Verify pytest discovery**

```bash
cd apps/matcher && pytest
```

Expected: exit code 5 ("no tests ran") — confirms config is read.

- [ ] **Step 7: Commit**

```bash
git add apps/matcher/requirements.txt apps/matcher/pytest.ini apps/matcher/tests/
git commit -m "chore(matcher): add pytest infrastructure"
```

---

### Task 2: Write failing test for `SemanticOperators.rank`

**Files:**
- Create: `apps/matcher/tests/test_semantic_operators.py`

- [ ] **Step 1: Create the test file**

```python
"""Unit tests for services.semantic_operators.SemanticOperators."""

from unittest.mock import MagicMock, patch

import pandas as pd
import pytest


def test_rank_returns_top_k_with_reasons(sample_candidates):
    from services.semantic_operators import ModelConfig, SemanticOperators

    ops = SemanticOperators()

    topk_df = pd.DataFrame(
        [
            {"id": "a1", "text": sample_candidates[0]["text"]},
            {"id": "a2", "text": sample_candidates[1]["text"]},
        ]
    )
    mapped_df = topk_df.copy()
    mapped_df["_recommendation_reason"] = [
        "Directly addresses LLM Agent enterprise adoption with concrete cases.",
        "Covers diffusion model video generation advances with architectural detail.",
    ]

    with patch("services.semantic_operators.lotus") as mock_lotus, \
         patch("services.semantic_operators.LM"), \
         patch("services.semantic_operators.SentenceTransformersRM"), \
         patch("services.semantic_operators.FaissVS"):
        mock_lotus.settings = MagicMock()

        with patch.object(pd.DataFrame, "sem_topk", return_value=topk_df), \
             patch.object(pd.DataFrame, "sem_map", return_value=mapped_df):

            result = ops.rank(
                candidates=sample_candidates,
                text_field="text",
                query="LLM Agent + diffusion video",
                top_k=2,
                include_reasons=True,
                model_config=ModelConfig(
                    provider="openai", model="gpt-4o-mini", api_key="sk-test"
                ),
            )

    assert len(result.ranked) == 2
    assert result.ranked[0]["id"] == "a1"
    assert result.ranked[1]["id"] == "a2"
    assert result.reasons["a1"].startswith("Directly addresses")
    assert result.reasons["a2"].startswith("Covers diffusion")


def test_rank_without_reasons_skips_sem_map(sample_candidates):
    from services.semantic_operators import ModelConfig, SemanticOperators

    ops = SemanticOperators()
    topk_df = pd.DataFrame([{"id": "a1", "text": sample_candidates[0]["text"]}])

    with patch("services.semantic_operators.lotus") as mock_lotus, \
         patch("services.semantic_operators.LM"), \
         patch("services.semantic_operators.SentenceTransformersRM"), \
         patch("services.semantic_operators.FaissVS"):
        mock_lotus.settings = MagicMock()

        with patch.object(pd.DataFrame, "sem_topk", return_value=topk_df), \
             patch.object(pd.DataFrame, "sem_map") as mock_map:

            result = ops.rank(
                candidates=sample_candidates,
                text_field="text",
                query="q",
                top_k=1,
                include_reasons=False,
                model_config=ModelConfig(
                    provider="openai", model="gpt-4o-mini", api_key="sk-test"
                ),
            )

    mock_map.assert_not_called()
    assert result.reasons is None
    assert len(result.ranked) == 1


def test_rank_empty_candidates_raises():
    from services.semantic_operators import ModelConfig, SemanticOperators

    ops = SemanticOperators()
    with pytest.raises(ValueError, match="candidates"):
        ops.rank(
            candidates=[],
            text_field="text",
            query="q",
            top_k=5,
            include_reasons=True,
            model_config=ModelConfig(
                provider="openai", model="gpt-4o-mini", api_key="sk-test"
            ),
        )
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd apps/matcher && pytest tests/test_semantic_operators.py -v
```

Expected: all three tests fail with `ModuleNotFoundError: No module named 'services.semantic_operators'`.

- [ ] **Step 3: Commit the failing tests**

```bash
git add apps/matcher/tests/test_semantic_operators.py
git commit -m "test(matcher): add failing tests for SemanticOperators"
```

---

### Task 3: Implement `SemanticOperators`

**Files:**
- Create: `apps/matcher/services/semantic_operators.py`

- [ ] **Step 1: Create the implementation**

```python
"""
Semantic Operators

Generic, content-agnostic ranking + reasoning over a list of candidate dicts.
Callers assemble candidates (each dict must contain the ``text_field`` with a
self-contained semantic description) and invoke ``rank()`` with a query, a K,
and an explicit model configuration (BYOK).

This layer does NOT know about sessions, publications, or WeChat articles.
Callers are responsible for constructing ``text_field``.
"""

from __future__ import annotations

import logging
import threading
from dataclasses import dataclass
from typing import Optional

import lotus
import pandas as pd
from lotus.models import LM, SentenceTransformersRM
from lotus.vector_store import FaissVS

logger = logging.getLogger(__name__)

# LOTUS `lotus.settings` is a process-global. Configuring it per request
# requires serializing the critical section. Under low concurrency (digest
# traffic + Conference Matcher) this is acceptable; semops is not high-QPS.
_LOTUS_LOCK = threading.Lock()

# LOTUS requires an RM for sem_topk/sem_map even if we do not pre-filter.
_DEFAULT_RM_MODEL = "intfloat/e5-base-v2"


@dataclass
class ModelConfig:
    """BYOK model configuration for a single rank() call."""

    provider: str
    model: str
    api_key: str
    api_base: Optional[str] = None


@dataclass
class RankResult:
    ranked: list[dict]
    reasons: Optional[dict[str, str]]


class SemanticOperators:
    """Generic semantic operations on caller-supplied candidate dicts."""

    def rank(
        self,
        candidates: list[dict],
        text_field: str,
        query: str,
        top_k: int,
        include_reasons: bool,
        model_config: ModelConfig,
    ) -> RankResult:
        if not candidates:
            raise ValueError("candidates must be non-empty")
        if top_k < 1:
            raise ValueError("top_k must be >= 1")
        for c in candidates:
            if "id" not in c or text_field not in c:
                raise ValueError(
                    f"each candidate must have 'id' and '{text_field}' fields"
                )

        df = pd.DataFrame(candidates)
        effective_k = min(top_k, len(df))

        with _LOTUS_LOCK:
            lm = LM(
                model=f"{model_config.provider}/{model_config.model}",
                api_base=model_config.api_base,
                api_key=model_config.api_key,
                max_batch_size=5,
                max_tokens=4096,
            )
            rm = SentenceTransformersRM(model=_DEFAULT_RM_MODEL)
            vs = FaissVS()
            lotus.settings.configure(lm=lm, rm=rm, vs=vs)

            topk_instruction = (
                f"Given the following query:\n{query}\n\n"
                f"Rank the items by relevance to this query. An item is more "
                f"relevant if its {{{text_field}}} directly addresses, "
                f"provides insights into, or offers solutions for the query's "
                f"needs."
            )
            top_df = df.sem_topk(topk_instruction, K=effective_k)

            reasons: Optional[dict[str, str]] = None
            if include_reasons:
                reason_instruction = (
                    f"Given the query:\n{query}\n\n"
                    f"For the item described by: {{{text_field}}}\n\n"
                    f"Write a concise recommendation reason in the user's "
                    f"language (match the query language), 1-2 sentences, "
                    f"explaining why this item is relevant. Be specific."
                )
                mapped = top_df.sem_map(reason_instruction, suffix="_recommendation_reason")
                reason_col = next(
                    (c for c in mapped.columns if c.endswith("_recommendation_reason")),
                    None,
                )
                reasons = {}
                if reason_col is not None:
                    for _, row in mapped.iterrows():
                        reasons[str(row["id"])] = str(row[reason_col])
                    top_df = mapped.drop(columns=[reason_col])
                else:
                    top_df = mapped

        return RankResult(ranked=top_df.to_dict(orient="records"), reasons=reasons)
```

- [ ] **Step 2: Run tests**

```bash
cd apps/matcher && pytest tests/test_semantic_operators.py -v
```

Expected: all three tests pass.

- [ ] **Step 3: Commit**

```bash
git add apps/matcher/services/semantic_operators.py
git commit -m "feat(matcher): add generic SemanticOperators layer"
```

---

### Task 4: Refactor `LotusMatcher.run_pipeline` to delegate to `SemanticOperators`

**Files:**
- Modify: `apps/matcher/services/lotus_matcher.py`
- Modify: `apps/matcher/services/job_runner.py`
- Create: `apps/matcher/tests/test_lotus_matcher_delegation.py`

- [ ] **Step 1: Write the failing delegation test**

Create `apps/matcher/tests/test_lotus_matcher_delegation.py`:

```python
"""After refactor, LotusMatcher.run_pipeline delegates ranking to SemanticOperators."""

from unittest.mock import MagicMock, patch

import pandas as pd


def test_run_pipeline_calls_semantic_operators_rank():
    from services.lotus_matcher import LotusMatcher
    from services.semantic_operators import ModelConfig, RankResult

    matcher = LotusMatcher()
    matcher._configured = True  # skip LOTUS configure inside configure()

    df = pd.DataFrame(
        [
            {"id": 1, "title": "A", "match_text": "Title: A"},
            {"id": 2, "title": "B", "match_text": "Title: B"},
        ]
    )

    expected = RankResult(
        ranked=[{"id": 1, "match_text": "Title: A"}],
        reasons={"1": "Because reasons"},
    )

    with patch(
        "services.lotus_matcher.SemanticOperators"
    ) as mock_ops_cls, patch.object(pd.DataFrame, "sem_index", return_value=df), \
         patch.object(pd.DataFrame, "sem_search", return_value=df):
        mock_ops = MagicMock()
        mock_ops.rank.return_value = expected
        mock_ops_cls.return_value = mock_ops

        result = matcher.run_pipeline(
            df=df,
            query_text="some query",
            query_name="BU-Test",
            top_k=1,
            search_k=350,
            include_reasons=True,
            model_config=ModelConfig(
                provider="openai", model="gpt-4o-mini", api_key="sk-test"
            ),
        )

    mock_ops.rank.assert_called_once()
    assert "recommendation_reason" in result.columns
    assert result.iloc[0]["recommendation_reason"] == "Because reasons"


def test_run_pipeline_requires_model_config():
    from services.lotus_matcher import LotusMatcher

    matcher = LotusMatcher()
    matcher._configured = True
    df = pd.DataFrame([{"id": 1, "match_text": "x"}])

    import pytest
    with pytest.raises(ValueError, match="model_config"):
        matcher.run_pipeline(
            df=df,
            query_text="q",
            query_name="bu",
            top_k=1,
            search_k=10,
            include_reasons=False,
        )
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd apps/matcher && pytest tests/test_lotus_matcher_delegation.py -v
```

Expected: tests fail (`run_pipeline` signature doesn't accept `model_config` yet).

- [ ] **Step 3: Rewrite `run_pipeline` in `apps/matcher/services/lotus_matcher.py`**

Replace the existing `run_pipeline` method (currently lines 98–180) with:

```python
    def run_pipeline(
        self,
        df: pd.DataFrame,
        query_text: str,
        query_name: str,
        top_k: int = 50,
        search_k: int = 350,
        include_reasons: bool = True,
        index_dir: str | None = None,
        progress_callback: Callable[[int, str], None] | None = None,
        model_config: "ModelConfig | None" = None,
    ) -> pd.DataFrame:
        """
        Conference-matcher pipeline:
          1. embedding pre-filter via LOTUS sem_search (stays here — big pools)
          2. delegate top_k + reasons to SemanticOperators.rank (BYOK)
        """
        if model_config is None:
            raise ValueError("model_config is required for run_pipeline")

        self.configure()

        logger.info(f"Running pipeline for query: {query_name}")
        logger.info(f"  Input: {len(df)} items, search_k={search_k}, top_k={top_k}")

        if progress_callback:
            progress_callback(10, "Building semantic index...")
        if index_dir:
            import os
            os.makedirs(index_dir, exist_ok=True)
            df = df.sem_index("match_text", index_dir)
        else:
            df = df.sem_index("match_text", "/tmp/lotus_index")

        if progress_callback:
            progress_callback(30, f"Finding top {search_k} candidates...")
        candidates_df = df.sem_search("match_text", query_text, K=search_k)
        logger.info(f"  sem_search: {len(candidates_df)} candidates")

        if progress_callback:
            progress_callback(50, f"Ranking to top {top_k}...")

        candidates = candidates_df.to_dict(orient="records")
        ops = SemanticOperators()
        result = ops.rank(
            candidates=candidates,
            text_field="match_text",
            query=query_text,
            top_k=top_k,
            include_reasons=include_reasons,
            model_config=model_config,
        )

        top_df = pd.DataFrame(result.ranked)
        if result.reasons:
            top_df["recommendation_reason"] = top_df["id"].astype(str).map(result.reasons)

        if progress_callback:
            progress_callback(100, "Complete")

        return top_df.reset_index(drop=True)
```

Also add imports near the top of `lotus_matcher.py`:

```python
from services.semantic_operators import ModelConfig, SemanticOperators
```

- [ ] **Step 4: Update `apps/matcher/services/job_runner.py` to pass `ModelConfig`**

In `job_runner.py`, find the `matcher.run_pipeline(...)` call (around lines 179–188) and replace with:

```python
                from services.semantic_operators import ModelConfig

                matches_df = self.matcher.run_pipeline(
                    df=target_df,
                    query_text=query_text,
                    query_name=bu,
                    top_k=top_k,
                    search_k=search_k,
                    include_reasons=include_reasons,
                    index_dir=index_dir,
                    progress_callback=progress_callback,
                    model_config=ModelConfig(
                        provider=self.model_provider,
                        model=self.model_name,
                        # Existing job flow: no explicit BYOK key in the
                        # request. Fall back to env OPENAI_API_KEY (matches
                        # the pre-refactor behavior).
                        api_key=os.environ.get("OPENAI_API_KEY", "not-needed"),
                        api_base=os.environ.get("XINFERENCE_BASE_URL"),
                    ),
                )
```

Ensure `import os` is present at the top of `job_runner.py`.

- [ ] **Step 5: Run the delegation test**

```bash
cd apps/matcher && pytest tests/test_lotus_matcher_delegation.py -v
```

Expected: both tests pass.

- [ ] **Step 6: Run the full suite**

```bash
cd apps/matcher && pytest -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/matcher/services/lotus_matcher.py apps/matcher/services/job_runner.py apps/matcher/tests/test_lotus_matcher_delegation.py
git commit -m "refactor(matcher): delegate ranking to SemanticOperators"
```

---

### Task 5: Add `POST /api/operators/rank` route

**Files:**
- Create: `apps/matcher/api/routes/operators.py`
- Modify: `apps/matcher/api/main.py`
- Create: `apps/matcher/tests/test_operators_route.py`

- [ ] **Step 1: Write the failing HTTP test**

```python
"""Integration test for POST /api/operators/rank."""

from unittest.mock import patch

from services.semantic_operators import RankResult


def test_operators_rank_happy_path(client):
    expected = RankResult(
        ranked=[{"id": "a1", "text": "..."}],
        reasons={"a1": "because reason"},
    )

    with patch(
        "api.routes.operators.SemanticOperators"
    ) as mock_ops_cls:
        from unittest.mock import MagicMock
        mock_ops = MagicMock()
        mock_ops.rank.return_value = expected
        mock_ops_cls.return_value = mock_ops

        resp = client.post(
            "/api/operators/rank",
            json={
                "candidates": [
                    {"id": "a1", "text": "Title: LLM | ..."},
                    {"id": "a2", "text": "Title: RAG | ..."},
                ],
                "text_field": "text",
                "query": "LLM and RAG",
                "top_k": 1,
                "include_reasons": True,
                "model_config": {
                    "provider": "openai",
                    "model": "gpt-4o-mini",
                    "api_key": "sk-test",
                },
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["ranked"] == [{"id": "a1", "text": "..."}]
    assert body["reasons"] == {"a1": "because reason"}
    mock_ops.rank.assert_called_once()


def test_operators_rank_rejects_empty_candidates(client):
    resp = client.post(
        "/api/operators/rank",
        json={
            "candidates": [],
            "text_field": "text",
            "query": "q",
            "top_k": 5,
            "include_reasons": False,
            "model_config": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
            },
        },
    )
    # Pydantic min_length=1 returns 422; accept either 400 or 422
    assert resp.status_code in (400, 422)


def test_operators_rank_rejects_missing_api_key(client):
    resp = client.post(
        "/api/operators/rank",
        json={
            "candidates": [{"id": "a1", "text": "x"}],
            "text_field": "text",
            "query": "q",
            "top_k": 1,
            "include_reasons": False,
            "model_config": {
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "",
            },
        },
    )
    assert resp.status_code == 400
    assert "api_key" in resp.json()["detail"].lower()
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd apps/matcher && pytest tests/test_operators_route.py -v
```

Expected: 404s because route is not registered.

- [ ] **Step 3: Create `apps/matcher/api/routes/operators.py`**

```python
"""
Generic Semantic Operators HTTP Routes

POST /api/operators/rank — rank a caller-provided candidate list by relevance
to a query, optionally returning a recommendation reason per item.
"""

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from services.semantic_operators import ModelConfig, SemanticOperators

logger = logging.getLogger(__name__)

router = APIRouter()


class RankModelConfigInput(BaseModel):
    provider: str
    model: str
    api_key: str
    api_base: Optional[str] = None


class RankRequest(BaseModel):
    # Pydantic v2: allow a field named `model_config` without colliding
    # with the reserved config attribute.
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    candidates: list[dict[str, Any]] = Field(..., min_length=1)
    text_field: str
    query: str
    top_k: int = Field(..., ge=1)
    include_reasons: bool = True
    model_cfg: RankModelConfigInput = Field(alias="model_config")


class RankResponse(BaseModel):
    ranked: list[dict[str, Any]]
    reasons: Optional[dict[str, str]] = None


@router.post("/rank", response_model=RankResponse)
def rank(req: RankRequest) -> RankResponse:
    if not req.model_cfg.api_key:
        raise HTTPException(status_code=400, detail="model_config.api_key is required")

    ops = SemanticOperators()
    try:
        result = ops.rank(
            candidates=req.candidates,
            text_field=req.text_field,
            query=req.query,
            top_k=req.top_k,
            include_reasons=req.include_reasons,
            model_config=ModelConfig(
                provider=req.model_cfg.provider,
                model=req.model_cfg.model,
                api_key=req.model_cfg.api_key,
                api_base=req.model_cfg.api_base,
            ),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return RankResponse(ranked=result.ranked, reasons=result.reasons)
```

- [ ] **Step 4: Register router in `apps/matcher/api/main.py`**

Edit the imports and router registration. Change:

```python
from api.routes import jobs
# ...
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
```

to:

```python
from api.routes import jobs, operators
# ...
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])
app.include_router(operators.router, prefix="/api/operators", tags=["operators"])
```

- [ ] **Step 5: Run the route tests**

```bash
cd apps/matcher && pytest tests/test_operators_route.py -v
```

Expected: all three tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/matcher/api/routes/operators.py apps/matcher/api/main.py apps/matcher/tests/test_operators_route.py
git commit -m "feat(matcher): add POST /api/operators/rank"
```

---

### Task 6: Regression test for `/api/jobs` (contract unchanged)

**Files:**
- Create: `apps/matcher/tests/test_jobs_regression.py`

- [ ] **Step 1: Create the regression test**

```python
"""
Regression: the external /api/jobs contract must be unchanged after refactor.
LOTUS pipeline is mocked out — this runs without heavy models.
"""

from unittest.mock import patch

import pytest


@pytest.fixture
def sample_queries():
    return [
        {"id": "q1", "bu": "Legal-AI", "query": "LLM for contract review", "row_index": 0},
    ]


@pytest.fixture
def sample_publications():
    return [
        {"id": 1, "title": "Paper A", "abstract": "LLM contract review", "authors": "X",
         "keywords": "LLM", "research_topic": "AI", "affiliations": "Y"},
        {"id": 2, "title": "Paper B", "abstract": "Something else", "authors": "Z",
         "keywords": "diffusion", "research_topic": "CV", "affiliations": "W"},
    ]


def test_create_job_returns_expected_shape(client, sample_queries, sample_publications):
    with patch("services.job_runner.JobRunner.run_job"):
        resp = client.post(
            "/api/jobs",
            json={
                "user_id": "u1",
                "instance_id": "i1",
                "target_type": "PUBLICATION",
                "queries": sample_queries,
                "target_data": sample_publications,
                "top_k": 5,
                "search_k": 20,
                "include_reasons": True,
                "model_provider": "openai",
                "model_name": "gpt-4o-mini",
            },
        )

    assert resp.status_code == 200
    body = resp.json()
    expected = {
        "id", "user_id", "instance_id", "target_type", "top_k", "search_k",
        "include_reasons", "status", "progress", "query_count", "match_count",
        "created_at", "updated_at",
    }
    assert expected.issubset(body.keys())
    assert body["status"] == "PENDING"
    assert body["query_count"] == 1


def test_get_job_progress_shape(client, sample_queries, sample_publications):
    with patch("services.job_runner.JobRunner.run_job"):
        create = client.post(
            "/api/jobs",
            json={
                "user_id": "u1",
                "instance_id": "i1",
                "target_type": "PUBLICATION",
                "queries": sample_queries,
                "target_data": sample_publications,
                "top_k": 5,
                "search_k": 20,
                "include_reasons": True,
                "model_provider": "openai",
                "model_name": "gpt-4o-mini",
            },
        ).json()

    resp = client.get(f"/api/jobs/{create['id']}/progress")
    assert resp.status_code == 200
    body = resp.json()
    for f in ("id", "status", "progress", "query_count", "match_count"):
        assert f in body
```

- [ ] **Step 2: Run the regression tests**

```bash
cd apps/matcher && pytest tests/test_jobs_regression.py -v
```

Expected: both pass.

- [ ] **Step 3: Run the full suite — Phase 1 green**

```bash
cd apps/matcher && pytest -v
```

Expected: all tests pass.

- [ ] **Step 4: Manual smoke test**

Terminal A:
```bash
cd apps/matcher && uvicorn main:app --port 2025
```

Terminal B:
```bash
curl -s http://localhost:2025/health
curl -s -X POST http://localhost:2025/api/operators/rank \
  -H 'Content-Type: application/json' \
  -d '{"candidates":[{"id":"a","text":"LLM"}],"text_field":"text","query":"LLM","top_k":1,"include_reasons":false,"model_config":{"provider":"openai","model":"gpt-4o-mini","api_key":"sk-bad"}}' | head -c 300
```

Expected: `/health` returns `{"status":"healthy"}`. The rank call will likely return 5xx (because `sk-bad` fails upstream auth) — the important signal is the route accepts the payload (no 404/422). Stop the server after.

- [ ] **Step 5: Commit**

```bash
git add apps/matcher/tests/test_jobs_regression.py
git commit -m "test(matcher): regression for /api/jobs contract"
```

---

# Phase 2 — Rename `apps/matcher` → `apps/semops`

Phase 2 is a coordinated rename across directory + env var + DB column. Land as one PR / one deploy — partial renames leave the system inconsistent.

### Task 7: Git-rename `apps/matcher` → `apps/semops`

**Files:**
- Rename: `apps/matcher/` → `apps/semops/`

- [ ] **Step 1: Rename the directory**

```bash
cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow
git mv apps/matcher apps/semops
```

- [ ] **Step 2: Check for any in-tree references to `apps/matcher` remaining inside the moved service**

```bash
grep -RIn "apps/matcher" apps/semops || echo "no internal refs"
```

Expected: `no internal refs`. Paths inside the service are relative; the rename does not touch them.

- [ ] **Step 3: Run tests at the new path**

```bash
cd apps/semops && pytest -v
```

Expected: all tests pass.

- [ ] **Step 4: Commit the rename as an atomic commit**

```bash
git add -A
git commit -m "refactor: rename apps/matcher -> apps/semops"
```

---

### Task 8: Rename env var `MATCHER_API_URL` → `SEMOPS_API_URL` (with fallback)

**Files:**
- Modify: `apps/web/.env.example`
- Create: `apps/web/lib/semops-url.ts`
- Modify: `apps/web/lib/matcher/client.ts`
- Modify: `apps/web/app/api/matcher/jobs/route.ts`
- Modify: `apps/web/app/api/matcher/jobs/[jobId]/route.ts`
- Modify: `apps/web/app/api/matcher/jobs/[jobId]/stream/route.ts`

- [ ] **Step 1: Update `apps/web/.env.example`**

Replace the existing `NEXT_PUBLIC_MATCHER_API_URL=http://localhost:2025` line with:

```
# Semops (semantic operators) service — hosts /api/operators/rank and /api/jobs
NEXT_PUBLIC_SEMOPS_API_URL=http://localhost:2025
# Deprecated alias, kept for one release. Remove after 2026-05-01.
NEXT_PUBLIC_MATCHER_API_URL=http://localhost:2025
```

- [ ] **Step 2: Create the resolver `apps/web/lib/semops-url.ts`**

```typescript
/**
 * Resolve the semops service base URL.
 *
 * Prefers SEMOPS_API_URL / NEXT_PUBLIC_SEMOPS_API_URL. Falls back to the
 * legacy MATCHER_API_URL / NEXT_PUBLIC_MATCHER_API_URL so existing .env
 * files keep working during the rename rollout. Default: http://localhost:2025.
 */
export function semopsBaseUrl(): string {
  return (
    process.env.SEMOPS_API_URL ||
    process.env.NEXT_PUBLIC_SEMOPS_API_URL ||
    process.env.MATCHER_API_URL ||
    process.env.NEXT_PUBLIC_MATCHER_API_URL ||
    "http://localhost:2025"
  );
}
```

- [ ] **Step 3: Update `apps/web/app/api/matcher/jobs/[jobId]/route.ts`**

Replace the env-var line at the top:

```typescript
const MATCHER_API_URL = process.env.MATCHER_API_URL || "http://localhost:2025";
```

with:

```typescript
import { semopsBaseUrl } from "@/lib/semops-url";
const SEMOPS_API_URL = semopsBaseUrl();
```

Then find all occurrences of `MATCHER_API_URL` in this file (two usages around lines 98 and 130) and replace with `SEMOPS_API_URL`.

- [ ] **Step 4: Update `apps/web/app/api/matcher/jobs/[jobId]/stream/route.ts`**

Same treatment: replace the const definition and all usages (one usage around line 18).

- [ ] **Step 5: Update `apps/web/app/api/matcher/jobs/route.ts`**

```bash
grep -n "MATCHER_API_URL" /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/app/api/matcher/jobs/route.ts
```

Apply the same import swap + variable rename at all match sites.

- [ ] **Step 6: Update `apps/web/lib/matcher/client.ts`**

Apply the same import swap + variable rename at all match sites in this file.

- [ ] **Step 7: Verify no call sites bypass the resolver**

```bash
grep -RIn "process\.env\.MATCHER_API_URL\|process\.env\.NEXT_PUBLIC_MATCHER_API_URL" apps/web --include="*.ts" --include="*.tsx"
```

Expected: the only match is inside `apps/web/lib/semops-url.ts` (the intentional fallback). No other call site should read the env directly.

- [ ] **Step 8: Smoke test the Conference Matcher UI**

Terminal A:
```bash
cd apps/semops && uvicorn main:app --port 2025
```

Terminal B:
```bash
cd apps/web && npm run dev
```

Visit `http://localhost:3001/en/explore/toolbox/matcher` and upload a small fixture. Expected: the UI initiates a job against the semops service (confirms the env rename works end-to-end).

- [ ] **Step 9: Commit**

```bash
git add apps/web/.env.example apps/web/lib/semops-url.ts apps/web/lib/matcher/client.ts apps/web/app/api/matcher/
git commit -m "refactor(web): route semops calls through SEMOPS_API_URL with legacy fallback"
```

---

### Task 9: Prisma — rename `matcherModelProvider/Name` → `semopsModelProvider/Name`

**Files:**
- Modify: `apps/web/prisma/schema.prisma`
- Create: `apps/web/prisma/migrations/<ts>_rename_matcher_model_to_semops/migration.sql`

- [ ] **Step 1: Edit `apps/web/prisma/schema.prisma`**

In the `UserSettings` model (near line 55), replace the two lines:

```prisma
  matcherModelProvider String  @default("openai")
  matcherModelName    String   @default("gpt-4o-mini")
```

with:

```prisma
  semopsModelProvider String  @default("openai")
  semopsModelName    String   @default("gpt-4o-mini")
```

- [ ] **Step 2: Create the migration file without applying**

```bash
cd apps/web && npx prisma migrate dev --create-only --name rename_matcher_model_to_semops
```

Expected: creates `prisma/migrations/<ts>_rename_matcher_model_to_semops/migration.sql`.

- [ ] **Step 3: Hand-edit the migration to use RENAME COLUMN**

Open the newly-created SQL file. Prisma will have generated DROP + ADD (data loss). Replace its contents entirely with:

```sql
-- Rename matcher model columns on UserSettings to reflect the apps/semops rename.
ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelProvider" TO "semopsModelProvider";
ALTER TABLE "UserSettings" RENAME COLUMN "matcherModelName" TO "semopsModelName";
```

- [ ] **Step 4: Apply the migration**

```bash
cd apps/web && npx prisma migrate dev
```

Expected: migration applies; Prisma client regenerates.

- [ ] **Step 5: Verify in Postgres**

```bash
docker compose exec -T postgres psql -U postgres -d sparkflow -c '\d "UserSettings"' | grep -iE "semopsmodel|matchermodel"
```

Expected: two rows with `semopsmodelprovider` and `semopsmodelname`. No remaining `matchermodel*`.

- [ ] **Step 6: Commit schema + migration together**

```bash
git add apps/web/prisma/schema.prisma apps/web/prisma/migrations/
git commit -m "refactor(schema): rename matcherModel* -> semopsModel* on UserSettings"
```

---

### Task 10: Update all TypeScript references to `matcherModel*`

**Files:**
- Modify: `apps/web/app/api/settings/route.ts`
- Modify: `apps/web/components/settings/settings-workspace.tsx`
- Modify: `apps/web/config/models.json`

- [ ] **Step 1: Update `apps/web/app/api/settings/route.ts`**

Use the Edit tool with `replace_all:true` for each of these three symbols in the file:

- `matcherModelProvider` → `semopsModelProvider`
- `matcherModelName` → `semopsModelName`
- `defaults.matcherModel` → `defaults.semopsModel`

After replacement, the file has zero occurrences of `matcherModel*`.

- [ ] **Step 2: Update `apps/web/components/settings/settings-workspace.tsx`**

Same replacement, same three symbols. Also rename the React state setters/variables:

- `matcherModelProvider` (state var + setter) → `semopsModelProvider`
- `matcherModel` (state var + setter) → `semopsModel`

Keep any user-facing label text that reads "Matcher Model" — that is the Conference Matcher feature name and remains. Only code symbols change.

- [ ] **Step 3: Update `apps/web/config/models.json`**

Rename the key `"matcherModel"` → `"semopsModel"` (around line 135). Search for any other occurrence in this file and rename too.

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: zero errors. Any remaining error referencing `matcherModel*` means a file was missed; update it.

- [ ] **Step 5: Confirm no stray TS/JSON refs**

```bash
grep -RIn "matcherModel" apps/web --include="*.ts" --include="*.tsx" --include="*.json" | grep -v prisma/migrations
```

Expected: no results. (Historical migration SQL files may contain the old name — those are history and must not be edited.)

- [ ] **Step 6: Run the web dev server and smoke-test Settings**

```bash
cd apps/web && npm run dev
```

Visit `http://localhost:3001/en/settings`. Confirm:
- Page loads without 500
- The "Matcher Model" section (or equivalent label) still renders
- Changing provider/model and saving persists across a refresh

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/settings/route.ts apps/web/components/settings/settings-workspace.tsx apps/web/config/models.json
git commit -m "refactor(web): rename matcherModel* refs to semopsModel*"
```

---

### Task 11: Update documentation

**Files:**
- Modify: `CLAUDE.md` (root)
- Modify: `apps/web/CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md` (repo root)**

In the monorepo table (lines 11–15), change:

```
| `apps/matcher` | Python FastAPI | 2025 | Standalone matcher service |
```

to:

```
| `apps/semops` | Python FastAPI | 2025 | Semantic operators (rank/reason); hosts Conference Matcher jobs |
```

In the "Services" table (around lines 110–116), change:

```
| Matcher | 2025 | Query matching service |
```

to:

```
| Semops | 2025 | Semantic operators (rank + reasons) |
```

In the Environment → Frontend env section (around line 120–126), change:

```
`NEXT_PUBLIC_MATCHER_API_URL` (port 2025)
```

to:

```
`NEXT_PUBLIC_SEMOPS_API_URL` (port 2025; legacy `MATCHER_API_URL` is still accepted via `lib/semops-url.ts` fallback, will be removed after 2026-05-01)
```

- [ ] **Step 2: Update `apps/web/CLAUDE.md`**

Search the file for references to the semops service:

```bash
grep -n "matcher" apps/web/CLAUDE.md
```

For any reference to the *service* (URL, port 2025, Python service), update to `semops`. For any reference to the Conference Matcher *UI* (routes under `/explore/toolbox/matcher`, components under `components/explore/toolbox/matcher/`), leave unchanged — that is the application name and stays.

- [ ] **Step 3: Final grep for any residual service-level refs**

```bash
grep -RIn "apps/matcher\|MATCHER_API_URL" CLAUDE.md apps/web/CLAUDE.md docs/
```

Expected: only historical / fallback mentions inside the spec/plan docs remain.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md apps/web/CLAUDE.md
git commit -m "docs: update CLAUDE.md for apps/matcher -> apps/semops rename"
```

---

### Task 12: Final end-to-end verification

**Files:** none (pure verification)

- [ ] **Step 1: Run the semops test suite**

```bash
cd apps/semops && pytest -v
```

Expected: all tests pass.

- [ ] **Step 2: Type-check web**

```bash
cd apps/web && npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3: Lint web**

```bash
cd apps/web && npm run lint
```

Expected: no new errors vs baseline.

- [ ] **Step 4: Start services and run a live job**

Terminal A:
```bash
cd apps/semops && uvicorn main:app --port 2025
```

Terminal B:
```bash
cd apps/web && npm run dev
```

Terminal C:
```bash
curl -s http://localhost:2025/health
curl -s -X POST http://localhost:2025/api/operators/rank \
  -H 'Content-Type: application/json' \
  -d '{"candidates":[{"id":"1","text":"LLM Agent"}],"text_field":"text","query":"LLM","top_k":1,"include_reasons":false,"model_config":{"provider":"openai","model":"gpt-4o-mini","api_key":"sk-bad"}}' | head -c 300
```

Browser: `http://localhost:3001/en/explore/toolbox/matcher` — complete one small matcher job end-to-end.

Expected:
- `/health` returns OK
- `/api/operators/rank` accepts the schema (returns 5xx due to `sk-bad`, NOT 404/422)
- Conference Matcher UI produces a completed job

- [ ] **Step 5: Stop servers**

Shutdown Terminals A and B. Plan A is complete; Plan B (daily-digest) can now begin against this foundation.

---

# Self-Review Checklist (completed by plan author)

- [x] **Spec coverage:**
  - Spec §4.2 (boundary principle) → Task 3 places SemanticOperators in `services/semantic_operators.py` with no content-type awareness ✓
  - Spec §6.2 new `/api/operators/rank` → Task 5 ✓
  - Spec §6.2 `/api/jobs` unchanged externally → Task 6 regression ✓
  - Spec §9 BYOK via per-request `model_config` → Task 3 implementation uses per-call LM init ✓
  - Spec §10.1 directory + env-var rename → Tasks 7, 8 ✓
  - Spec §10.2 internal refactor → Tasks 3, 4 ✓
  - Spec §10.3 LOTUS per-request scoping → Task 3 serializes via `_LOTUS_LOCK` (Option α) ✓
  - Spec §5.3 `UserSettings` column rename → Tasks 9, 10 ✓
  - Spec §12.1 hand-edited RENAME COLUMN migration → Task 9 Step 3 ✓
  - Spec §12.2 rollout order (semops refactor → rename → digest) → this plan covers steps 1+2; Plan B covers the rest ✓

- [x] **Placeholder scan:** no TODO/TBD/"implement later" entries; every code block is complete.

- [x] **Type consistency:**
  - `ModelConfig` fields (`provider/model/api_key/api_base`) are identical at every call site (Tasks 3, 4, 5) ✓
  - `RankResult` shape (`ranked: list[dict]`, `reasons: Optional[dict[str, str]]`) is matched in route handler (Task 5) and delegation tests (Task 4) ✓
  - `SemanticOperators.rank` signature in Task 3 matches how Task 4 and Task 5 call it ✓
  - Pydantic request field aliased as `model_config` (external) vs `model_cfg` (internal) is consistently handled in Task 5 ✓

---

*Plan generated 2026-04-21 via Superpowers writing-plans. Stored under `docs/superpowers/plans/` (gitignored per project CLAUDE.md rule 4).*
