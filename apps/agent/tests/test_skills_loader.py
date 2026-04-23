"""Tests for hermes.skills.loader.SkillsLoader."""

import pytest

from hermes.skills.loader import Skill, SkillsLoader


def _write_skill(dir, name, frontmatter, body=""):
    (dir / f"{name}.md").write_text(frontmatter + "\n" + body, encoding="utf-8")


def test_loader_empty_dir_returns_empty_list(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_parses_valid_skill(tmp_path):
    _write_skill(
        tmp_path, "literature-summary",
        frontmatter="""---
name: literature-summary
description: Summarize cited sources in a notebook.
applies_to: [notebook]
tools_required: [wiki_search, source_read]
---""",
        body="# Body\nProse about what to do.",
    )

    loader = SkillsLoader(skills_dir=tmp_path)
    skills = loader.load_all()
    assert len(skills) == 1
    s = skills[0]
    assert isinstance(s, Skill)
    assert s.name == "literature-summary"
    assert s.description == "Summarize cited sources in a notebook."
    assert s.applies_to == ["notebook"]
    assert s.tools_required == ["wiki_search", "source_read"]
    assert "Prose about what to do." in s.body


def test_loader_skips_files_without_frontmatter(tmp_path):
    (tmp_path / "no-frontmatter.md").write_text("just body, no frontmatter", encoding="utf-8")
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_skips_non_md_files(tmp_path):
    (tmp_path / "readme.txt").write_text("not markdown", encoding="utf-8")
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_handles_malformed_yaml_by_skipping(tmp_path):
    (tmp_path / "broken.md").write_text(
        "---\nname: broken\n  bad indent\n---\nbody", encoding="utf-8"
    )
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_missing_required_fields_skipped(tmp_path):
    (tmp_path / "noname.md").write_text(
        "---\ndescription: missing name\n---\nbody", encoding="utf-8"
    )
    loader = SkillsLoader(skills_dir=tmp_path)
    assert loader.load_all() == []


def test_loader_multiple_skills_returned_sorted_by_name(tmp_path):
    _write_skill(tmp_path, "zebra", "---\nname: zebra\ndescription: Z\n---")
    _write_skill(tmp_path, "apple", "---\nname: apple\ndescription: A\n---")

    loader = SkillsLoader(skills_dir=tmp_path)
    names = [s.name for s in loader.load_all()]
    assert names == ["apple", "zebra"]


def test_loader_nonexistent_dir_returns_empty(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path / "does-not-exist")
    assert loader.load_all() == []
