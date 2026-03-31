---
status: verifying
trigger: "Fix deprecation warnings for visibleMessages and appendMessage in CopilotKit's useCopilotChat hook"
created: 2026-03-09T10:00:00Z
updated: 2026-03-09T10:10:00Z
---

## Current Focus

hypothesis: Use `useCopilotChatInternal()` instead of `useCopilotChat()` to access non-deprecated `messages` and `sendMessage` APIs
test: Change the hook and update the message format to use AG-UI Message type
expecting: No deprecation warnings, chat functionality still works
next_action: Update research-assistant-panel.tsx to use useCopilotChatInternal with Message type from @copilotkit/shared

## Symptoms

expected: No deprecation warnings when using CopilotKit chat functionality
actual: TypeScript shows "'visibleMessages' is deprecated" and "'appendMessage' is deprecated" warnings
errors: Deprecation warnings in research-assistant-panel.tsx lines 74-77
reproduction: Open components/explore/research-assistant-panel.tsx - the useCopilotChat hook returns deprecated APIs
started: Ongoing - these APIs have been deprecated in CopilotKit versions

## Eliminated

- hypothesis: use useCopilotChatHeadless_c
  evidence: This hook requires a publicApiKey and is for enterprise features - not needed for our use case
  timestamp: 2026-03-09T10:05:00Z

## Evidence

- timestamp: 2026-03-09T10:00:00Z
  checked: research-assistant-panel.tsx
  found: Current code uses useCopilotChat() with deprecated visibleMessages and appendMessage
  implication: Need to find non-deprecated alternatives

- timestamp: 2026-03-09T10:03:00Z
  checked: @copilotkit/react-core/dist/index.d.mts
  found: useCopilotChat() returns UseCopilotChatReturn which OMITS messages, sendMessage, and other new APIs
  implication: The public useCopilotChat hook intentionally excludes the new APIs

- timestamp: 2026-03-09T10:04:00Z
  checked: @copilotkit/react-core/dist/index.d.mts
  found: useCopilotChatInternal() returns UseCopilotChatReturn$1 which INCLUDES messages, sendMessage, setMessages, etc.
  implication: useCopilotChatInternal is the correct hook to use for non-deprecated APIs

- timestamp: 2026-03-09T10:05:00Z
  checked: @copilotkit/shared/dist/types/message.d.mts
  found: Message type is a union of AIMessage | ToolResult | UserMessage | SystemMessage | DeveloperMessage | ActivityMessage | ReasoningMessage
  implication: Need to import Message and UserMessage from @copilotkit/shared

- timestamp: 2026-03-09T10:06:00Z
  checked: @ag-ui/core/dist/index.d.ts
  found: UserMessage requires { id: string, role: "user", content: string | ContentPart[] }
  implication: Need to create message with id, role, and content instead of using TextMessage class

## Resolution

root_cause: Using useCopilotChat() which intentionally exposes deprecated APIs (visibleMessages, appendMessage) while the new APIs (messages, sendMessage) are only available through useCopilotChatInternal()
fix: Switch to useCopilotChatInternal(), import Message type from @copilotkit/shared, create messages with { id, role, content } format
verification: TypeScript type check passes, ESLint shows no deprecation warnings
files_changed: [apps/web/components/explore/research-assistant-panel.tsx]
