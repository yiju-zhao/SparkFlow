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


from dataclasses import dataclass

from hermes.context.references import WikiContentRef, PageContextRef


@dataclass
class _Ctx:
    notebook_id: str | None = None
    page_context: str | None = None


def test_build_full_includes_all_applicable_layers():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",   # any file that exists works for P1
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        notebook_id="nb_1",
        context_refs=[WikiContentRef(_Ctx(notebook_id="nb_1"))],
    )
    assert "SparkFlow" in out             # layer 1
    assert "Tool-use enforcement" in out  # layer 2
    assert "<tool_persistence>" in out    # layer 3 (openai)
    assert "Wiki Knowledge Base" in out   # layer 8 (context ref)
    assert "Session Metadata" in out      # layer 9
    assert "s_1" in out                   # session id in metadata


def test_build_skips_memory_and_skills_in_p1():
    """Memory and Skills layers are no-op placeholders in P1."""
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
    )
    # These sections should not appear because their providers return "".
    assert "## Memory" not in out
    assert "## Skills" not in out


def test_build_injects_extra_caller_system():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        extra_caller_system="Do not mention banana.",
    )
    assert "Do not mention banana." in out


def test_build_context_refs_in_order():
    pb = PromptBuilder()
    out = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_1",
        context_refs=[
            WikiContentRef(_Ctx(notebook_id="nb_1")),
            PageContextRef(_Ctx(page_context="/explore")),
        ],
    )
    i_wiki = out.index("Wiki Knowledge Base")
    i_page = out.index("Current page context")
    assert i_wiki < i_page


def test_build_caches_per_session():
    pb = PromptBuilder()
    out1 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="cache_sess",
    )
    # Change a field that would normally rebuild: the cache should still hit.
    out2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_2",            # different — but cache is keyed by session_id
        session_id="cache_sess",
    )
    assert out1 == out2


def test_build_cache_separate_sessions():
    pb = PromptBuilder()
    out1 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="sess_a",
    )
    out2 = pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="sess_b",
    )
    # Different session_id → different cache entries, but since everything else
    # is identical the metadata timestamp differs. Check via the session id tag:
    assert "sess_a" in out1 and "sess_b" in out2


def test_build_mark_compressed_invalidates_cache():
    pb = PromptBuilder()
    pb.build(
        surface_prompt_path="base_identity.md",
        model_provider="openai",
        model_name="gpt-4o",
        user_id="u_1",
        session_id="s_evict",
    )
    assert "s_evict" in pb._cached_system_prompts
    pb.mark_compressed("s_evict")
    assert "s_evict" not in pb._cached_system_prompts
