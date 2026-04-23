"""Skills tools — progressive disclosure for skill bodies."""

from __future__ import annotations

import json

from langchain_core.tools import tool

from hermes.registry import registry
from hermes.skills.loader import SkillsLoader


_loader: SkillsLoader | None = None


def _get_loader() -> SkillsLoader:
    global _loader
    if _loader is None:
        _loader = SkillsLoader()
    return _loader


@tool
def skill_read(name: str) -> str:
    """Read the full body of a named skill.

    Use this when a skill listed in the system prompt's Skills section
    looks relevant and you need its full instructions. The body contains
    the step-by-step approach.

    Args:
        name: The skill name as listed in the Skills index.
    """

    loader = _get_loader()
    for s in loader.load_all():
        if s.name == name:
            return s.body
    return json.dumps({"error": f"Unknown skill: {name}"})


# --- hermes.registry self-registration (P3) -----------------------------
registry.register(
    name=skill_read.name,
    toolset="skills",
    tool=skill_read,
    description="Read the full body of a named skill (progressive disclosure).",
)
