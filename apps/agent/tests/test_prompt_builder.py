"""Tests for hermes.prompt_builder."""

from pathlib import Path

import pytest

from hermes.prompt_builder import PromptBuilder


def test_build_minimal_includes_base_identity():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "SparkFlow" in out
    assert "research assistant" in out


def test_build_minimal_includes_tool_use_enforcement():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "Tool-use enforcement" in out


def test_build_minimal_openai_hint_for_openai_family():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "<tool_persistence>" in out


def test_build_minimal_gemini_hint_for_google():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="google",
        model_name="gemini-2.0-flash",
    )
    assert "Gemini-family" in out
    assert "<tool_persistence>" not in out  # should not include openai hints


def test_build_minimal_unknown_provider_skips_model_hint():
    pb = PromptBuilder()
    out = pb.build_minimal(
        surface_prompt_path="surfaces/echo_test.md",
        model_provider="something-nonexistent",
        model_name="x",
    )
    # No crash; just no hints
    assert "<tool_persistence>" not in out
    assert "Gemini-family" not in out


def test_build_minimal_includes_surface_prompt(tmp_path):
    # Write a temporary surface prompt and point the builder at tmp_path
    surface_dir = tmp_path / "surfaces"
    surface_dir.mkdir()
    (surface_dir / "test_surface.md").write_text("Surface: test_surface body.", encoding="utf-8")
    # Create minimal required prompts
    (tmp_path / "base_identity.md").write_text("Identity.", encoding="utf-8")
    (tmp_path / "tool_use_enforcement.md").write_text("Enforcement.", encoding="utf-8")
    (tmp_path / "model_hints").mkdir()
    (tmp_path / "model_hints" / "openai.md").write_text("Hints.", encoding="utf-8")

    pb = PromptBuilder(prompts_root=tmp_path)
    out = pb.build_minimal(
        surface_prompt_path="surfaces/test_surface.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    assert "Surface: test_surface body." in out


def test_build_minimal_missing_surface_prompt_raises(tmp_path):
    pb = PromptBuilder(prompts_root=tmp_path)
    with pytest.raises(FileNotFoundError):
        pb.build_minimal(
            surface_prompt_path="surfaces/does_not_exist.md",
            model_provider="openai",
            model_name="gpt-4o",
        )


def test_build_minimal_layer_order(tmp_path):
    """Base identity must precede enforcement, which must precede model hint,
    which must precede the surface prompt."""
    surface_dir = tmp_path / "surfaces"
    surface_dir.mkdir()
    (surface_dir / "order.md").write_text("SURFACE_MARKER", encoding="utf-8")
    # Copy the real identity/enforcement/hints into tmp for this test
    (tmp_path / "base_identity.md").write_text("IDENTITY_MARKER", encoding="utf-8")
    (tmp_path / "tool_use_enforcement.md").write_text("ENFORCEMENT_MARKER", encoding="utf-8")
    (tmp_path / "model_hints").mkdir()
    (tmp_path / "model_hints" / "openai.md").write_text("OPENAI_HINT_MARKER", encoding="utf-8")

    pb = PromptBuilder(prompts_root=tmp_path)
    out = pb.build_minimal(
        surface_prompt_path="surfaces/order.md",
        model_provider="openai",
        model_name="gpt-4o",
    )
    i_ident = out.index("IDENTITY_MARKER")
    i_enforce = out.index("ENFORCEMENT_MARKER")
    i_hint = out.index("OPENAI_HINT_MARKER")
    i_surface = out.index("SURFACE_MARKER")
    assert i_ident < i_enforce < i_hint < i_surface
