---
name: memory-bootstrap
description: Seed user-level memory with preferences inferred from the current conversation.
applies_to: []
tools_required: [memory_read, memory_write]
---

# Memory bootstrap

When the user is new (no user-level memory entries yet) and mentions something that looks like a lasting preference:

1. Check with `memory_read(scope="user", category="preference")` to avoid duplicates.
2. If genuinely new, confirm with the user in one line: "I'll remember you prefer X — okay?"
3. On confirmation, call `memory_write(scope="user", category="preference", content="<short statement>", user_id=<current>)`.
4. Do NOT seed memory for one-off facts or things that won't matter next session. Err on NOT writing.
