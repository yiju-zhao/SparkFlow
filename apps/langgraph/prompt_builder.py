"""Assemble system prompts from prompts/*.md fragments.

Layer order (per refactor spec §6):
  1. base_identity.md
  2. tool_use_enforcement.md
  3. model_hints/{openai|gemini}.md          (skipped if provider doesn't match)
  4. <surface_prompt> contents
  5. page_context block                       (if provided)
  6. session metadata
"""
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).parent / "prompts"

OPENAI_HINT_FAMILIES = {
    "openai", "gpt", "codex",
    "deepseek", "glm", "zhipu", "minimax", "kimi", "moonshot",
    "custom",
}
GEMINI_HINT_FAMILIES = {"google", "gemini"}


def _read(rel: str) -> str:
    path = ROOT / rel
    return path.read_text(encoding="utf-8").strip()


def _model_hint(provider: str) -> str:
    p = provider.lower().strip()
    if p in OPENAI_HINT_FAMILIES:
        return _read("model_hints/openai.md")
    if p in GEMINI_HINT_FAMILIES:
        return _read("model_hints/gemini.md")
    return ""


def build_system_prompt(
    *,
    surface: str,
    surface_prompt: str,
    provider: str,
    model: str,
    session_id: str,
    page_context: str | None = None,
) -> str:
    parts: list[str] = [
        _read("base_identity.md"),
        _read("tool_use_enforcement.md"),
        _model_hint(provider),
        _read(surface_prompt),
    ]
    if page_context:
        parts.append(f"## Current page context\n\n- {page_context}")
    parts.append(
        "## Session Metadata\n\n"
        f"- session_id: `{session_id}`\n"
        f"- surface: `{surface}`\n"
        f"- model: `{provider}/{model}`\n"
        f"- timestamp: `{datetime.now(timezone.utc).isoformat()}`"
    )
    return "\n\n".join(p for p in parts if p)
