"""Tests for hermes.skills.index.SkillsIndex."""

from pathlib import Path

import pytest

from hermes.skills.index import SkillsIndex
from hermes.skills.loader import Skill, SkillsLoader


def _write(dir, name, description, applies_to=None, tools_required=None):
    applies_to_yaml = applies_to if applies_to is not None else []
    tools_yaml = tools_required if tools_required is not None else []
    fm = f"""---
name: {name}
description: {description}
applies_to: {applies_to_yaml}
tools_required: {tools_yaml}
---
Body for {name}.
"""
    (dir / f"{name}.md").write_text(fm, encoding="utf-8")


def test_index_filters_by_surface(tmp_path):
    _write(tmp_path, "for-notebook", "nb skill", applies_to=["notebook"])
    _write(tmp_path, "for-hub", "hub skill", applies_to=["hub"])
    _write(tmp_path, "for-all", "universal skill", applies_to=[])

    idx = SkillsIndex(loader=SkillsLoader(skills_dir=tmp_path))
    nb_skills = {s.name for s in idx.get_index(surface="notebook", toolset={"wiki"})}
    assert "for-notebook" in nb_skills
    assert "for-all" in nb_skills
    assert "for-hub" not in nb_skills


def test_index_filters_by_tools_required(tmp_path):
    _write(tmp_path, "needs-wiki", "x", tools_required=["wiki_search"])
    _write(tmp_path, "needs-hub", "x", tools_required=["search_conferences"])

    idx = SkillsIndex(loader=SkillsLoader(skills_dir=tmp_path))
    # Only wiki_search tool available → needs-wiki qualifies, needs-hub doesn't
    result = {s.name for s in idx.get_index(surface="notebook", toolset={"wiki_search"})}
    assert "needs-wiki" in result
    assert "needs-hub" not in result


def test_index_empty_toolset_skips_tools_filter(tmp_path):
    """When toolset is empty, tools_required filter is disabled (show all by-surface matches)."""
    _write(tmp_path, "needs-wiki", "x", tools_required=["wiki_search"])

    idx = SkillsIndex(loader=SkillsLoader(skills_dir=tmp_path))
    result = {s.name for s in idx.get_index(surface="notebook", toolset=set())}
    assert "needs-wiki" in result


def test_index_caches_in_memory(tmp_path):
    _write(tmp_path, "cached", "c")

    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)

    _ = idx.get_index(surface="notebook", toolset={"wiki"})
    _ = idx.get_index(surface="notebook", toolset={"wiki"})
    # Second call should hit the in-memory cache.
    assert len(idx._cache) >= 1


def test_index_invalidate_clears_cache(tmp_path):
    _write(tmp_path, "x", "x")
    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)
    idx.get_index(surface="notebook", toolset={"wiki"})
    assert len(idx._cache) >= 1
    idx.invalidate()
    assert len(idx._cache) == 0


def test_render_snippet_empty_when_no_skills(tmp_path):
    loader = SkillsLoader(skills_dir=tmp_path)  # empty dir
    idx = SkillsIndex(loader=loader)
    snippet = idx.render_snippet(surface="notebook", toolset={"wiki"})
    assert snippet == ""


def test_render_snippet_includes_name_description_and_applies_to(tmp_path):
    _write(tmp_path, "lit", "Summarize cited sources.",
           applies_to=["notebook"], tools_required=["wiki_search"])

    loader = SkillsLoader(skills_dir=tmp_path)
    idx = SkillsIndex(loader=loader)
    snippet = idx.render_snippet(surface="notebook", toolset={"wiki_search"})
    assert "## Skills" in snippet
    assert "lit" in snippet
    assert "Summarize cited sources" in snippet
    # Body should NOT be in the snippet (progressive disclosure)
    assert "Body for lit" not in snippet
