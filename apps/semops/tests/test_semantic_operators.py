"""Failing tests defining the SemanticOperators.rank contract (Task 2 of refactor).

These tests intentionally fail today: ``services.semantic_operators`` does not
exist yet. Task 3 will create it to satisfy this contract.

Design choice — Strategy B (dependency injection)
-------------------------------------------------
LOTUS makes real LLM + embedding calls, so tests must not import or execute it.
Rather than monkeypatching ``lotus`` globally (Strategy A), ``SemanticOperators``
is designed so its three LOTUS ops are **injected** at construction time:

    SemanticOperators(
        configured_lm=None,          # optional, for real-LLM usage
        search_fn=fake_search,        # (candidates, query, k) -> list[dict]
        topk_fn=fake_topk,            # (candidates, query, k) -> list[dict]
        map_fn=fake_map,              # (candidates, query) -> list[dict] with 'recommendation_reason'
    )

Each injected callable takes the candidate list and returns a transformed list
(same element shape: dicts with at least ``id`` and ``match_text``). The default
value for each `*_fn` should wire up the real LOTUS pipeline (sem_search /
sem_topk / sem_map over a pandas DataFrame internally), so production code can
instantiate ``SemanticOperators()`` with no args and get real behavior.

Task 3's implementer: if you pick Strategy A (patch ``lotus`` inside the module)
instead, you must update these tests to match. The tests were deliberately
written against the DI seams so they remain LOTUS-free regardless.

Contract reminder (from Task 2 brief)
-------------------------------------
``rank(*, candidates, query_text, top_k=50, search_k=350, include_reasons=True)``
returns a list of up to ``top_k`` dicts, each echoing input fields (``id``,
``match_text``, ...) plus — when ``include_reasons=True`` — a non-empty string
``recommendation_reason``. Order is by descending relevance. Empty candidates
list raises ``ValueError``.
"""

from __future__ import annotations

import pytest


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def rank_candidates():
    """Candidates shaped as the SemanticOperators contract expects (`match_text`).

    The root ``sample_candidates`` fixture uses key ``text`` (legacy WeChat
    shape). The contract for ``SemanticOperators.rank`` requires ``match_text``,
    matching what ``LotusMatcher.build_text_column`` produces. We keep this
    fixture local so the two shapes don't conflict.
    """
    return [
        {"id": "a1", "match_text": "LLM agent in enterprise legal: four case studies"},
        {"id": "a2", "match_text": "Diffusion for video generation: DiT architecture"},
        {"id": "a3", "match_text": "Cooking pasta: five easy recipes"},
        {"id": "a4", "match_text": "Retrieval-augmented generation for internal search"},
        {"id": "a5", "match_text": "Fine-tuning small LMs on customer support logs"},
    ]


@pytest.fixture
def fake_lotus_ops():
    """Deterministic stand-ins for (search_fn, topk_fn, map_fn).

    - search_fn: returns the first ``k`` candidates unchanged
    - topk_fn: returns the first ``k`` candidates unchanged (no reordering)
    - map_fn: attaches ``recommendation_reason`` to each candidate
    """

    def search_fn(candidates, query, k):
        return list(candidates)[:k]

    def topk_fn(candidates, query, k):
        return list(candidates)[:k]

    def map_fn(candidates, query):
        out = []
        for c in candidates:
            enriched = dict(c)
            enriched["recommendation_reason"] = (
                f"Relevant to query '{query}': matches {c.get('id')}."
            )
            out.append(enriched)
        return out

    return {"search_fn": search_fn, "topk_fn": topk_fn, "map_fn": map_fn}


# ---------------------------------------------------------------------------
# Tests — all expected to fail today with ImportError until Task 3 lands.
# ---------------------------------------------------------------------------


def test_rank_is_importable():
    """SemanticOperators must be importable and instantiable with no args."""
    from services.semantic_operators import SemanticOperators  # noqa: F401

    ops = SemanticOperators()
    assert ops is not None


def test_rank_returns_at_most_top_k(rank_candidates, fake_lotus_ops):
    """With 5 candidates and top_k=3, result length must not exceed 3."""
    from services.semantic_operators import SemanticOperators

    ops = SemanticOperators(**fake_lotus_ops)
    result = ops.rank(
        candidates=rank_candidates,
        query_text="LLM agents in enterprise",
        top_k=3,
        search_k=5,
        include_reasons=False,
    )
    assert isinstance(result, list)
    assert len(result) <= 3


