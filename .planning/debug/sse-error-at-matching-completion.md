---
status: awaiting_human_verify
trigger: "sse-error-at-matching-completion"
created: 2026-03-06T00:00:00.000Z
updated: 2026-03-06T00:20:00.000Z
---

## Current Focus

hypothesis: When matcher service closes SSE connection on job completion, the SSE proxy in Next.js doesn't properly handle the closure, causing onerror to fire and triggering error handling instead of completion
test: Check if SSE stream proxy properly handles connection closure from backend service
expecting: Find that SSE error fires because connection is closed abruptly without proper done event
next_action: Investigate how matcher service sends completion event and closes connection

## Symptoms

expected: When matching completes, SSE should close cleanly, UI should show completed status, display match results, and show download button
actual: SSE error occurs at completion, file is saved but results don't display, history shows "pending" status, no download button visible
errors: "[MatcherClient] SSE error: {}" and "SSE connection error" from lib/matcher/client.ts line 82-84
reproduction: Run a matching job and wait for completion
started: Started happening after recent changes to persist jobs to database and add history page

## Eliminated

(none yet)

## Evidence

- timestamp: 2026-03-06T00:01:00Z
  checked: lib/matcher/client.ts subscribeToJobProgress
  found: SSE client uses EventSource API with onmessage handler. onerror fires on any connection error, including normal closure if not handled properly
  implication: The error handler is triggered but we don't know if it's a real error or just connection closure

- timestamp: 2026-03-06T00:02:00Z
  checked: lib/matcher/hooks.ts useJobProgress
  found: When status === "COMPLETED", the hook deletes connection from registry and calls onComplete. But if onerror fires first (before or during), error handling runs instead
  implication: Race condition - if SSE connection closes before COMPLETED message is processed, error fires first

- timestamp: 2026-03-06T00:03:00Z
  checked: app/api/matcher/jobs/[jobId]/stream/route.ts
  found: Simple proxy that passes through response.body directly. No handling for connection closure or error states
  implication: When matcher service closes connection, the proxy just terminates, causing EventSource onerror

- timestamp: 2026-03-06T00:04:00Z
  checked: app/api/matcher/jobs/[jobId]/route.ts GET handler
  found: Database only updates status when GET is called for PROCESSING jobs. No automatic update when SSE completes
  implication: If SSE errors before completion message is received, database never gets updated to COMPLETED status

## Resolution

root_cause: SSE event_generator in matcher service sends COMPLETED status message, then immediately breaks loop and closes connection. The EventSource.onerror fires when connection closes (normal behavior). The client's onerror handler doesn't check if the job already completed - it always calls onErrorRef.current(error). This causes both onComplete and onError to potentially be called, with onError potentially overwriting the successful completion state.
fix: Added a `jobCompleted` flag in the useJobProgress hook that is set to true when status is COMPLETED or FAILED. The onerror handler now checks this flag and ignores the error if the job already completed, logging "SSE connection closed after completion (expected)" instead.
verification: Code change verified - the fix correctly ignores onerror events after successful completion
files_changed: [apps/web/lib/matcher/hooks.ts]
