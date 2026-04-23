"""Tests for graphs.surface.build_graph."""

from config.surfaces import SurfaceConfig
from graphs.surface import build_graph


def test_build_graph_returns_compiled_state_graph():
    cfg = SurfaceConfig(
        name="test_surface",
        surface_prompt_path="base_identity.md",  # any existing prompt path works; not read at compile time
        toolset={"_test"},
    )
    graph = build_graph(cfg)
    # Compiled graphs expose ainvoke / astream
    assert hasattr(graph, "ainvoke")
    assert hasattr(graph, "astream")


def test_build_graph_distinct_configs_produce_distinct_instances():
    a = build_graph(SurfaceConfig(name="a", surface_prompt_path="base_identity.md", toolset={"x"}))
    b = build_graph(SurfaceConfig(name="b", surface_prompt_path="tool_use_enforcement.md", toolset={"y"}))
    assert a is not b