def test_rank_preserves_candidate_ids(rank_candidates, fake_lotus_ops):
    """Every returned id must come from the input candidates — no synthetic ids."""
    from services.semantic_operators import SemanticOperators

    ops = SemanticOperators(**fake_lotus_ops)
    result = ops.rank(
        candidates=rank_candidates,
        query_text="LLM agents in enterprise",
        top_k=5,
        search_k=5,
        include_reasons=False,
    )
    input_ids = {c["id"] for c in rank_candidates}
    returned_ids = {r["id"] for r in result}
    assert returned_ids.issubset(input_ids)
    assert len(returned_ids) == len(result), "result ids must be unique"


def test_rank_with_reasons_attaches_reason_field(rank_candidates, fake_lotus_ops):
    """include_reasons=True → every result has a non-empty recommendation_reason string."""
    from services.semantic_operators import SemanticOperators

    ops = SemanticOperators(**fake_lotus_ops)
    result = ops.rank(
        candidates=rank_candidates,
        query_text="LLM agents in enterprise",
        top_k=3,
        search_k=5,
        include_reasons=True,
    )
    assert len(result) > 0
    for item in result:
        assert "recommendation_reason" in item
        reason = item["recommendation_reason"]
        assert isinstance(reason, str)
        assert reason.strip() != ""


def test_rank_without_reasons_omits_reason_field(rank_candidates, fake_lotus_ops):
    """include_reasons=False → no 'recommendation_reason' key in any result."""
    from services.semantic_operators import SemanticOperators

    ops = SemanticOperators(**fake_lotus_ops)
    result = ops.rank(
        candidates=rank_candidates,
        query_text="LLM agents in enterprise",
        top_k=3,
        search_k=5,
        include_reasons=False,
    )
    assert len(result) > 0
    for item in result:
        assert "recommendation_reason" not in item


def test_rank_handles_fewer_candidates_than_top_k(fake_lotus_ops):
    """If candidates < top_k, rank returns len(candidates), not top_k."""
    from services.semantic_operators import SemanticOperators

    candidates = [
        {"id": "x1", "match_text": "alpha"},
        {"id": "x2", "match_text": "beta"},
    ]
    ops = SemanticOperators(**fake_lotus_ops)
    result = ops.rank(
        candidates=candidates,
        query_text="any",
        top_k=10,
        search_k=10,
        include_reasons=False,
    )
    assert len(result) == 2


def test_rank_rejects_empty_candidates(fake_lotus_ops):
    """Empty candidate list must raise ValueError — contract decision."""
    from services.semantic_operators import SemanticOperators

    ops = SemanticOperators(**fake_lotus_ops)
    with pytest.raises(ValueError):
        ops.rank(
            candidates=[],
            query_text="anything",
            top_k=5,
            search_k=5,
            include_reasons=False,
        )


def test_run_rank_configures_lotus_and_resets(monkeypatch):
    """run_rank must configure lotus.settings.lm at entry and clear it in finally."""
    import sys
    from unittest.mock import MagicMock

    calls: list = []

    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(side_effect=lambda **kw: calls.append(("configure", kw)))
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings

    class FakeLM:
        def __init__(self, **kw):
            calls.append(("LM", kw))

    fake_models = MagicMock()
    fake_models.LM = FakeLM

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank

    def fake_pipeline(candidates, query_text, top_k, search_k, include_reasons):
        calls.append(("pipeline", len(candidates), query_text))
        return [{"id": "x", "recommendation_reason": "ok"}]

    result = run_rank(
        lm_config={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "sk-test",
            "api_base": None,
        },
        candidates=[{"id": "a", "match_text": "x"}],
        query_text="q",
        top_k=5,
        search_k=20,
        include_reasons=True,
        pipeline_fn=fake_pipeline,
    )

    lm_calls = [c for c in calls if c[0] == "LM"]
    assert len(lm_calls) == 1
    assert lm_calls[0][1]["model"] == "openai/gpt-4o-mini"
    assert lm_calls[0][1]["api_key"] == "sk-test"

    configure_calls = [c for c in calls if c[0] == "configure"]
    assert len(configure_calls) == 2
    assert configure_calls[0][1].get("lm") is not None
    assert configure_calls[1][1].get("lm") is None

    pipeline_calls = [c for c in calls if c[0] == "pipeline"]
    assert len(pipeline_calls) == 1

    # Order: first configure → pipeline → second configure (finally).
    order = [c[0] for c in calls]
    first_cfg = order.index("configure")
    pipe_idx = order.index("pipeline")
    # The LAST configure must come after the pipeline.
    last_cfg = len(order) - 1 - order[::-1].index("configure")
    assert first_cfg < pipe_idx < last_cfg

    assert result == [{"id": "x", "recommendation_reason": "ok"}]


