"""Tests for hermes.context.references."""

from dataclasses import dataclass

from hermes.context.references import ContextRef, WikiContentRef, NotebookSourcesRef, PageContextRef


@dataclass
class _FakeCtx:
    notebook_id: str | None = None
    page_context: str | None = None


def test_wiki_content_ref_renders_header_and_placeholder_when_no_data():
    ref = WikiContentRef(_FakeCtx(notebook_id="nb_123"))
    out = ref.render()
    assert "Wiki Knowledge Base" in out
    assert "nb_123" in out or "notebook" in out.lower()


def test_wiki_content_ref_empty_when_no_notebook_id():
    ref = WikiContentRef(_FakeCtx(notebook_id=None))
    assert ref.render() == ""


def test_notebook_sources_ref_empty_when_no_notebook_id():
    ref = NotebookSourcesRef(_FakeCtx(notebook_id=None))
    assert ref.render() == ""


def test_page_context_ref_includes_raw_when_present():
    ref = PageContextRef(_FakeCtx(page_context="user is on /explore/conferences"))
    out = ref.render()
    assert "Current page context" in out
    assert "explore/conferences" in out


def test_page_context_ref_empty_when_missing():
    ref = PageContextRef(_FakeCtx(page_context=None))
    assert ref.render() == ""


def test_context_ref_is_a_protocol():
    # Should be usable as a structural type
    class _Custom:
        def render(self) -> str:
            return "custom"

    def _takes(ref: ContextRef) -> str:
        return ref.render()

    assert _takes(_Custom()) == "custom"
