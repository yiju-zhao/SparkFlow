"""Unit tests for ``services.semantic_operators.rank`` and the LOTUS worker.

The DI seams (``search_fn``/``topk_fn``/``map_fn``/``pipeline_fn``) were
removed in #154 — production always goes through
``services._lotus_worker.run_rank`` via the per-process pool. These tests
exercise the real production path with a stubbed ``_default_pipeline`` to
keep the suite LOTUS-free.

Higher-level pipeline-shape behavior (top_k slicing, reason-field presence
on the response, empty-candidates rejection at the route level) is covered
in ``test_operators_route.py`` against the FastAPI ``TestClient``.
"""

from __future__ import annotations

import os
import sys
import types
from unittest.mock import MagicMock

import pytest


@pytest.fixture(autouse=True)
def _fake_litellm(monkeypatch):
    """The worker imports ``litellm`` to toggle ``ssl_verify`` per request.
    Production has litellm as a transitive dep of lotus-ai; the test env
    keeps lotus stubbed and so doesn't carry litellm either. Inject a
    minimal stand-in with a real (mutable) ``ssl_verify`` attr so the
    worker's read-modify-restore is observable.
    """
    fake = types.SimpleNamespace(ssl_verify=True)
    monkeypatch.setitem(sys.modules, "litellm", fake)
    return fake


# ---------------------------------------------------------------------------
# Module-level rank() — input validation
# ---------------------------------------------------------------------------


def test_rank_rejects_empty_candidates():
    """Empty candidate list raises ValueError before any pool dispatch."""
    from services.semantic_operators import rank

    with pytest.raises(ValueError, match="non-empty"):
        rank(
            candidates=[],
            query_text="anything",
            top_k=5,
            search_k=5,
            include_reasons=False,
            lm_config={
                "provider": "openai",
                "model": "gpt-4o-mini",
                "api_key": "sk-test",
            },
        )


def test_rank_rejects_missing_lm_config():
    """``lm_config`` is required — there is no admin/env fallback."""
    from services.semantic_operators import rank

    with pytest.raises(ValueError, match="lm_config"):
        rank(
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=5,
            include_reasons=False,
            lm_config=None,
        )


# ---------------------------------------------------------------------------
# run_rank — LOTUS configuration ceremony
# ---------------------------------------------------------------------------


def _install_fake_lotus(monkeypatch, calls: list | None = None):
    """Install a fake ``lotus`` + ``lotus.models`` into ``sys.modules``.

    The fake ``litellm`` is supplied by the autouse ``_fake_litellm``
    fixture above. Tests inspect ``calls`` (if passed) to verify the
    ``configure(lm=...)`` ceremony fired in the right order.
    """
    fake_settings = MagicMock()
    if calls is not None:
        fake_settings.configure = MagicMock(
            side_effect=lambda **kw: calls.append(("configure", kw))
        )
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings

    if calls is not None:
        class FakeLM:
            def __init__(self, **kw):
                calls.append(("LM", kw))
    else:
        FakeLM = MagicMock(return_value="FAKE_LM")  # type: ignore[assignment]

    fake_models = MagicMock()
    fake_models.LM = FakeLM

    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)


def test_run_rank_configures_lotus_and_resets(monkeypatch):
    """run_rank must configure lotus.settings.lm at entry and clear it in finally."""
    calls: list = []
    _install_fake_lotus(monkeypatch, calls)

    from services import _lotus_worker
    from services._lotus_worker import run_rank

    def fake_pipeline(*, candidates, query_text, top_k, search_k, include_reasons):
        calls.append(("pipeline", len(candidates), query_text))
        return [{"id": "x", "recommendation_reason": "ok"}]

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", fake_pipeline)

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
    last_cfg = len(order) - 1 - order[::-1].index("configure")
    assert first_cfg < pipe_idx < last_cfg

    assert result == [{"id": "x", "recommendation_reason": "ok"}]


