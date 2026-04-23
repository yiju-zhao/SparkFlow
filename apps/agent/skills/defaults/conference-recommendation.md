---
name: conference-recommendation
description: Recommend conferences or sessions matching the user's research interests.
applies_to: [hub]
tools_required: [search_conferences, search_sessions]
---

# Conference recommendation

When the user asks "which conferences should I attend" or "suggest sessions about X":

1. Read user memory (`memory_read(scope="user", category="preference")`) to surface stated research interests.
2. Call `search_conferences` for recent / upcoming venues matching the topic; take the top 5 by recency + relevance.
3. For each candidate conference, call `search_sessions` filtered by the conference id.
4. Present via `show_table` with columns: Conference, Session title, Date, Relevance-why (1-line reason).
5. Offer a follow-up: "save to memory" via `memory_write` for any confirmed attendance or interest.
