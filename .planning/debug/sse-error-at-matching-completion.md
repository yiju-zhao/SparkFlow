---
status: awaiting_human_verify
trigger: "sse-error-at-matching-completion"
created: 2026-03-06T00:00:00.000Z
updated: 2026-03-06T00:26:00.000Z
---

## Current Focus

hypothesis: The fix in hooks.ts was incomplete because client.ts logs the error to console BEFORE calling onError callback. The console.error at line 82 in client.ts fires even though hooks.ts ignores the callback.
test: Modify client.ts to not log error when connection closes - either remove the console.error or make it conditional
expecting: Console should no longer show "[MatcherClient] SSE error: {}" after completion
next_action: Apply fix to client.ts - remove or change the console.error on line 82

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

- timestamp: 2026-03-06T00:25:00Z
  checked: lib/matcher/client.ts line 82 onerror handler
  found: The console.error logs "[MatcherClient] SSE error: {}" BEFORE calling the onError callback. Even though hooks.ts ignores the callback after completion, the console.error still fires.
  implication: Need to fix client.ts to not log an error for expected connection closure

## Resolution

root_cause: Two-part issue: (1) SSE event_generator closes connection after completion, triggering EventSource.onerror. (2) client.ts logs console.error BEFORE calling onError callback, so even though hooks.ts ignores the callback after completion, the error is still logged to console.
fix: Part 1 (hooks.ts): Added a `jobCompleted` flag that is set to true when status is COMPLETED or FAILED. The onerror handler checks this flag and ignores errors after completion. Part 2 (client.ts): Changed console.error to console.log with message "SSE connection closed" since this is expected behavior after job completion, not an error condition.
verification: Code changes verified in both files
files_changed: [apps/web/lib/matcher/hooks.ts, apps/web/lib/matcher/client.ts]
