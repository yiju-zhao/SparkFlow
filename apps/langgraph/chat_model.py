"""init_chat_model wrapper that resolves SparkFlow's BYOK provider IDs.

SparkFlow exposes several provider IDs in the BYOK settings UI that
langchain's `init_chat_model` does not natively recognise. They are all
OpenAI-compatible HTTP endpoints, so we route them through the openai
class with a `base_url` override. Custom endpoints (id prefix `custom-`,
or the legacy `custom` id) do the same.

Frontend ID -> langchain provider mapping:
    openai           -> openai           (native)
    deepseek         -> deepseek         (native)
    gemini           -> google_genai     (alias)
    glm              -> openai + base_url
    minimax          -> openai + base_url
    kimi             -> openai + base_url
    cari-ai4news     -> openai + base_url
    custom / custom-*-> openai + base_url

Keep `_OPENAI_COMPAT_BASE_URLS` in sync with PROVIDERS in
`apps/web/lib/types/providers.ts`. Callers should still prefer to pass
`api_base` explicitly (resolved from the user's BYOK record) — the map
is only a fallback when the caller didn't.
"""

from __future__ import annotations

from langchain.chat_models import init_chat_model
from langchain_core.language_models.chat_models import BaseChatModel

_PROVIDER_ALIASES: dict[str, str] = {
    "gemini": "google_genai",
}

_OPENAI_COMPAT_BASE_URLS: dict[str, str] = {
    "glm": "https://open.bigmodel.cn/api/paas/v4",
    "minimax": "https://api.minimax.chat/v1",
    "kimi": "https://api.moonshot.cn/v1",
    "cari-ai4news": "https://ai4news.rnd.huawei.com/model/v1",
}


def _is_openai_compatible(provider: str) -> bool:
    return (
        provider in _OPENAI_COMPAT_BASE_URLS
        or provider == "custom"
        or provider.startswith("custom-")
    )


def init_byok_chat_model(
    *,
    provider: str,
    model: str,
    api_key: str,
    api_base: str | None = None,
) -> BaseChatModel:
    """Build a langchain chat model for a SparkFlow BYOK provider."""
    if _is_openai_compatible(provider):
        base_url = api_base or _OPENAI_COMPAT_BASE_URLS.get(provider)
        if not base_url:
            raise ValueError(
                f"OpenAI-compatible provider {provider!r} requires base_url"
            )
        return init_chat_model(f"openai:{model}", api_key=api_key, base_url=base_url)
    aliased = _PROVIDER_ALIASES.get(provider, provider)
    kwargs: dict = {"api_key": api_key}
    if api_base:
        kwargs["base_url"] = api_base
    return init_chat_model(f"{aliased}:{model}", **kwargs)
