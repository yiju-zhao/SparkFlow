---
status: awaiting_human_verify
trigger: "crypto.randomUUID is not a function TypeError in research-assistant-panel.tsx at line 84"
created: 2026-03-09T00:00:00.000Z
updated: 2026-03-09T00:00:00.000Z
---

## Current Focus

hypothesis: crypto.randomUUID() is not available in all browser contexts (requires secure context HTTPS/localhost, not supported in older browsers)
test: Replace with uuid package v4() function which is already installed
expecting: Error resolved, thread ID generated successfully
next_action: Apply fix by importing uuid and replacing crypto.randomUUID()

## Symptoms

expected: When the research assistant panel closes, a new thread ID should be generated using crypto.randomUUID()
actual: Console throws TypeError: crypto.randomUUID is not a function
errors: TypeError: crypto.randomUUID is not a function
  at ResearchAssistantPanel.useEffect (components/explore/research-assistant-panel.tsx:84:26)
reproduction: Open research assistant panel, then close it - the useEffect tries to generate a new thread ID
started: Started when code was added or when testing in non-HTTPS/older browser context

## Eliminated

## Evidence

- timestamp: 2026-03-09T00:00:00.000Z
  checked: apps/web/components/explore/research-assistant-panel.tsx line 84
  found: setThreadId(crypto.randomUUID()) - uses browser crypto API directly
  implication: crypto.randomUUID() requires secure context (HTTPS/localhost) and is not supported in older browsers

- timestamp: 2026-03-09T00:00:00.000Z
  checked: apps/web/package.json
  found: uuid package version ^13.0.0 is already installed
  implication: Can use uuid v4() as cross-browser compatible replacement

## Resolution

root_cause: crypto.randomUUID() is a Web Crypto API that only works in secure contexts (HTTPS or localhost) and is not supported in all browsers. The code was using this browser-native API without fallback.
fix: Replaced crypto.randomUUID() with uuid package's v4() function - imported uuid and changed line 85 from crypto.randomUUID() to uuidv4()
verification: Awaiting human verification
files_changed: [apps/web/components/explore/research-assistant-panel.tsx]