def test_run_rank_resets_lotus_on_pipeline_exception(monkeypatch):
    """Even when the pipeline raises, the finally block must reset lotus.settings.lm=None.

    Note: as of Issue #151, ``run_rank`` normalizes raw provider exceptions
    into ``SemopsXxx`` types before returning. A bare ``RuntimeError`` now
    surfaces as ``SemopsProviderError``. This test's PRIMARY assertion is
    the finally-block reset, which must fire regardless of normalization.
    """
    import sys
    from unittest.mock import MagicMock

    configure_calls: list = []
    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(side_effect=lambda **kw: configure_calls.append(kw))
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank
    from services.errors import SemopsProviderError

    def boom(**_kw):
        raise RuntimeError("pipeline explosion")

    import pytest
    with pytest.raises(SemopsProviderError, match="pipeline explosion"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=True,
            pipeline_fn=boom,
        )

    assert len(configure_calls) == 2
    assert configure_calls[0].get("lm") is not None
    assert configure_calls[1].get("lm") is None


def test_run_rank_swallows_exception_during_reset(monkeypatch, caplog):
    """If lotus.settings.configure(lm=None) itself raises during reset, run_rank
    logs the error but does not propagate it (the original pipeline result or
    exception takes precedence)."""
    import sys
    from unittest.mock import MagicMock
    import logging

    reset_error = RuntimeError("reset boom")

    def fake_configure(**kw):
        if kw.get("lm") is None:
            raise reset_error
        # first (entry) configure call succeeds

    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(side_effect=fake_configure)
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank

    caplog.set_level(logging.ERROR, logger="services._lotus_worker")
    result = run_rank(
        lm_config={
            "provider": "openai",
            "model": "gpt-4o-mini",
            "api_key": "sk-test",
            "api_base": None,
        },
        candidates=[{"id": "a", "match_text": "x"}],
        query_text="q",
        top_k=5,
        search_k=20,
        include_reasons=False,
        pipeline_fn=lambda **_: [{"id": "a"}],
    )

    # Pipeline result was preserved — reset failure was swallowed.
    assert result == [{"id": "a"}]
    # The reset exception was logged at ERROR level.
    error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("reset boom" in r.getMessage() or "raised during reset" in r.getMessage() for r in error_records)


def test_pool_rebuilds_after_worker_exception(monkeypatch):
    """A task that raises must not poison the pool — subsequent tasks see a working executor.

    Note: with the narrowed pool-rebuild trigger (Issue #151), the pool is
    NOT actually rebuilt on plain ``RuntimeError`` — it stays alive. The
    follow-up assertion that the next submission succeeds therefore proves
    the live pool still serves requests, not that a rebuild happened.
    See ``test_run_in_pool_does_not_rebuild_on_value_error`` for the
    explicit "no rebuild" contract.
    """
    from services import _pool

    # Force a fresh pool state so the assertion holds regardless of test ordering.
    _pool.shutdown_pool()

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "2")

    import pytest
    with pytest.raises(RuntimeError, match="worker exploded"):
        _pool.run_in_pool(_raise_for_pool_test)

    # After a raise, the next submission succeeds — pool still works.
    assert _pool.run_in_pool(_peace_for_pool_test) == "ok"

    _pool.shutdown_pool()


def _raise_for_pool_test():
    raise RuntimeError("worker exploded")


def _peace_for_pool_test():
    return "ok"


# ---------------------------------------------------------------------------
# Issue #151 — semops industrial hardening
# ---------------------------------------------------------------------------


def test_run_rank_normalizes_litellm_authentication_error(monkeypatch):
    """run_rank must re-raise litellm-shaped AuthenticationError as SemopsAuthError.

    The DI seam (``pipeline_fn``) lets us simulate a provider error without
    touching litellm. We use a fake exception class whose name ends with
    ``AuthenticationError`` — the worker's normalization key — to prove the
    heuristic. The point of this test is the type translation: the parent
    process must receive ``SemopsAuthError``, NOT ``BrokenProcessPool`` and
    NOT the raw provider class (which may unpickle-crash).
    """
    import sys
    from unittest.mock import MagicMock

    fake_settings = MagicMock()
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    class FakeAuthenticationError(Exception):
        """Simulates litellm.AuthenticationError by name suffix."""

    from services._lotus_worker import run_rank
    from services.errors import SemopsAuthError

    def boom_auth(**_kw):
        raise FakeAuthenticationError("provider rejected the api key")

    import pytest
    with pytest.raises(SemopsAuthError, match="provider rejected"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-bogus",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
            pipeline_fn=boom_auth,
        )


