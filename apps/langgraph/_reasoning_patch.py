"""Monkey-patch langchain-openai so DeepSeek's reasoning_content roundtrips.

DeepSeek's thinking-mode API requires that prior assistant turns carry
their `reasoning_content` on every continuation request — see
https://api-docs.deepseek.com/guides/thinking_mode. ChatDeepSeek captures
the field into AIMessage.additional_kwargs on inbound responses (see
langchain_deepseek.chat_models lines ~315-327), but
langchain-openai's `_convert_message_to_dict` only extracts a small
whitelist of keys (`name`, `tool_calls`, `function_call`, `audio`) from
additional_kwargs — `reasoning_content` is dropped during serialization.
The second turn of any multi-turn conversation (especially after a tool
call) then 400s with `Missing reasoning_content field in the assistant
message` or `The reasoning_content in the thinking mode must be passed
back to the API`.

Upstream tracking: https://github.com/langchain-ai/langchain/issues/34166.
Until that lands, wrap the converter so AIMessages with
additional_kwargs.reasoning_content carry that field into the outgoing
payload. Idempotent (safe to import multiple times). No-op for messages
without reasoning_content, so non-DeepSeek providers and DeepSeek's
non-thinking models (deepseek-chat) are unaffected.
"""

from __future__ import annotations

from langchain_core.messages import AIMessage
from langchain_openai.chat_models import base as _openai_base

_PATCH_FLAG = "_sparkflow_reasoning_content_patched"
# Stash the original on the langchain module itself so module reloads
# resolve "orig" from the langchain attribute (still the real original)
# rather than re-reading the already-patched module-level binding (which
# would make the wrapper recurse into itself).
_ORIG_ATTR = "_sparkflow_reasoning_content_orig"


def _patched_convert_message_to_dict(message, api="chat/completions"):
    orig = getattr(_openai_base, _ORIG_ATTR)
    payload = orig(message, api=api)
    if isinstance(message, AIMessage):
        rc = (message.additional_kwargs or {}).get("reasoning_content")
        if rc and "reasoning_content" not in payload:
            payload["reasoning_content"] = rc
    return payload


if not getattr(_openai_base, _PATCH_FLAG, False):
    setattr(_openai_base, _ORIG_ATTR, _openai_base._convert_message_to_dict)
    _openai_base._convert_message_to_dict = _patched_convert_message_to_dict
    setattr(_openai_base, _PATCH_FLAG, True)
