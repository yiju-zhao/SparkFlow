# RAG Agent with Official Deep Agents Skills

**Date:** 2026-02-18
**Status:** Approved
**Author:** Claude

## Overview

Use the **official Deep Agents skill system** with `SKILL.md` files and `FilesystemBackend` for progressive disclosure of RAG capabilities.

## Problem Statement

The current agent has these issues:
- Poor retrieval quality
- Weak reasoning
- Bad tool selection
- Performance/efficiency concerns

## Solution: Official Deep Agents Skills

Use `create_deep_agent` with:
- `skills=["./skills/"]` - Skills loaded from disk
- `FilesystemBackend` - File system access for skill loading
- `SKILL.md` files - Standard skill format with frontmatter

## Architecture

```
create_deep_agent
│
├── FilesystemBackend(root_dir="./")
│
├── skills=["./skills/"]
│   ├── retrieval/SKILL.md
│   ├── exploration/SKILL.md
│   └── summarization/SKILL.md
│
├── tools: [explore, search, probe, get_first_chunk]
│
└── middleware: [inject_sources_context, optimize_query]
```

## Skill Files

### Directory Structure

```
apps/agent/skills/
├── retrieval/
│   └── SKILL.md
├── exploration/
│   └── SKILL.md
└── summarization/
    └── SKILL.md
```

### retrieval/SKILL.md

```md
---
name: retrieval
description: Use this skill for requests that require searching and validating information from the knowledge base. Triggers on questions asking for specific facts, data, or information.
---

# Retrieval Skill

## Purpose
Find relevant information and validate it before citing.

## Available Tools
- search(query): Find chunks by keyword/question
- probe(chunk_id, direction, count): Get surrounding context

## Workflow
1. **Understand the question** - What specific information is needed?
2. **Search** - Use search() with targeted keywords
3. **Validate** - Use probe() to check surrounding context
4. **Cite** - Only cite validated, relevant information

## Best Practices
- Start with broad keywords, then narrow down
- Always probe before citing to avoid out-of-context quotes
- If no results, try different keywords or explore() first
- Combine multiple search results for comprehensive answers
- Use English keywords for search regardless of question language

## Example
User: "What is the revenue for Q3?"

1. search("Q3 revenue") → Get initial results
2. probe(chunk_id, "both", 2) → Validate context
3. Synthesize answer with citation [ref:chunk_id]
```

### exploration/SKILL.md

```md
---
name: exploration
description: Use this skill when users want to understand what documents and information are available in the knowledge base. Triggers on questions like "what do you know about" or "what sources do you have".
---

# Exploration Skill

## Purpose
Help users understand what information is available in the knowledge base.

## Available Tools
- explore(): List available documents and their structure

## Workflow
1. Call explore() to see available documents
2. Present document list with chunk counts
3. Help user identify relevant sources

## Best Practices
- Use when user asks "what do you know about X"
- Use before targeted search to understand the landscape
- Mention document names when citing information
```

### summarization/SKILL.md

```md
---
name: summarization
description: Use this skill when users want a comprehensive summary of an entire document. Triggers on requests like "summarize this document" or "give me an overview of".
---

# Summarization Skill

## Purpose
Create comprehensive summaries of entire documents.

## Available Tools
- get_first_chunk(document_name): Get starting chunk
- probe(chunk_id, direction="after", count): Sweep forward

## Workflow
1. **Start** - get_first_chunk(document_name) → Get first chunk with ID
2. **Sweep** - probe(chunk_id, "after", N) → Get next chunks
3. **Iterate** - Continue sweeping until done
4. **Synthesize** - Build comprehensive summary

## Best Practices
- Balance breadth vs depth
- Cover main points without getting lost in details
- Stop when diminishing returns (repetitive content)
- Use count=3-5 chunks per probe for efficiency

## Example
User: "Summarize the research paper"

1. get_first_chunk("research_paper.pdf") → chunk_0
2. probe(chunk_0, "after", 5) → chunks 1-5
3. probe(chunk_5, "after", 5) → chunks 6-10
4. ... continue until done
5. Synthesize summary
```

## Agent Configuration

```python
# apps/agent/graphs/rag_agent.py

from deepagents import create_deep_agent
from deepagents.backends.filesystem import FilesystemBackend

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from middleware.sources_context import inject_sources_context
from middleware.query_optimizer import optimize_query

model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

agent = create_deep_agent(
    model=model,
    backend=FilesystemBackend(root_dir="."),
    skills=["./skills/"],
    tools=[explore, search, probe, get_first_chunk],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context, optimize_query],
)
```

## New Tool: get_first_chunk

Add to `apps/agent/tools/ragflow.py`:

```python
@tool
def get_first_chunk(document_name: str, runtime: ToolRuntime) -> str:
    """Get the first chunk of a document to start summarization.

    Use this to begin a document sweep for summarization.

    Args:
        document_name: Name (or partial name) of the document to get the first chunk from

    Returns:
        First chunk content with chunk_id for subsequent probing
    """
    client = _get_client()
    if not client:
        return "RAGFlow not configured. Set RAGFLOW_API_KEY."

    config = runtime.config if runtime else None
    dataset_ids = config.get("configurable", {}).get("dataset_ids", []) if config else []
    if not dataset_ids:
        return "No datasets configured."

    try:
        for ds_id in dataset_ids:
            datasets = client.list_datasets(id=ds_id)
            if not datasets:
                continue

            docs = datasets[0].list_documents(page=1, page_size=100)
            for doc in docs:
                if document_name.lower() in doc.name.lower():
                    all_chunks = doc.list_chunks(page=1, page_size=200)
                    if not all_chunks:
                        return f"Document '{doc.name}' has no chunks."

                    sorted_chunks = sorted(
                        all_chunks,
                        key=lambda c: (getattr(c, 'position', [0]) or [0])
                    )
                    first_chunk = sorted_chunks[0]

                    chunk_id = getattr(first_chunk, 'id', '')
                    content = getattr(first_chunk, 'content', str(first_chunk))

                    return f"[{doc.name}] #{chunk_id}\n{content}"

        return f"Document '{document_name}' not found in configured datasets."

    except Exception as e:
        logger.error(f"Get first chunk error: {e}")
        return f"Error: {e}"
```

## Files to Create/Modify

| File | Action |
|------|--------|
| `apps/agent/skills/retrieval/SKILL.md` | **NEW** |
| `apps/agent/skills/exploration/SKILL.md` | **NEW** |
| `apps/agent/skills/summarization/SKILL.md` | **NEW** |
| `apps/agent/tools/ragflow.py` | Add `get_first_chunk` tool |
| `apps/agent/prompts/rag_agent.py` | Update system prompt |
| `apps/agent/graphs/rag_agent.py` | Switch to `create_deep_agent` |

## Benefits

- **Progressive disclosure** - Skills loaded on demand, reducing initial context
- **Standard format** - Follows Agent Skills specification
- **File-based** - Easy to update skills without code changes
- **Official support** - Part of Deep Agents framework
