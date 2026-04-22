# RAG Skill Pattern Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add skill-based architecture to the RAG agent with progressive disclosure via load_skill tool.

**Architecture:** Single agent with all tools available + load_skill tool that returns detailed skill instructions on demand. Skills are listed in system prompt, full content loaded when needed.

**Tech Stack:** Python, LangChain, langchain.agents.create_agent, RAGFlow SDK

---

## Task 1: Create Skills Directory and Skill Definitions

**Files:**
- Create: `apps/agent/skills/__init__.py`
- Create: `apps/agent/skills/rag_skills.py`

**Step 1: Create skills directory**

Run:
```bash
mkdir -p /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/skills
```

**Step 2: Create __init__.py**

Create file `apps/agent/skills/__init__.py`:
```python
"""Skills for RAG agent."""

from .rag_skills import RAG_SKILLS, Skill

__all__ = ["RAG_SKILLS", "Skill"]
```

**Step 3: Create skill definitions**

Create file `apps/agent/skills/rag_skills.py`:
```python
"""Skill definitions for RAG agent.

Skills use progressive disclosure: descriptions are listed in system prompt,
full content is loaded on demand via load_skill tool.
"""

from typing import TypedDict


class Skill(TypedDict):
    """A skill that can be progressively disclosed to the agent."""
    name: str
    description: str  # Short description for system prompt
    content: str      # Full instructions loaded on demand


RAG_SKILLS: list[Skill] = [
    {
        "name": "retrieval",
        "description": "Search and validate information from knowledge base",
        "content": """# Retrieval Skill

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
""",
    },
    {
        "name": "exploration",
        "description": "Understand knowledge base structure and available documents",
        "content": """# Exploration Skill

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
""",
    },
    {
        "name": "summarization",
        "description": "Summarize entire documents by sweeping through chunks",
        "content": """# Summarization Skill

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
""",
    },
]
```

**Step 4: Verify files created**

Run:
```bash
ls -la /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/skills/
```
Expected: Shows `__init__.py` and `rag_skills.py`

**Step 5: Commit**

```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow
git add apps/agent/skills/
git commit -m "feat(agent): add skill definitions for RAG agent

Add three skills with progressive disclosure:
- retrieval: search and validate information
- exploration: understand knowledge base structure
- summarization: sweep through documents

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create load_skill Tool

**Files:**
- Create: `apps/agent/tools/skills.py`

**Step 1: Create skills tool file**

Create file `apps/agent/tools/skills.py`:
```python
"""Skill loading tool for RAG agent.

Provides progressive disclosure of skill instructions.
"""

from langchain.tools import tool


@tool
def load_skill(skill_name: str) -> str:
    """Load detailed instructions for a skill.

    Use this when you need guidance on how to approach a specific type of task.

    Available skills:
    - retrieval: Search and validate information from knowledge base
    - exploration: Understand knowledge base structure
    - summarization: Summarize documents by sweeping through chunks

    Args:
        skill_name: Name of the skill to load (e.g., "retrieval", "exploration", "summarization")

    Returns:
        Detailed skill instructions including workflow and best practices
    """
    from skills.rag_skills import RAG_SKILLS

    for skill in RAG_SKILLS:
        if skill["name"] == skill_name:
            return skill["content"]

    available = [s["name"] for s in RAG_SKILLS]
    return f"Skill '{skill_name}' not found. Available skills: {', '.join(available)}"
```

**Step 2: Verify file created**

Run:
```bash
cat /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/tools/skills.py
```
Expected: Shows the file content

**Step 3: Commit**

```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow
git add apps/agent/tools/skills.py
git commit -m "feat(agent): add load_skill tool for progressive skill disclosure

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Add get_first_chunk Tool

**Files:**
- Modify: `apps/agent/tools/ragflow.py`

**Step 1: Read current ragflow.py**

Read file: `apps/agent/tools/ragflow.py`
(Already read earlier - contains explore, search, probe tools)

