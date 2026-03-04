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
