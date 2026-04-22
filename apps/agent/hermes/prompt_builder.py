"""Layered system-prompt assembly for the Hermes harness.

Layer order (per spec §5.2):

    1. base_identity.md                          (SparkFlow SOUL)
    2. tool_use_enforcement.md                   (model-family filtered)
    3. model_hints/{provider}.md                 (if present)
    4. extra_caller_system                       (runtime injection)
    5. memory usage guide + MEMORY snapshot      (P3 — no-op in P1)
    6. skills index                              (P3 — no-op in P1)
    7. surfaces/{surface}.md                     (SurfaceConfig.surface_prompt_path)
    8. context_refs[*].render()                  (wiki / sources / page / web)
    9. session metadata                          (timestamp, model, session_id, surface)

``build_minimal`` runs only layers 1-3 and 7 — used by workflows that need
no memory, skills, or context refs.

``build`` runs all layers and caches the result as
``_cached_system_prompts[session_id]`` so subsequent turns in the same
session reuse the same prefix (LLM prefix-cache friendly). The cache is
invalidated when ``mark_compressed(session_id)`` is called.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path


_OPENAI_HINT_FAMILIES = {"openai", "gpt", "codex", "deepseek"}  # OpenAI-style SDK usage
_GOOGLE_HINT_FAMILIES = {"google", "gemini"}


class PromptBuilder:
    """Builds system prompts by concatenating markdown fragments."""

    def __init__(self, prompts_root: Path | None = None) -> None:
        if prompts_root is None:
            # apps/agent/hermes/prompt_builder.py → apps/agent/prompts/
            prompts_root = Path(__file__).resolve().parent.parent / "prompts"
        self.prompts_root = Path(prompts_root)
        self._cached_system_prompts: dict[str, str] = {}

    # ---- public API --------------------------------------------------

    def build_minimal(
        self,
        *,
        surface_prompt_path: str,
        model_provider: str,
        model_name: str,  # reserved for future model-specific tuning
    ) -> str:
        """Layers 1, 2, 3, 7 only. For workflows and one-shot LLM calls."""

        parts: list[str] = []
        parts.append(self._read("base_identity.md"))
        parts.append(self._read("tool_use_enforcement.md"))
        hint = self._model_hint(model_provider)
        if hint:
            parts.append(hint)
        parts.append(self._read(surface_prompt_path))
        return "\n\n".join(p for p in parts if p)

    def build(
        self,
        *,
        surface_prompt_path: str,
        model_provider: str,
        model_name: str,
        user_id: str,
        session_id: str,
        notebook_id: str | None = None,
        context_refs: list = (),
        skip_memory: bool = False,
        skip_skills: bool = False,
        extra_caller_system: str | None = None,
    ) -> str:
        """Full 9-layer system prompt. Cached per ``session_id``."""

        cached = self._cached_system_prompts.get(session_id)
        if cached is not None:
            return cached

        parts: list[str] = []
        parts.append(self._read("base_identity.md"))                           # 1
        parts.append(self._read("tool_use_enforcement.md"))                    # 2
        hint = self._model_hint(model_provider)                                # 3
        if hint:
            parts.append(hint)
        if extra_caller_system:                                                # 4
            parts.append(extra_caller_system.strip())
        if not skip_memory:                                                    # 5
            mem = self._memory_snippet(user_id=user_id, notebook_id=notebook_id)
            if mem:
                parts.append(mem)
        if not skip_skills:                                                    # 6
            skills = self._skills_snippet(surface_path=surface_prompt_path)
            if skills:
                parts.append(skills)
        parts.append(self._read(surface_prompt_path))                          # 7
        for ref in context_refs:                                               # 8
            rendered = ref.render()
            if rendered:
                parts.append(rendered.strip())
        parts.append(self._session_metadata(                                   # 9
            session_id=session_id,
            model_provider=model_provider,
            model_name=model_name,
            surface_prompt_path=surface_prompt_path,
        ))

        out = "\n\n".join(p for p in parts if p)
        self._cached_system_prompts[session_id] = out
        return out

    def mark_compressed(self, session_id: str) -> None:
        """Invalidate the cache for ``session_id``. Call this after context
        compression rewrites the message history (so the next turn rebuilds
        the system prompt with fresh memory/skills snapshots).
        """

        self._cached_system_prompts.pop(session_id, None)

    # ---- private helpers ---------------------------------------------

    def _read(self, relpath: str) -> str:
        path = self.prompts_root / relpath
        if not path.exists():
            raise FileNotFoundError(f"Prompt fragment not found: {path}")
        return path.read_text(encoding="utf-8").strip()

    def _model_hint(self, provider: str) -> str:
        """Return the markdown for a model-family hint, or empty string."""

        key = provider.lower().strip()
        if key in _OPENAI_HINT_FAMILIES:
            hint_path = self.prompts_root / "model_hints" / "openai.md"
        elif key in _GOOGLE_HINT_FAMILIES:
            hint_path = self.prompts_root / "model_hints" / "gemini.md"
        else:
            return ""
        if not hint_path.exists():
            return ""
        return hint_path.read_text(encoding="utf-8").strip()

    # ---- P1 no-op hooks (filled in P3) ------------------------------

    def _memory_snippet(self, *, user_id: str, notebook_id: str | None) -> str:
        """P1: return empty. P3 loads UserMemory + NotebookMemory from Prisma
        and renders as a ``## Memory`` section, plus a usage guide."""

        return ""

    def _skills_snippet(self, *, surface_path: str) -> str:
        """P1: return empty. P3 scans ``~/.sparkflow/skills/*.md`` and renders
        the index as a ``## Skills`` section with progressive disclosure."""

        return ""

    def _session_metadata(
        self,
        *,
        session_id: str,
        model_provider: str,
        model_name: str,
        surface_prompt_path: str,
    ) -> str:
        return (
            "## Session Metadata\n\n"
            f"- session_id: `{session_id}`\n"
            f"- surface: `{surface_prompt_path}`\n"
            f"- model: `{model_provider}/{model_name}`\n"
            f"- timestamp: `{datetime.now(timezone.utc).isoformat()}`"
        )
