# Frontend Conventions (apps/web)

## CopilotKit

- Use `useCopilotChat()` hook for chat state - `visibleMessages` and `appendMessage` are deprecated but functional
- Suppress deprecation warnings with `// eslint-disable-next-line @typescript-eslint/no-deprecated`
- The non-deprecated APIs (`messages`, `sendMessage`) require `useCopilotChatInternal` which has different types

## React Patterns

- Avoid `setState` inside `useEffect` - causes cascading render warnings
- Move state updates to event handlers instead (e.g., `handleClose` function)
- Reset CopilotKit state on panel close: call `reset()`, then `setThreadId(uuidv4())`

## UUID Generation

- Use `import { v4 as uuidv4 } from "uuid"` - NOT `crypto.randomUUID()`
- `crypto.randomUUID()` requires secure context (HTTPS/localhost) and isn't supported in all browsers

## Tailwind 4

- Use standard spacing classes instead of arbitrary pixel values
- Conversion: `px * 0.25 = Tailwind units` (e.g., `max-w-[280px]` → `max-w-70`)
- Common conversions:
  - `w-[180px]` → `w-45`
  - `h-[300px]` → `h-75`
  - `max-h-[420px]` → `max-h-105`
  - `min-h-[300px]` → `min-h-75`

## Commit Messages

- Use conventional commits: `fix(scope): description` or `feat(scope): description`
- Include `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` footer