def test_run_rank_normalizes_rate_limit_error(monkeypatch):
    """RateLimitError-shaped exceptions become SemopsRateLimitError."""
    import sys
    from unittest.mock import MagicMock

    fake_lotus = MagicMock()
    fake_lotus.settings = MagicMock()
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    class FakeRateLimitError(Exception):
        pass

    from services._lotus_worker import run_rank
    from services.errors import SemopsRateLimitError

    def boom_rate(**_kw):
        raise FakeRateLimitError("429 too many requests")

    import pytest
    with pytest.raises(SemopsRateLimitError, match="429"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
            pipeline_fn=boom_rate,
        )


def test_run_rank_normalizes_value_error_to_bad_request(monkeypatch):
    """ValueError from the pipeline becomes SemopsBadRequest.

    Lotus raises ValueError for malformed candidates / unconfigured RM/VS.
    Translating to ``SemopsBadRequest`` lets the route return 400 cleanly
    while staying out of the ValueError backstop path.
    """
    import sys
    from unittest.mock import MagicMock

    fake_lotus = MagicMock()
    fake_lotus.settings = MagicMock()
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank
    from services.errors import SemopsBadRequest

    def boom_value(**_kw):
        raise ValueError("malformed candidate row 3")

    import pytest
    with pytest.raises(SemopsBadRequest, match="malformed candidate"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
            pipeline_fn=boom_value,
        )


def test_run_rank_normalizes_unknown_to_provider_error(monkeypatch):
    """Unknown exception types become SemopsProviderError (502-equivalent)."""
    import sys
    from unittest.mock import MagicMock

    fake_lotus = MagicMock()
    fake_lotus.settings = MagicMock()
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank
    from services.errors import SemopsProviderError

    def boom_unknown(**_kw):
        raise RuntimeError("upstream went sideways")

    import pytest
    with pytest.raises(SemopsProviderError, match="upstream went sideways"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
            pipeline_fn=boom_unknown,
        )


def test_run_rank_passes_through_already_normalized_errors(monkeypatch):
    """If the pipeline already raises a SemopsXxx, it must propagate as-is.

    This guards the future case where deeper code in the pipeline already
    knows how to classify an error — we should not re-classify it.
    """
    import sys
    from unittest.mock import MagicMock

    fake_lotus = MagicMock()
    fake_lotus.settings = MagicMock()
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services._lotus_worker import run_rank
    from services.errors import SemopsRateLimitError

    def boom_already(**_kw):
        raise SemopsRateLimitError("provider says 429")

    import pytest
    with pytest.raises(SemopsRateLimitError, match="provider says 429"):
        run_rank(
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
                "api_base": None,
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
            pipeline_fn=boom_already,
        )


def test_semops_errors_are_pickle_safe():
    """SemopsXxx instances must round-trip through pickle without losing data.

    This is the whole point of the new exception types: they cross the
    pool boundary without crashing on unpickle. ``__init__(self, message)``
    + a single ``.message`` attribute is the contract.
    """
    import pickle

    from services.errors import (
        SemopsAuthError,
        SemopsBadRequest,
        SemopsError,
        SemopsProviderError,
        SemopsRateLimitError,
    )

    for cls in (
        SemopsError,
        SemopsAuthError,
        SemopsRateLimitError,
        SemopsProviderError,
        SemopsBadRequest,
    ):
        original = cls("hello world")
        round_tripped = pickle.loads(pickle.dumps(original))
        assert isinstance(round_tripped, cls)
        assert str(round_tripped) == "hello world"
        assert round_tripped.message == "hello world"


def test_run_in_pool_does_not_rebuild_on_value_error(monkeypatch):
    """run_in_pool must NOT shut down the pool on ordinary task exceptions.

    Cross-tenant blast radius matters: one tenant's bad input cannot
    cancel every other in-flight request. The pool is rebuilt ONLY when
    the executor itself is broken.
    """
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "2")
    _pool.shutdown_pool()

    # Get the live pool object and remember its identity.
    pool_before = _pool.get_pool()
    assert pool_before is not None

    import pytest
    with pytest.raises(ValueError, match="bad input"):
        _pool.run_in_pool(_raise_value_error_for_pool_test)

    # Pool must be the same instance — no rebuild happened.
    pool_after = _pool.get_pool()
    assert pool_after is pool_before, (
        "Pool was rebuilt on ValueError, which would cancel other tenants' "
        "in-flight requests"
    )

    # And it still serves requests.
    assert _pool.run_in_pool(_peace_for_pool_test) == "ok"

    _pool.shutdown_pool()


def _raise_value_error_for_pool_test():
    raise ValueError("bad input")
