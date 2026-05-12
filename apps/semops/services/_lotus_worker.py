"""LOTUS worker — runs inside a ProcessPoolExecutor subprocess.

Each subprocess has its OWN copy of `lotus.settings.lm` (module-level global),
so per-request `settings.configure(lm=...)` at entry + reset in `finally` is
safe across concurrent requests: no cross-tenant BYOK leakage possible.

The pool uses `mp_context=spawn` so torch / sentence-transformers / faiss
imports happen fresh in each subprocess (not inherited via fork, which
breaks CUDA context on Linux).
"""

from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)

# Providers whose gateways are signed by a private corp CA the public bundle
# doesn't carry. Mirrors `_build_http_clients` in apps/langgraph/chat_model.py
# (the chat path uses verify=False for these); semops goes through litellm and
# lotus.LM doesn't expose a custom httpx client knob, so we flip litellm's
# module-level ssl_verify flag per-request instead.
_TLS_INSECURE_PROVIDERS = frozenset({"cari-ai4news"})


def init_worker() -> None:
    """Warm-up called once per subprocess at pool creation.

    Imports lotus (which pulls torch / sentence-transformers / faiss) eagerly
    so the first real rank request doesn't pay the 2-5s cold-start cost.
    Also configures the retrieval model (RM) + vector store (VS), which are
    BYOK-independent (deterministic local embedding model) and therefore
    safe to share across requests in the same subprocess. Without this
    sem_index/sem_search raise ``ValueError: The retrieval model must be an
    instance of RM, and the vector store must be an instance of VS``.

    Safe to call repeatedly (idempotent imports).

    Failure mode
    ------------
    A failed warm-up MUST raise. We previously swallowed exceptions here so
    the pool came up "healthy" — but every subsequent request would 401 or
    silently fail at sem_index/sem_search. Failing loud makes corp-network
    HF download timeouts and missing-model misconfigurations diagnosable
    from a single pool-build error in logs, instead of every tenant seeing
    confused errors hours later.

    Override
    --------
    ``SEMOPS_RM_MODEL`` env can override the default ``intfloat/e5-base-v2``.
    The Docker image only bakes the default; any override will fail in
    offline mode (TRANSFORMERS_OFFLINE=1, HF_HUB_OFFLINE=1) unless that
    model is also pre-downloaded into HF_HOME at image build time.

    Test escape hatch
    -----------------
    pytest sets ``PYTEST_CURRENT_TEST`` automatically. When present we skip
    the lotus import + warm-up so pool-mechanics tests can run without
    the heavy LOTUS deps installed. Production never sets this var.
    """
    import os

    if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("SEMOPS_SKIP_WORKER_INIT"):
        logger.info("lotus worker warm-up skipped (pid=%s, test mode)", os.getpid())
        return

    try:
        import lotus  # type: ignore
        from lotus.models import LM, SentenceTransformersRM  # type: ignore  # noqa: F401
        from lotus.vector_store import FaissVS  # type: ignore

        rm_model = os.getenv("SEMOPS_RM_MODEL", "intfloat/e5-base-v2")
        lotus.settings.configure(
            rm=SentenceTransformersRM(model=rm_model),
            vs=FaissVS(),
        )
        logger.info(
            "lotus worker warmed up (pid=%s, rm=%s)", os.getpid(), rm_model
        )
    except Exception:
        # Log + re-raise. A subprocess that can't load the embedding model
        # cannot serve rank requests; better to fail pool build now than
        # produce a "healthy" pool that 401s every tenant.
        logger.exception("lotus worker warm-up failed (pid=%s)", os.getpid())
        raise


