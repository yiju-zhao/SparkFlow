---
status: awaiting_human_verify
trigger: "copilotkit-deprecated-apis-and-tailwind-lint"
created: 2026-03-09T00:00:00Z
updated: 2026-03-09T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - Use `useCopilotChatInternal` instead of `useCopilotChat` to access non-deprecated APIs
test: Replace useCopilotChat with useCopilotChatInternal, update imports
expecting: No deprecation warnings, TypeScript compiles
next_action: Apply fix using useCopilotChatInternal

## Symptoms

expected: No deprecation warnings or lint suggestions
actual: Three warnings/errors showing in diagnostics
errors:
- 'appendMessage' is deprecated [6385]
- 'visibleMessages' is deprecated [6385]
- The class `max-h-[420px]` can be written as `max-h-105`
reproduction: Open research-assistant-panel.tsx in editor
started: Ongoing - these APIs have been deprecated in newer CopilotKit versions

## Eliminated

## Evidence

- timestamp: 2026-03-09T00:00:00Z
  checked: research-assistant-panel.tsx line 74
  found: `const { visibleMessages, appendMessage, reset, isLoading } = useCopilotChat();`
  implication: Need to identify replacement APIs from useCopilotChat hook

- timestamp: 2026-03-09T00:00:01Z
  checked: @copilotkit/react-core/src/hooks/use-copilot-chat_internal.ts
  found: |
    - Line 145-150: visibleMessages is deprecated, use `messages` instead (AG-UI format)
    - Line 157-161: appendMessage is deprecated, use `sendMessage` instead
    - Line 163-177: sendMessage takes Message type with { id, role, content }
    - Line 155: messages: Message[] is the new format
  implication: Replace visibleMessages -> messages, appendMessage -> sendMessage, import Message from @copilotkit/shared

- timestamp: 2026-03-09T00:00:02Z
  checked: @copilotkit/react-core/src/hooks/use-copilot-chat.ts
  found: |
    - Line 83-95: UseCopilotChatReturn type excludes messages, sendMessage, suggestions, etc.
    - Line 104-131: useCopilotChat only returns deprecated visibleMessages and appendMessage
  implication: The public useCopilotChat hook intentionally omits non-deprecated APIs

- timestamp: 2026-03-09T00:00:03Z
  checked: @copilotkit/react-core/src/hooks/use-copilot-chat-headless_c.ts
  found: |
    - Line 216-218: useCopilotChatHeadless_c requires publicApiKey (premium feature)
    - Line 229-240: Shows banner error if no publicApiKey
  implication: Cannot use useCopilotChatHeadless_c without premium API key

- timestamp: 2026-03-09T00:00:04Z
  checked: @copilotkit/react-core/src/hooks/index.ts
  found: Line 10-14 exports useCopilotChatInternal with messages and sendMessage
  implication: Use useCopilotChatInternal instead of useCopilotChat to access non-deprecated APIs

## Resolution

root_cause: Using deprecated CopilotKit APIs (appendMessage, visibleMessages) from useCopilotChat hook. The public useCopilotChat hook intentionally omits the non-deprecated APIs (messages, sendMessage), which are only available in useCopilotChatInternal or the premium useCopilotChatHeadless_c hook.

fix: |
  1. Changed import from useCopilotChat to useCopilotChatInternal
  2. Replaced visibleMessages with messages
  3. Replaced appendMessage with sendMessage
  4. Changed import from TextMessage/MessageRole to Message type from @copilotkit/shared
  5. Updated sendMessage call to use plain object { id, role, content } instead of TextMessage class
  6. Updated helper functions to use Message type instead of DeprecatedGqlMessage

verification: TypeScript compiles successfully, ESLint passes with no errors

files_changed:
  - apps/web/components/explore/research-assistant-panel.tsx
fix:
verification:
files_changed: []
