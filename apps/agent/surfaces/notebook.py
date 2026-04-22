"""Notebook surface configuration."""

from config.surfaces import SurfaceConfig
from hermes.context.references import NotebookSourcesRef, WikiContentRef

NOTEBOOK = SurfaceConfig(
    name="notebook",
    surface_prompt_path="surfaces/notebook.md",
    toolset={"wiki"},
    context_refs=(WikiContentRef, NotebookSourcesRef),
    memory_scope=("user", "notebook"),
    max_iterations=30,
)