def test_run_rank_routes_custom_provider_through_openai_with_api_base(monkeypatch):
    """Custom / non-litellm providers (e.g. ``cari-ai4news``, ``minimax``,
    ``custom-…``) must be pinned to litellm's ``openai/`` prefix when an
    ``api_base`` is supplied — otherwise litellm raises
    ``BadRequestError: LLM Provider NOT provided``.
    """
    calls: list = []
    _install_fake_lotus(monkeypatch, calls)

    from services import _lotus_worker
    from services._lotus_worker import run_rank

    monkeypatch.setattr(
        _lotus_worker, "_default_pipeline", lambda **_: [{"id": "a"}]
    )

    run_rank(
        lm_config={
            "provider": "cari-ai4news",
            "model": "MiniMaxAI/MiniMax-M2.5",
            "api_key": "sk-test",
            "api_base": "https://ai4news.example.com/v1",
        },
        candidates=[{"id": "a", "match_text": "x"}],
        query_text="q",
        top_k=5,
        search_k=20,
        include_reasons=False,
    )

    lm_calls = [c for c in calls if c[0] == "LM"]
    assert len(lm_calls) == 1
    # The non-litellm provider id is replaced by the ``openai/`` prefix so
    # litellm dispatches through its OpenAI-compatible client. The original
    # model path (including any slashes like ``MiniMaxAI/...``) is preserved
    # verbatim after the prefix.
    assert lm_calls[0][1]["model"] == "openai/MiniMaxAI/MiniMax-M2.5"
    assert lm_calls[0][1]["api_base"] == "https://ai4news.example.com/v1"
    assert lm_calls[0][1]["api_key"] == "sk-test"


def test_run_rank_disables_ssl_verify_for_cari_ai4news(monkeypatch, _fake_litellm):
    """``cari-ai4news`` is signed by Huawei BPIT Root CA which no public bundle
    ships. The worker flips ``litellm.ssl_verify=False`` for the duration of
    the request and restores it after, matching the chat path's verify=False.
    """
    _install_fake_lotus(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank

    observed: dict = {}

    def capture_then_succeed(**_):
        observed["ssl_verify_during_call"] = _fake_litellm.ssl_verify
        return [{"id": "a"}]

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", capture_then_succeed)

    assert _fake_litellm.ssl_verify is True  # baseline
    run_rank(
        lm_config={
            "provider": "cari-ai4news",
            "model": "MiniMaxAI/MiniMax-M2.5",
            "api_key": "sk-test",
            "api_base": "https://ai4news.example.com/v1",
        },
        candidates=[{"id": "a", "match_text": "x"}],
        query_text="q",
        top_k=5,
        search_k=20,
        include_reasons=False,
    )

    assert observed["ssl_verify_during_call"] is False
    # Restored after the call returns so other providers on this subprocess
    # keep their normal TLS verification.
    assert _fake_litellm.ssl_verify is True


def test_run_rank_leaves_ssl_verify_untouched_for_regular_providers(
    monkeypatch, _fake_litellm
):
    """Public-CA providers like ``openai`` must keep ``ssl_verify`` at its
    original value through the entire request — toggling it off would silently
    weaken TLS for every other tenant in the same subprocess.
    """
    _install_fake_lotus(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank

    observed: dict = {}

    def capture_then_succeed(**_):
        observed["ssl_verify_during_call"] = _fake_litellm.ssl_verify
        return [{"id": "a"}]

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", capture_then_succeed)

    _fake_litellm.ssl_verify = "sentinel"  # any non-False, non-True value
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
    )

    assert observed["ssl_verify_during_call"] == "sentinel"
    assert _fake_litellm.ssl_verify == "sentinel"


def test_run_rank_restores_ssl_verify_on_pipeline_exception(monkeypatch, _fake_litellm):
    """If the rank pipeline raises while ``ssl_verify`` is flipped, the finally
    block must still restore it — otherwise the next request reusing this
    subprocess (potentially a different tenant / provider) would inherit
    weakened TLS verification.
    """
    _install_fake_lotus(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsProviderError

    def boom(**_):
        raise RuntimeError("upstream exploded")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom)

    assert _fake_litellm.ssl_verify is True
    with pytest.raises(SemopsProviderError):
        run_rank(
            lm_config={
                "provider": "cari-ai4news",
                "model": "m",
                "api_key": "sk-test",
                "api_base": "https://ai4news.example.com/v1",
            },
            candidates=[{"id": "a", "match_text": "x"}],
            query_text="q",
            top_k=5,
            search_k=20,
            include_reasons=False,
        )

    assert _fake_litellm.ssl_verify is True


def test_run_rank_resets_lotus_on_pipeline_exception(monkeypatch):
    """Even when the pipeline raises, the finally block resets lotus.settings.lm=None.

    A bare ``RuntimeError`` from the pipeline surfaces as
    ``SemopsProviderError`` thanks to the worker's normalization layer.
    """
    configure_calls: list = []

    fake_settings = MagicMock()
    fake_settings.configure = MagicMock(
        side_effect=lambda **kw: configure_calls.append(kw)
    )
    fake_lotus = MagicMock()
    fake_lotus.settings = fake_settings
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsProviderError

    def boom(**_kw):
        raise RuntimeError("pipeline explosion")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom)

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
        )

    assert len(configure_calls) == 2
    assert configure_calls[0].get("lm") is not None
    assert configure_calls[1].get("lm") is None