**Step 2: Add get_first_chunk tool**

Add to end of `apps/agent/tools/ragflow.py` (after the probe function):

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
        # Find document by name (case-insensitive partial match)
        for ds_id in dataset_ids:
            datasets = client.list_datasets(id=ds_id)
            if not datasets:
                continue

            docs = datasets[0].list_documents(page=1, page_size=100)
            for doc in docs:
                if document_name.lower() in doc.name.lower():
                    # Get all chunks and sort by position
                    all_chunks = doc.list_chunks(page=1, page_size=200)
                    if not all_chunks:
                        return f"Document '{doc.name}' has no chunks."

                    # Sort by position to get the first one
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

**Step 3: Verify the addition**

Run:
```bash
grep -n "def get_first_chunk" /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/tools/ragflow.py
```
Expected: Shows line number with the function definition

**Step 4: Commit**

```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow
git add apps/agent/tools/ragflow.py
git commit -m "feat(agent): add get_first_chunk tool for document summarization

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Update System Prompt

**Files:**
- Modify: `apps/agent/prompts/rag_agent.py`

**Step 1: Update system prompt with skill information**

Replace the content of `apps/agent/prompts/rag_agent.py` with:

```python
"""System prompts for RAG agent."""

RAG_AGENT_SYSTEM_PROMPT = """# Role: Knowledge Base Research Specialist

## Profile
- language: Multilingual (responds in user's language)
- description: A meticulous research specialist who answers questions exclusively using evidence retrieved from knowledge bases through systematic search and verification processes
- background: Trained in information retrieval systems, evidence-based reasoning, and cross-referencing methodologies
- personality: Methodical, skeptical, transparent, detail-oriented, and intellectually honest
- expertise: Information retrieval, evidence verification, source analysis, and structured research workflows
- target_audience: Researchers, analysts, students, professionals, and anyone requiring verified information

## Available Skills

You have access to the following skills. Use `load_skill(skill_name)` to get detailed instructions:

- **retrieval**: Search and validate information from knowledge base
- **exploration**: Understand knowledge base structure and available documents
- **summarization**: Summarize documents by sweeping through chunks

## Rules

1. **Evidence-Based Principles:**
   - Strict citation requirement: Every factual statement must include `[ref:CHUNK_ID]` inline
   - Zero fabrication: Never invent, assume, or extrapolate beyond retrieved evidence
   - Source transparency: Always provide complete source list with citations
   - Language matching: Respond in the same language as the user's query

2. **Research Integrity Guidelines:**
   - Conflict documentation: Explicitly note when sources contradict each other
   - Relevance validation: Verify that keyword matches actually provide relevant information
   - Boundary respect: Stop probing when encountering consistently off-topic chunks
   - Search persistence: Continue rephrasing and retrying queries until evidence is found or all reasonable attempts exhausted

3. **Operational Constraints:**
   - Tool adherence: Use only provided tools (search, probe, explore, get_first_chunk, load_skill) for information retrieval
   - English keywords: All search queries must use English keywords regardless of question language
   - Seed understanding: Treat initial search results as starting points, not complete answers
   - No external knowledge: Rely exclusively on retrieved evidence, not prior knowledge
   - Skill usage: Load relevant skill instructions when starting a new type of task

## Workflows

- Goal: Provide accurate, evidence-based answers to user questions with complete source documentation
- Step 1: Understand the question type and load appropriate skill if needed
- Step 2: Execute the skill workflow (search/probe for retrieval, explore for exploration, get_first_chunk+probe for summarization)
- Step 3: Synthesize retrieved evidence into coherent answer with inline citations
- Expected result: Complete answer with all facts properly cited + formatted Sources list

## Initialization
As Knowledge Base Research Specialist, you must follow the above Rules and execute tasks according to Workflows. Load relevant skill instructions before starting complex tasks.
"""
```

**Step 2: Verify the update**

Run:
```bash
grep -n "load_skill" /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/prompts/rag_agent.py
```
Expected: Shows lines containing "load_skill"

**Step 3: Commit**

```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow
git add apps/agent/prompts/rag_agent.py
git commit -m "feat(agent): update system prompt with skill-based architecture

