"""Skills index — filters and renders the system-prompt snippet.

In-memory LRU cache keyed by ``(surface, sorted(toolset))``. Disk-snapshot
tier is deferred to a future task.
"""

from __future__ import annotations

from collections import OrderedDict

from hermes.skills.loader import Skill, SkillsLoader


_CACHE_CAP = 8


class SkillsIndex:
    """Query skills by surface and available toolset."""

    def __init__(self, *, loader: SkillsLoader | None = None) -> None:
        self.loader = loader or SkillsLoader()
        self._cache: OrderedDict[tuple[str, tuple[str, ...]], list[Skill]] = OrderedDict()

    def invalidate(self) -> None:
        self._cache.clear()

    def get_index(self, *, surface: str, toolset: set[str]) -> list[Skill]:
        """Return skills applicable to ``surface`` and whose tools_required
        is a subset of ``toolset``.

        Empty ``toolset`` disables the tools_required filter (useful when
        the caller doesn't know the surface's toolset).
        """
        key = (surface, tuple(sorted(toolset)))
        cached = self._cache.get(key)
        if cached is not None:
            self._cache.move_to_end(key)
            return cached

        skills = self.loader.load_all()
        result: list[Skill] = []
        for s in skills:
            if s.applies_to and surface not in s.applies_to:
                continue
            if toolset and s.tools_required and not set(s.tools_required).issubset(toolset):
                continue
            result.append(s)

        self._cache[key] = result
        if len(self._cache) > _CACHE_CAP:
            self._cache.popitem(last=False)
        return result

    def render_snippet(self, *, surface: str, toolset: set[str]) -> str:
        """Render the ``## Skills`` block for the system prompt.

        Each skill appears as a one-liner. Full body is NOT included —
        the LLM must call ``skill_read(name)`` to fetch it (progressive
        disclosure).
        """

        skills = self.get_index(surface=surface, toolset=toolset)
        if not skills:
            return ""

        lines: list[str] = [
            "## Skills\n",
            "Below is the index of skills available for this surface. "
            "Call `skill_read(name)` to load the full body of any skill before applying it.\n",
        ]
        for s in skills:
            applies = f" (applies_to: {', '.join(s.applies_to)})" if s.applies_to else ""
            lines.append(f"- **{s.name}**{applies} — {s.description}")
        return "\n".join(lines)