def test_run_rank_swallows_exception_during_reset(monkeypatch, caplog):
    """If lotus.settings.configure(lm=None) itself raises during reset, run_rank
    logs the error but does not propagate it (the original pipeline result or
    exception takes precedence)."""
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

    from services import _lotus_worker
    from services._lotus_worker import run_rank

    monkeypatch.setattr(
        _lotus_worker, "_default_pipeline", lambda **_: [{"id": "a"}]
    )

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
    )

    assert result == [{"id": "a"}]
    error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert any(
        "reset boom" in r.getMessage() or "raised during reset" in r.getMessage()
        for r in error_records
    )


# ---------------------------------------------------------------------------
# Pool-level behavior (unchanged from #158)
# ---------------------------------------------------------------------------


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

    _pool.shutdown_pool()
    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "2")

    with pytest.raises(RuntimeError, match="worker exploded"):
        _pool.run_in_pool(_raise_for_pool_test)

    assert _pool.run_in_pool(_peace_for_pool_test) == "ok"

    _pool.shutdown_pool()


def _raise_for_pool_test():
    raise RuntimeError("worker exploded")


def _peace_for_pool_test():
    return "ok"


# ---------------------------------------------------------------------------
# Issue #151 — semops industrial hardening (exception normalization)
# ---------------------------------------------------------------------------


def _setup_fake_lotus_for_normalization(monkeypatch):
    """Install fake lotus modules so ``run_rank`` does not actually import lotus."""
    fake_lotus = MagicMock()
    fake_lotus.settings = MagicMock()
    fake_models = MagicMock()
    fake_models.LM = MagicMock(return_value="FAKE_LM")
    monkeypatch.setitem(sys.modules, "lotus", fake_lotus)
    monkeypatch.setitem(sys.modules, "lotus.models", fake_models)


def test_run_rank_normalizes_litellm_authentication_error(monkeypatch):
    """run_rank must re-raise litellm-shaped AuthenticationError as SemopsAuthError."""
    _setup_fake_lotus_for_normalization(monkeypatch)

    class FakeAuthenticationError(Exception):
        """Simulates litellm.AuthenticationError by name suffix."""

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsAuthError

    def boom_auth(**_kw):
        raise FakeAuthenticationError("provider rejected the api key")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom_auth)

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
        )