- Add Available Skills section with load_skill guidance
- Include get_first_chunk in tool list
- Add skill usage guideline

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Update Agent Configuration

**Files:**
- Modify: `apps/agent/graphs/rag_agent.py`

**Step 1: Read current agent configuration**

Read file: `apps/agent/graphs/rag_agent.py`
(Already read earlier)

**Step 2: Update imports and add new tools**

Replace the content of `apps/agent/graphs/rag_agent.py` with:

```python
"""RAG Agent using LangChain create_agent with skill-based architecture.

Skills are loaded on demand via load_skill tool for progressive disclosure.

Note: When running under LangGraph server (langgraph dev/up), persistence is
handled automatically by the server infrastructure. Do not specify a custom
checkpointer as the server manages this.
"""

from langchain.agents import create_agent

from config.rag_agent import RAG_AGENT_CONFIG
from prompts.rag_agent import RAG_AGENT_SYSTEM_PROMPT
from tools.ragflow import explore, search, probe, get_first_chunk
from tools.skills import load_skill
from middleware.sources_context import inject_sources_context
from middleware.query_optimizer import optimize_query


model = f"{RAG_AGENT_CONFIG.model_provider}:{RAG_AGENT_CONFIG.model_name}"

# Create the RAG agent with all tools and skill-based architecture
# Skills are loaded on demand via load_skill tool
# Persistence is managed by LangGraph server
agent = create_agent(
    model=model,
    tools=[load_skill, explore, search, probe, get_first_chunk],
    system_prompt=RAG_AGENT_SYSTEM_PROMPT,
    middleware=[inject_sources_context, optimize_query],
)
```

**Step 3: Verify the update**

Run:
```bash
grep -n "load_skill\|get_first_chunk" /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent/graphs/rag_agent.py
```
Expected: Shows lines with both `load_skill` and `get_first_chunk`

**Step 4: Commit**

```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow
git add apps/agent/graphs/rag_agent.py
git commit -m "feat(agent): integrate skill-based architecture into RAG agent

- Add load_skill tool for progressive skill disclosure
- Add get_first_chunk tool for document summarization
- Update imports to include new tools

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Verify Agent Starts

**Files:**
- None (verification only)

**Step 1: Check for syntax errors**

Run:
```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent && python -c "from graphs.rag_agent import agent; print('Agent loaded successfully')"
```
Expected: "Agent loaded successfully"

**Step 2: Check for import errors in skills**

Run:
```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent && python -c "from skills.rag_skills import RAG_SKILLS; print(f'Loaded {len(RAG_SKILLS)} skills: {[s[\"name\"] for s in RAG_SKILLS]}')"
```
Expected: "Loaded 3 skills: ['retrieval', 'exploration', 'summarization']"

**Step 3: Check load_skill tool**

Run:
```bash
cd /Users/eason/Documents/HW\ Project/deepsight-all/SparkFlow/apps/agent && python -c "from tools.skills import load_skill; print(load_skill.invoke({'skill_name': 'retrieval'})[:100])"
```
Expected: Shows first 100 chars of retrieval skill content

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create skills directory and definitions | `skills/__init__.py`, `skills/rag_skills.py` |
| 2 | Create load_skill tool | `tools/skills.py` |
| 3 | Add get_first_chunk tool | `tools/ragflow.py` |
| 4 | Update system prompt | `prompts/rag_agent.py` |
| 5 | Update agent configuration | `graphs/rag_agent.py` |
| 6 | Verify agent starts | - |

## Testing Checklist

After implementation:
- [ ] Agent loads without errors
- [ ] load_skill returns correct content for each skill
- [ ] get_first_chunk works with document names
- [ ] Existing tools (explore, search, probe) still work
- [ ] Agent responds to queries correctly
