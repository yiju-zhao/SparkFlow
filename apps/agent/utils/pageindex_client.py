"""
Wrapper around PageIndex library for document indexing and retrieval.
Supports both PDF files (native) and markdown content (via md_to_tree).
"""

import json
import os
from pathlib import Path

from pageindex import page_index, md_to_tree

PAGEINDEX_MODEL = os.getenv("PAGEINDEX_MODEL", "gpt-4o-2024-11-20")


def index_pdf(pdf_path: str) -> dict:
    """Index a PDF file into a hierarchical tree structure."""
    result = page_index(
        pdf_path=pdf_path,
        model=PAGEINDEX_MODEL,
        toc_check_pages=20,
        max_pages_per_node=10,
        max_tokens_per_node=20000,
        if_add_node_id=True,
        if_add_node_summary=True,
        if_add_doc_description=True,
    )
    return result


def index_markdown(markdown_content: str, title: str = "Document") -> dict:
    """Index markdown content into a hierarchical tree structure."""
    result = md_to_tree(
        markdown_content=markdown_content,
        model=PAGEINDEX_MODEL,
        if_add_node_id=True,
        if_add_node_summary=True,
    )
    return result


def retrieve(query: str, index_data: dict, model: str | None = None) -> list[dict]:
    """Retrieve relevant sections from an indexed document tree."""
    from pageindex import PageIndexClient

    client = PageIndexClient(
        model=model or PAGEINDEX_MODEL,
        retrieve_model=model or PAGEINDEX_MODEL,
    )

    response = client.chat_completions(
        messages=[{"role": "user", "content": query}],
        tree=index_data,
    )

    sections = []
    if response and "choices" in response:
        content = response["choices"][0]["message"]["content"]
        sections.append({
            "content": content,
            "tree": index_data,
        })

    return sections


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