def run_rank(
    *,
    lm_config: dict[str, Any],
    candidates: list[dict],
    query_text: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
) -> list[dict]:
    """Execute one rank request inside this subprocess.

    Configures `lotus.settings.lm` with the caller's BYOK at entry; resets
    it to None in `finally` so the subprocess leaves in a clean state even
    if the pipeline raises.

    Exception normalization
    -----------------------
    Provider exceptions (notably ``litellm.AuthenticationError``) often have
    ``__init__`` signatures that require positional args that pickle DOES
    NOT carry — when they cross the pool boundary, the parent process
    crashes with ``BrokenProcessPool`` instead of the real error. We catch
    everything and re-raise as one of the small ``SemopsXxx`` types from
    ``services.errors``, which subclass ``Exception`` with a
    ``__init__(self, message)`` and are therefore guaranteed pickle-safe.

    Tests that need to exercise the worker without the real LOTUS pipeline
    monkeypatch ``services._lotus_worker._default_pipeline`` directly.
    """
    import litellm  # type: ignore
    import lotus  # type: ignore
    from lotus.models import LM  # type: ignore

    from services.errors import (
        SemopsAuthError,
        SemopsBadRequest,
        SemopsError,
        SemopsProviderError,
        SemopsRateLimitError,
    )

    # Every BYOK provider we ship (openai, gemini, deepseek, glm, minimax,
    # kimi, custom-*) is reached through an OpenAI-compatible endpoint —
    # the user's stored `api_base` (or PROVIDER_MAP default) points at one.
    # litellm's native provider prefixes (`gemini/`, `deepseek/`, ...) bypass
    # `api_base` and dispatch through provider-specific SDK paths, and any
    # non-litellm id (`glm`, `minimax`, `kimi`, `custom-*`, user-typed ids
    # like `cari-ai4news`) raises "LLM Provider NOT provided".
    #
    # Whenever an `api_base` is supplied, pin litellm to its OpenAI client
    # by prefixing the model with `openai/`. That keeps every BYOK provider
    # on a single, well-tested path. Without `api_base` (legacy tests only)
    # fall back to the historical `provider/model` form.
    provider = lm_config["provider"]
    model = lm_config["model"]
    api_base = lm_config.get("api_base")

    lm_kwargs: dict[str, Any] = {
        "model": f"openai/{model}" if api_base else f"{provider}/{model}",
        "api_key": lm_config["api_key"],
        "max_batch_size": 5,
        "max_tokens": 4096,
    }
    if api_base:
        lm_kwargs["api_base"] = api_base

    # Per-request TLS toggle for corp-CA providers. litellm reads
    # `litellm.ssl_verify` when it constructs its internal httpx clients on
    # each completion call, so flipping it before LM(...) is built is enough.
    # Captured + restored in `finally` to keep other providers in the same
    # subprocess on normal TLS verification.
    _orig_ssl_verify = getattr(litellm, "ssl_verify", True)
    tls_insecure = provider in _TLS_INSECURE_PROVIDERS
    if tls_insecure:
        litellm.ssl_verify = False

    # Visibility: emit the *resolved* model / api_base on every rank
    # request. Without this, custom-endpoint failures look identical to
    # rate limits in the openai SDK retry loop. Caller's api_key is NOT
    # logged.
    logger.info(
        "lotus rank dispatch (pid=%s, lm_model=%s, api_base=%s, tls_insecure=%s)",
        os.getpid(),
        lm_kwargs["model"],
        api_base or "<none>",
        tls_insecure,
    )

    lotus.settings.configure(lm=LM(**lm_kwargs))
    try:
        try:
            return _default_pipeline(
                candidates=candidates,
                query_text=query_text,
                top_k=top_k,
                search_k=search_k,
                include_reasons=include_reasons,
            )
        except SemopsError:
            # Already normalized — let it propagate as-is.
            raise
        except Exception as exc:  # noqa: BLE001
            # Inspect the exception by class name + message and re-raise as a
            # pickle-safe typed instance. We avoid `isinstance` against
            # provider SDK classes (litellm, openai) so this module does not
            # import them — the worker stays thin.
            cls_name = type(exc).__name__
            msg = str(exc) or cls_name
            lower = f"{cls_name}:{msg}".lower()

            # Log the raw exception class + message before normalization.
            # The lotus pipeline can mask the real error chain (sub-batches
            # surface as ValueError("No content in response: ...") instead
            # of the upstream 4xx) — having the original class name in the
            # log is the only way to tell "auth rejected" apart from
            # "endpoint returned 422 on max_tokens=4096".
            logger.warning(
                "lotus rank failed (lm_model=%s, api_base=%s, exc_cls=%s, exc_msg=%s)",
                lm_kwargs["model"],
                api_base or "<none>",
                cls_name,
                msg[:500],
            )

            if cls_name.endswith("AuthenticationError") or "authenticationerror" in lower:
                raise SemopsAuthError(msg) from None
            if cls_name.endswith("RateLimitError") or "ratelimit" in lower:
                raise SemopsRateLimitError(msg) from None
            if (
                cls_name.endswith("APIConnectionError")
                or cls_name.endswith("APIError")
                or cls_name.endswith("ServiceUnavailableError")
                or cls_name.endswith("InternalServerError")
                or cls_name.endswith("Timeout")
                or cls_name.endswith("TimeoutError")
            ):
                raise SemopsProviderError(f"{cls_name}: {msg}") from None
            if isinstance(exc, ValueError):
                raise SemopsBadRequest(msg) from None

            # Unknown — surface as provider error so the route returns 502
            # rather than masking via the stale ValueError handler.
            raise SemopsProviderError(f"{cls_name}: {msg}") from None
    finally:
        # The reset itself can theoretically raise if lotus state is corrupt.
        # Swallow + log so the worker leaves in as clean a state as possible
        # and the original exception (if any) still propagates.
        try:
            lotus.settings.configure(lm=None)
        except Exception as reset_exc:  # noqa: BLE001
            logger.error(
                "lotus.settings.configure(lm=None) raised during reset (pid=%s): %s",
                os.getpid(),
                reset_exc,
            )
        # Always restore ssl_verify so the next request on this subprocess
        # (which may be a different provider) gets normal TLS verification.
        litellm.ssl_verify = _orig_ssl_verify


