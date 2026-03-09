---
phase: 02-research-hub
plan: 03
completed: 2026-03-06
commits:
  - 1d19f14: feat(02-03): wire page context to AI assistant
requirements_satisfied:
  - GENUI-04
  - GENUI-06
---

# Plan 02-03: Page Context Wiring - COMPLETED

## Summary

Wired page context to the AI assistant so it knows what the user is viewing, enabling contextual questions and generated component navigation.

## Files Created/Modified

| File | Description |
|------|-------------|
| `apps/web/app/explore/ai-context.tsx` | Context provider for AI context sharing |
| `apps/web/app/explore/set-ai-context.tsx` | Component for pages to set context |
| `apps/web/app/explore/explore-shell-wrapper.tsx` | Shell wrapper with context support |
| `apps/web/app/explore/explore-shell.tsx` | Exported AIContext and ExploreShellProps types |
| `apps/web/app/explore/layout.tsx` | Updated to use ExploreShellWrapper |
| `apps/web/app/explore/conferences/[id]/page.tsx` | Passes conferenceId and conferenceName |
| `apps/web/app/explore/sessions/[id]/page.tsx` | Passes sessionId and sessionTitle |

## Implementation Details

### Context Architecture
- Created `AIContextProvider` using React context
- `useSetAIContext` hook sets context and auto-clears on unmount
- `SetAIContext` component for server components to use

### Conference Detail Page
- Passes `conferenceId` and `conferenceName` (venue name + year)
- Context enables "Tell me about this conference" questions

### Session Detail Page
- Passes `sessionId` and `sessionTitle`
- Context enables session-specific suggestions

## Deviations from Plan

- Used React context pattern instead of wrapping pages with ExploreShell
- This approach avoids nested shells while still passing context through layout

## Verification

- TypeScript compiles without errors
- Conference page sets AI context via SetAIContext component
- Session page sets AI context via SetAIContext component
- Context flows through layout's ExploreShellWrapper to ResearchAssistantPanel

## Checkpoint: Manual Verification Required

Per plan specification, the following manual tests are required:
1. Start the LangGraph agent server
2. Start the Next.js dev server
3. Navigate to /explore
4. Test Research Assistant panel functionality
5. Test context awareness on conference/session detail pages
6. Test generative UI (tables, charts)
7. Test row navigation from generated tables
8. Test panel reset on close
