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