def _default_pipeline(
    *,
    candidates: list[dict],
    query_text: str,
    top_k: int,
    search_k: int,
    include_reasons: bool,
) -> list[dict]:
    """Production rank pipeline. Runs inside the worker subprocess.

    Uses the subprocess's own ``lotus.settings`` (configured per-request in
    ``run_rank``) so concurrent tenants never share LM state. Kept in this
    module — not imported from ``services.semantic_operators`` — so the
    subprocess stays thin.

    Index directory hygiene
    -----------------------
    Each request gets its own scratch dir under
    ``$LOTUS_INDEX_DIR/<pid>/<uuid>``. Previously every subprocess +
    every request shared one fixed path (``/tmp/lotus_index``) — concurrent
    FAISS writers contended on the same directory and serialized rank
    work that was supposed to fan out across pool workers (see #155).
    The dir is rmtree'd in a ``finally`` so disk doesn't accumulate
    abandoned indexes, even if the pipeline raises.
    """
    import os
    import shutil
    import uuid

    import pandas as pd  # type: ignore

    base = os.getenv("LOTUS_INDEX_DIR", "/tmp/lotus_index")
    index_dir = os.path.join(base, str(os.getpid()), uuid.uuid4().hex)
    os.makedirs(index_dir, exist_ok=True)

    try:
        df = pd.DataFrame(candidates)
        df = df.sem_index("match_text", index_dir)
        shortlist_df = df.sem_search("match_text", query_text, K=search_k)
        shortlist = shortlist_df.to_dict("records")[:search_k]

        topk_instruction = (
            f"Given the following query:\n{query_text}\n\n"
            f"Rank the items by relevance to this query. "
            f"An item is more relevant if its {{match_text}} directly addresses, "
            f"provides insights into, or offers solutions for the query's needs."
        )
        ranked_df = pd.DataFrame(shortlist).sem_topk(topk_instruction, K=top_k)
        ranked = ranked_df.to_dict("records")[:top_k]

        if include_reasons:
            map_instruction = (
                f"Given the query:\n{query_text}\n\n"
                f"For the item described by: {{match_text}}\n\n"
                f"请用中文写出2-3句简洁的推荐理由，说明为什么该条目与查询相关。要具体说明。"
            )
            mapped_df = pd.DataFrame(ranked).sem_map(map_instruction, suffix="recommendation_reason")
            ranked = mapped_df.to_dict("records")
            for item in ranked:
                if not isinstance(item.get("recommendation_reason"), str) or not item["recommendation_reason"].strip():
                    item["recommendation_reason"] = "相关匹配。"
        else:
            for item in ranked:
                item.pop("recommendation_reason", None)

        return ranked
    finally:
        shutil.rmtree(index_dir, ignore_errors=True)
