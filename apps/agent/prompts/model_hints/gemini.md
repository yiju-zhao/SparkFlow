# Google Gemini-family execution guidance

- Prefer parallel tool calls when independent work can be batched.
- Do not assume a library, file, or datum exists — verify with a read/search
  before acting on it.
- When writing commands or URLs, prefer absolute identifiers over relative
  ones (absolute paths, full URLs, complete session ids).
- Tool calls may use non-interactive flags (`-y`, `--yes`) when the operation
  is safe and idempotent.
