---
status: awaiting_human_verify
trigger: "Error: Message not found - appears when using Research Assistant panel with CopilotKit integration"
created: 2026-03-09T00:00:00Z
updated: 2026-03-09T00:30:00Z
---

## Current Focus
hypothesis: Fix implemented - awaiting human verification
test: TypeScript compilation passed. Need manual testing.
expecting: User opens panel, sends message, closes panel, reopens panel, sends new message - no error should occur
next_action: Request human verification of the fix

## Eliminated

## Symptoms
expected: Research Assistant panel should send messages and receive AI responses without errors
actual: "Message not found" error appears, possibly during message sending or state transitions
errors: "Error: Message not found" at unhandledRejection
reproduction: Use the Research Assistant panel in the explore hub, send a message
started: Started after implementing CopilotKit integration in Phase 2

## Eliminated

## Evidence

- timestamp: 2026-03-09T00:05:00Z
  checked: research-assistant-panel.tsx
  found: Uses useCopilotChat() with appendMessage() to send messages. Calls reset() when panel closes.
  implication: reset() might be clearing message state incorrectly, or there's a race condition with appendMessage

- timestamp: 2026-03-09T00:05:00Z
  checked: CopilotKit versions
  found: All @copilotkit packages at version ^1.52.1
  implication: Using recent version - check for known issues in this version

- timestamp: 2026-03-09T00:05:00Z
  checked: copilotkit-provider.tsx
  found: CopilotKit configured with runtimeUrl="/api/copilotkit" agent="hub"
  implication: Standard setup, no obvious issues

- timestamp: 2026-03-09T00:05:00Z
  checked: API route
  found: Uses LangGraphAgent with hub agent. Uses ExperimentalEmptyAdapter.
  implication: ExperimentalEmptyAdapter might have issues with message state management

- timestamp: 2026-03-09T00:10:00Z
  checked: @ag-ui/langgraph source code
  found: "Message not found" error thrown in getCheckpointByMessage() method. This method is called during prepareRegenerateStream() when the agent tries to find a checkpoint for a message ID that doesn't exist in thread history.
  implication: Error occurs when: 1) Message ID is invalid/not in history, 2) Thread history is empty or corrupted, 3) reset() clears local messages but thread still has references

- timestamp: 2026-03-09T00:10:00Z
  checked: getCheckpointByMessage call chain
  found: prepareRegenerateStream() -> getCheckpointByMessage(). prepareRegenerateStream is called when thread has more messages than local state.
  implication: Error happens when: thread has messages from previous run, local state is empty (after reset), and agent tries to find message ID that doesn't exist in thread history

- timestamp: 2026-03-09T00:15:00Z
  checked: reset() in CopilotKit useCopilotChat hook
  found: reset() only calls agent?.setMessages([]) and agent?.setState(null). It does NOT reset the thread ID.
  implication: When panel closes and reset() is called, messages are cleared but thread ID persists. When user reopens and sends a message, CopilotKit tries to use the existing thread which has old messages, but the new message ID doesn't exist in that thread's history.

## Resolution
root_cause: When the Research Assistant panel closes, reset() only clears messages and state but NOT the thread ID. When panel reopens and user sends a new message, CopilotKit sees the existing thread has more messages than local state and tries to find the new message ID in thread history - which doesn't exist because it's a new message with a new ID. This triggers "Message not found" error in getCheckpointByMessage().
fix: Added useThreads() hook to get setThreadId function. When panel closes, now calls both reset() AND setThreadId(crypto.randomUUID()) to create a fresh thread for the next session.
verification: TypeScript compilation passes with no errors. Need manual testing to verify the error no longer occurs.
files_changed: [apps/web/components/explore/research-assistant-panel.tsx]
