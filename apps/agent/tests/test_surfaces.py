"""Tests for config.surfaces.SurfaceConfig."""

from config.surfaces import SurfaceConfig


def test_surface_config_minimal():
    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki"},
    )
    assert cfg.name == "notebook"
    assert cfg.surface_prompt_path == "surfaces/notebook.md"
    assert cfg.toolset == {"wiki"}
    assert cfg.context_refs == ()
    assert cfg.memory_scope == ()
    assert cfg.max_iterations == 30


def test_surface_config_full():
    from hermes.context.references import WikiContentRef, PageContextRef

    cfg = SurfaceConfig(
        name="notebook",
        surface_prompt_path="surfaces/notebook.md",
        toolset={"wiki", "memory"},
        context_refs=(WikiContentRef, PageContextRef),
        memory_scope=("user", "notebook"),
        max_iterations=50,
    )
    assert cfg.context_refs == (WikiContentRef, PageContextRef)
    assert cfg.memory_scope == ("user", "notebook")
    assert cfg.max_iterations == 50


def test_surface_config_is_frozen():
    """SurfaceConfig instances should be immutable so downstream callers
    can't accidentally mutate shared module-level configs."""
    import pytest

    cfg = SurfaceConfig(
        name="x",
        surface_prompt_path="y",
        toolset={"z"},
    )
    with pytest.raises((AttributeError, TypeError)):
        cfg.name = "mutated"  # type: ignore[misc]
