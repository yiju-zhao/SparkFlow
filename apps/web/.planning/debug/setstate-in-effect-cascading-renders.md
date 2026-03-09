---
status: awaiting_human_verify
trigger: "React lint error - Calling setState synchronously within an effect can trigger cascading renders at research-assistant-panel.tsx line 86"
created: 2026-03-09T00:00:00Z
updated: 2026-03-09T00:00:00Z
---

## Current Focus
hypothesis: The reset logic should be moved to an event handler (the close button click) instead of being in a useEffect
test: Move the reset logic from useEffect to the onOpenChange(false) call site
expecting: The lint error will disappear because setState calls are now in an event handler, not an effect
next_action: Refactor to call reset, setThreadId, and setInput in the close button's onClick handler instead of useEffect

## Symptoms
expected: Panel should close cleanly without React warnings
actual: React lint warning about setState in effect body causing cascading renders
errors: "Avoid calling setState() directly within an effect" at setInput("") call
reproduction: Close the Research Assistant panel - the useEffect runs with multiple setState calls
started: Started after adding setThreadId(uuidv4()) and setInput("") in the useEffect that handles panel close

## Eliminated

## Evidence
- timestamp: 2026-03-09T00:00:00Z
  checked: research-assistant-panel.tsx lines 80-88
  found: useEffect runs when open becomes false, calling reset(), setThreadId(uuidv4()), and setInput("") synchronously
  implication: This is the source of the lint warning - React prefers setState in event handlers, not effects

- timestamp: 2026-03-09T00:00:00Z
  checked: research-assistant-panel.tsx lines 160-167
  found: Close button calls onOpenChange(false) directly at line 164
  implication: The reset logic can be moved here, or we can create a wrapper function that handles both close and reset

## Resolution
root_cause: setState calls (reset, setThreadId, setInput) were being made synchronously within a useEffect that reacted to the `open` prop changing to false. React warns about this pattern because it can cause cascading renders - the effect triggers state updates which may trigger re-renders, potentially leading to performance issues.
fix: Moved the reset logic from the useEffect to a handleClose event handler function. Now when the user closes the panel (via close button or backdrop click), the handler directly calls reset(), setThreadId(), and setInput("") before calling onOpenChange(false). This follows React's best practice of keeping state updates in event handlers rather than side effects.
verification: Lint error is gone (verified with npm run lint). The research-assistant-panel.tsx no longer appears in the lint output for the setState-in-effect warning. Still need human to verify the panel actually works in the browser.
files_changed: ["/Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web/components/explore/research-assistant-panel.tsx"]
