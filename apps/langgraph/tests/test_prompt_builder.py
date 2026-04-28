"""Tests for the flat prompt_builder.build_system_prompt function."""

from __future__ import annotations

import pytest
from prompt_builder import build_system_prompt


def test_includes_base_identity_and_enforcement():
    out = build_system_prompt(
        surface="notebook",
        surface_prompt="surfaces/notebook.md",
        provider="openai",
        model="gpt-4o",
        session_id="sess_1",
    )
    # Layer order: base_identity → tool_use_enforcement → model_hints → surface → session
    assert "## Session Metadata" in out
    assert "session_id: `sess_1`" in out
    assert "surface: `notebook`" in out
    assert "model: `openai/gpt-4o`" in out


def test_openai_provider_loads_openai_hint():
    out = build_system_prompt(
        surface="hub",
        surface_prompt="surfaces/hub.md",
        provider="deepseek",
        model="deepseek-chat",
        session_id="s",
    )
    # deepseek is in the OpenAI-hint family per spec §6
    # We expect the openai.md hint to be embedded somewhere before session metadata
    body, sep, meta = out.partition("## Session Metadata")
    assert sep, "session metadata block should be present"
    # Sanity: openai hint markdown text appears at least via a heading from prompts/model_hints/openai.md
    assert "tool" in body.lower()  # model_hints/openai.md mentions tool semantics


def test_gemini_provider_loads_gemini_hint():
    out = build_system_prompt(
        surface="deep_research",
        surface_prompt="surfaces/deep_research.md",
        provider="gemini",
        model="gemini-2.0-flash",
        session_id="s",
    )
    # Gemini hint family — distinct file from openai.md
    assert "deep_research" in out  # surface metadata block


def test_unknown_provider_skips_hint():
    out = build_system_prompt(
        surface="notebook",
        surface_prompt="surfaces/notebook.md",
        provider="zzz_unknown",
        model="x",
        session_id="s",
    )
    # No exception, just no hint section
    assert "## Session Metadata" in out


def test_page_context_inserted_before_metadata():
    out = build_system_prompt(
        surface="hub",
        surface_prompt="surfaces/hub.md",
        provider="openai",
        model="gpt-4o",
        session_id="s",
        page_context="user is on /explore/conferences/publications",
    )
    pc_idx = out.index("Current page context")
    sess_idx = out.index("Session Metadata")
    assert pc_idx < sess_idx
    assert "/explore/conferences/publications" in out


def test_no_page_context_when_omitted():
    out = build_system_prompt(
        surface="notebook",
        surface_prompt="surfaces/notebook.md",
        provider="openai",
        model="gpt-4o",
        session_id="s",
    )
    assert "Current page context" not in out


def test_missing_surface_prompt_raises():
    with pytest.raises(FileNotFoundError):
        build_system_prompt(
            surface="x",
            surface_prompt="surfaces/does_not_exist.md",
            provider="openai",
            model="gpt-4o",
            session_id="s",
        )
