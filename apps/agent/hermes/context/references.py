"""Context references for the prompt builder.

A ``ContextRef`` renders an optional string block to be concatenated into
the system prompt. Each subclass targets a specific external data source
(wiki, notebook sources, current page, web-search history, etc.). In P1
these are stubs that either return an empty string or a lightweight header;
P2/P3/P4 replace the stubs with real data access.

The design choice: each ref takes the full request ``context`` object in
its constructor and owns its own lookup logic. The prompt builder does
not need to know what a ref depends on — it just calls ``render()``.
"""

from __future__ import annotations

from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class ContextRef(Protocol):
    """Any object with a ``render() -> str`` method qualifies."""

    def render(self) -> str: ...


class _RefBase:
    """Common ctor. Subclasses pull what they need off ``ctx``."""

    def __init__(self, ctx: Any) -> None:
        self.ctx = ctx


class WikiContentRef(_RefBase):
    """Inject the notebook's wiki knowledge as a system-prompt block.

    P1 stub: returns a header referencing the notebook id so downstream
    tests can verify the hook is wired correctly. Real content load is P2
    (reuses ``lib/services/wiki-ingest.ts`` output via HTTP to Next.js).
    """

    def render(self) -> str:
        notebook_id = getattr(self.ctx, "notebook_id", None)
        if not notebook_id:
            return ""
        return (
            f"## Wiki Knowledge Base\n\n"
            f"Compiled knowledge for notebook `{notebook_id}`. "
            f"(P1 placeholder — real content injected in P2.)"
        )


class NotebookSourcesRef(_RefBase):
    """List the notebook's uploaded sources so the model knows what `source_read`
    can retrieve. P1 stub returns empty; P2 wires in the real list.
    """

    def render(self) -> str:
        notebook_id = getattr(self.ctx, "notebook_id", None)
        if not notebook_id:
            return ""
        return (
            f"## Notebook Sources\n\n"
            f"Sources for notebook `{notebook_id}`. "
            f"(P1 placeholder — real list injected in P2.)"
        )


class PageContextRef(_RefBase):
    """Inject the frontend's current-page hint (e.g., 'user is on
    /explore/conferences'). Passed through from the HTTP request.
    """

    def render(self) -> str:
        page = getattr(self.ctx, "page_context", None)
        if not page:
            return ""
        return f"## Current page context\n\n- {page}"


class WebSearchContextRef(_RefBase):
    """For the deep_research surface: running history of web searches and
    URLs already visited. P1 stub; real impl in P4.
    """

    def render(self) -> str:
        return ""
