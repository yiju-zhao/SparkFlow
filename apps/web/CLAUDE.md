# Frontend Conventions (apps/web)

## CopilotKit

- Use `useCopilotChatInternal()` hook for chat state with non-deprecated APIs
- Import `Message` type from `@copilotkit/shared` for type safety
- Create messages with `{ id: uuidv4(), role: "user", content: "..." } as Message` format
- Example:
  ```typescript
  import { useCopilotChatInternal } from "@copilotkit/react-core";
  import type { Message } from "@copilotkit/shared";

  const { messages, sendMessage, reset, isLoading } = useCopilotChatInternal();

  await sendMessage({ id: uuidv4(), role: "user", content: "Hello" } as Message);
  ```

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
