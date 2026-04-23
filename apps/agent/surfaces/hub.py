"""Hub (research assistant) surface configuration."""

from config.surfaces import SurfaceConfig
from hermes.context.references import PageContextRef

HUB = SurfaceConfig(
    name="hub",
    surface_prompt_path="surfaces/hub.md",
    toolset={"hub", "wechat", "navigation", "ui", "memory", "skills"},
    context_refs=(PageContextRef,),
    memory_scope=("user",),
    max_iterations=20,
)
