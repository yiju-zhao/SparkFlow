"""Deep research surface configuration (open-web multi-turn)."""

from config.surfaces import SurfaceConfig
from hermes.context.references import PageContextRef

DEEP_RESEARCH = SurfaceConfig(
    name="deep_research",
    surface_prompt_path="surfaces/deep_research.md",
    toolset={"web", "wiki", "memory", "skills"},
    context_refs=(PageContextRef,),
    memory_scope=("user",),
    max_iterations=40,
)
