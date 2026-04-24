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
    """Even when the pipeline raises, the finally block must reset lotus.settings.lm=None."""
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

    def boom(**_kw):
        raise RuntimeError("pipeline explosion")

    import pytest
    with pytest.raises(RuntimeError, match="pipeline explosion"):
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
