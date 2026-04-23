"""Skills loader — scans ``~/.sparkflow/skills/*.md`` and parses frontmatter.

A skill is a Markdown file with YAML frontmatter describing when to apply
it and which tools it needs. The body is only shown to the LLM when it
calls ``skill_read(name)`` — the system prompt's skills index injects just
the metadata.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path

import yaml


logger = logging.getLogger(__name__)


@dataclass(slots=True)
class Skill:
    """Parsed skill — frontmatter + body."""

    name: str
    description: str
    applies_to: list[str] = field(default_factory=list)  # surface names, or [] for all
    tools_required: list[str] = field(default_factory=list)
    body: str = ""
    source_path: Path | None = None


class SkillsLoader:
    """Scan a directory for skill Markdown files and parse them."""

    def __init__(self, *, skills_dir: Path | None = None) -> None:
        if skills_dir is None:
            skills_dir = Path.home() / ".sparkflow" / "skills"
        self.skills_dir = Path(skills_dir)

    def load_all(self) -> list[Skill]:
        if not self.skills_dir.exists() or not self.skills_dir.is_dir():
            return []

        skills: list[Skill] = []
        for path in sorted(self.skills_dir.glob("*.md")):
            skill = self._load_one(path)
            if skill is not None:
                skills.append(skill)
        return skills

    def _load_one(self, path: Path) -> Skill | None:
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            return None

        if not raw.startswith("---"):
            return None

        # Split: '---\n<frontmatter>\n---\n<body>'
        parts = raw.split("---", 2)
        if len(parts) < 3:
            return None

        _, fm_text, body_text = parts

        try:
            fm = yaml.safe_load(fm_text)
        except yaml.YAMLError:
            logger.warning("Skipping skill with malformed YAML: %s", path)
            return None

        if not isinstance(fm, dict):
            return None

        name = fm.get("name")
        description = fm.get("description")
        if not isinstance(name, str) or not isinstance(description, str):
            logger.warning("Skipping skill missing name/description: %s", path)
            return None

        return Skill(
            name=name,
            description=description,
            applies_to=list(fm.get("applies_to") or []),
            tools_required=list(fm.get("tools_required") or []),
            body=body_text.strip(),
            source_path=path,
        )
