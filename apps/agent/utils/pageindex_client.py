"""
Wrapper around PageIndex library for document indexing and retrieval.
Uses PageIndexClient API for tree generation and retrieval.
"""

import os

from pageindex import PageIndexClient

PAGEINDEX_MODEL = os.getenv("PAGEINDEX_MODEL", "gpt-4o-2024-11-20")
PAGEINDEX_API_KEY = os.getenv("PAGEINDEX_API_KEY", "")


def _get_client() -> PageIndexClient:
    """Get a PageIndex client instance."""
    return PageIndexClient(
        api_key=PAGEINDEX_API_KEY or None,
        model=PAGEINDEX_MODEL,
        retrieve_model=PAGEINDEX_MODEL,
    )


def index_pdf(pdf_path: str) -> dict:
    """Index a PDF file into a hierarchical tree structure."""
    client = _get_client()
    response = client.submit_document(pdf_path)
    doc_id = response.get("doc_id", "")

    import time
    for _ in range(120):
        status = client.get_document(doc_id)
        if status.get("status") == "completed":
            tree = client.get_tree(doc_id)
            return tree.get("result", {})
        if status.get("status") == "error":
            raise RuntimeError(f"PageIndex indexing failed: {status}")
        time.sleep(3)

    raise TimeoutError("PageIndex indexing timed out")


def index_markdown(markdown_content: str, title: str = "Document") -> dict:
    """Index markdown content into a hierarchical tree structure.

    Builds a tree from markdown headings for local indexing.
    """
    lines = markdown_content.split("\n")
    nodes = []
    current_pos = 0

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("#"):
            level = len(stripped) - len(stripped.lstrip("#"))
            heading_text = stripped.lstrip("#").strip()
            if heading_text:
                nodes.append({
                    "title": heading_text,
                    "node_id": f"n{len(nodes)}",
                    "start_index": current_pos,
                    "end_index": current_pos,
                    "summary": "",
                    "level": level,
                    "nodes": [],
                })
        current_pos += len(line) + 1

    root = {
        "title": title,
        "node_id": "root",
        "start_index": 0,
        "end_index": len(markdown_content),
        "summary": f"Document: {title}",
        "nodes": [],
    }

    if not nodes:
        return {"structure": root}

    stack = [root]
    for node in nodes:
        level = node.pop("level", 1)
        while len(stack) > level:
            stack.pop()
        if stack:
            stack[-1]["nodes"].append(node)
        stack.append(node)

    return {"structure": root}


def retrieve(query: str, index_data: dict, model: str | None = None) -> list[dict]:
    """Retrieve relevant sections from an indexed document tree."""
    try:
        client = _get_client()
        response = client.chat_completions(
            messages=[{"role": "user", "content": query}],
            tree=index_data,
        )

        sections = []
        if response and "choices" in response:
            content = response["choices"][0]["message"]["content"]
            sections.append({"content": content})
        return sections
    except Exception:
        summary = get_tree_summary(index_data)
        return [{"content": f"Document structure:\n{summary}"}]


def get_tree_summary(index_data: dict) -> str:
    """Get a human-readable summary of the document tree structure."""
    lines = []

    def walk(node: dict, depth: int = 0):
        indent = "  " * depth
        title = node.get("title", "Untitled")
        summary = node.get("summary", "")
        start = node.get("start_index", "?")
        end = node.get("end_index", "?")

        line = f"{indent}- {title} (pages {start}-{end})"
        if summary:
            line += f": {summary[:100]}"
        lines.append(line)

        for child in node.get("nodes", []):
            walk(child, depth + 1)

    structure = index_data.get("structure", index_data)
    walk(structure)
    return "\n".join(lines)


def find_section(index_data: dict, section_path: str) -> dict | None:
    """Find a specific section in the tree by node_id or title path."""
    structure = index_data.get("structure", index_data)

    def search(node: dict) -> dict | None:
        if node.get("node_id") == section_path:
            return node
        if node.get("title", "").lower() == section_path.lower():
            return node
        for child in node.get("nodes", []):
            result = search(child)
            if result:
                return result
        return None

    return search(structure)
