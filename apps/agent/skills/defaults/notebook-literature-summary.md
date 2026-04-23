---
name: notebook-literature-summary
description: Summarize the cited sources in a notebook, organized by theme.
applies_to: [notebook]
tools_required: [wiki_search, source_read]
---

# Notebook literature summary

When the user asks for a summary of the notebook's sources or "what do my papers say about X", follow this approach:

1. Call `wiki_search` (if available) with the topic keyword to surface the relevant wiki pages and their source ids.
2. Group matching sources by theme (method, dataset, result).
3. For each group, call `source_read(notebook_id, source_id)` on the strongest 1-2 representative sources and quote exact passages.
4. Produce a 3-section summary: **Consensus**, **Disagreements**, **Open questions**. Cite `[source:id]` inline for every claim.
5. End with a one-line "what to read next" suggestion if any source stood out as a deeper dive.

If `wiki_search` is unavailable, fall back to `source_list` + manual filtering by title keyword.