def test_run_rank_normalizes_rate_limit_error(monkeypatch):
    """RateLimitError-shaped exceptions become SemopsRateLimitError."""
    _setup_fake_lotus_for_normalization(monkeypatch)

    class FakeRateLimitError(Exception):
        pass

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsRateLimitError

    def boom_rate(**_kw):
        raise FakeRateLimitError("429 too many requests")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom_rate)

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
        )


def test_run_rank_normalizes_value_error_to_bad_request(monkeypatch):
    """ValueError from the pipeline becomes SemopsBadRequest."""
    _setup_fake_lotus_for_normalization(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsBadRequest

    def boom_value(**_kw):
        raise ValueError("malformed candidate row 3")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom_value)

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
        )


def test_run_rank_normalizes_unknown_to_provider_error(monkeypatch):
    """Unknown exception types become SemopsProviderError (502-equivalent)."""
    _setup_fake_lotus_for_normalization(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsProviderError

    def boom_unknown(**_kw):
        raise RuntimeError("upstream went sideways")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom_unknown)

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
        )


def test_run_rank_passes_through_already_normalized_errors(monkeypatch):
    """If the pipeline already raises a SemopsXxx, it must propagate as-is."""
    _setup_fake_lotus_for_normalization(monkeypatch)

    from services import _lotus_worker
    from services._lotus_worker import run_rank
    from services.errors import SemopsRateLimitError

    def boom_already(**_kw):
        raise SemopsRateLimitError("provider says 429")

    monkeypatch.setattr(_lotus_worker, "_default_pipeline", boom_already)

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
        )


def test_semops_errors_are_pickle_safe():
    """SemopsXxx instances must round-trip through pickle without losing data."""
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
    """run_in_pool must NOT shut down the pool on ordinary task exceptions."""
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "2")
    _pool.shutdown_pool()

    pool_before = _pool.get_pool()
    assert pool_before is not None

    with pytest.raises(ValueError, match="bad input"):
        _pool.run_in_pool(_raise_value_error_for_pool_test)

    pool_after = _pool.get_pool()
    assert pool_after is pool_before, (
        "Pool was rebuilt on ValueError, which would cancel other tenants' "
        "in-flight requests"
    )

    assert _pool.run_in_pool(_peace_for_pool_test) == "ok"

    _pool.shutdown_pool()


def _raise_value_error_for_pool_test():
    raise ValueError("bad input")


# ---------------------------------------------------------------------------
# Issue #155 — SEMOPS_RANK_POOL_SIZE fail-loud parsing
# ---------------------------------------------------------------------------


def test_pool_size_fails_loud_on_unparseable_env(monkeypatch):
    """A typo'd SEMOPS_RANK_POOL_SIZE must raise, not silently fall back.

    Python's ``int()`` is lenient about leading/trailing whitespace, so we
    pick a clearly-bad value (alpha) to exercise the fail-loud branch.
    """
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "four")
    with pytest.raises(ValueError, match="positive integer"):
        _pool._pool_size()


def test_pool_size_fails_loud_on_non_positive(monkeypatch):
    """Zero / negative values must raise, not silently fall back."""
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "0")
    with pytest.raises(ValueError, match="positive integer"):
        _pool._pool_size()


def test_pool_size_unset_uses_default(monkeypatch):
    """An unset env still resolves to the default (no exception)."""
    from services import _pool

    monkeypatch.delenv("SEMOPS_RANK_POOL_SIZE", raising=False)
    assert _pool._pool_size() == min(4, os.cpu_count() or 1)


def test_pool_size_empty_string_uses_default(monkeypatch):
    """Empty string env (e.g. unset shell var that still expanded) → default."""
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "")
    assert _pool._pool_size() == min(4, os.cpu_count() or 1)


def test_pool_size_valid_positive_int(monkeypatch):
    """Well-formed positive int still works."""
    from services import _pool

    monkeypatch.setenv("SEMOPS_RANK_POOL_SIZE", "8")
    assert _pool._pool_size() == 8
