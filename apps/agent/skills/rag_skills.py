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
