---
phase: 01-foundation-data
plan: 03
type: execute
wave: 2
depends_on:
  - 01
  - 02
files_modified:
  - apps/web/package.json
  - apps/web/lib/copilotkit-provider.tsx
  - apps/web/app/providers.tsx
  - apps/web/app/layout.tsx
autonomous: true
requirements:
  - INFRA-01
  - INFRA-02
  - INFRA-03
must_haves:
  truths:
    - "CopilotKit provider wraps the application"
    - "Application can connect to Research Hub agent"
    - "AG-UI protocol is configured for state streaming"
    - "MCP Apps middleware is available for dynamic component rendering"
  artifacts:
    - path: "apps/web/lib/copilotkit-provider.tsx"
      provides: "CopilotKit provider configuration"
      exports: ["CopilotKitProvider"]
    - path: "apps/web/app/providers.tsx"
      provides: "Combined providers wrapper"
      exports: ["Providers"]
    - path: "apps/web/package.json"
      provides: "Dependencies for CopilotKit, AG-UI, MCP Apps"
  key_links:
    - from: "app/layout.tsx"
      to: "Providers component"
      via: "children wrapper"
      pattern: "<Providers>"
    - from: "CopilotKitProvider"
      to: "LangGraph agent"
      via: "agent URL configuration"
      pattern: "agentUrl|publicApiKey"
---

<objective>
Integrate CopilotKit provider with AG-UI protocol for Research Hub connectivity.

Purpose: Establish AI infrastructure for real-time agent-UI communication.
Output: Wrapped application with CopilotKit provider ready for Research Hub agent.

Architecture Notes:
- This plan sets up the FRONTEND infrastructure (CopilotKit provider)
- AG-UI protocol is built into CopilotKit - no separate configuration needed
- MCP Apps middleware runs on the AGENT SIDE (Plan 04/05), not in the browser
- CopilotKitProvider consumes the AG-UI protocol stream from the agent endpoint
- The Research Hub agent itself is created in Plan 04/05
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation-data/01-CONTEXT.md

<interfaces>
<!-- Existing provider patterns from apps/web -->

From apps/web/app/layout.tsx (expected pattern):
```typescript
// Root layout wraps children with providers
// Pattern: SessionProvider from next-auth
```

From apps/agent/langgraph.json:
```json
{
  "graphs": {
    "agent": "./graphs/rag_agent.py:agent"
  }
}
```

New Research Hub agent will be added as:
```json
{
  "graphs": {
    "agent": "./graphs/rag_agent.py:agent",
    "hub": "./graphs/hub_agent.py:hub_agent"  // Created in plan 04/05
  }
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Install CopilotKit and AG-UI dependencies</name>
  <files>apps/web/package.json</files>
  <action>
    Install required packages for CopilotKit with AG-UI protocol support:

    ```bash
    cd apps/web
    npm install @copilotkit/react-core @copilotkit/react-ui
    ```

    Note: AG-UI protocol support is built into CopilotKit - no separate package needed.
    MCP Apps middleware is configured on the agent side (Plan 04/05), not as a frontend package.

    Verify installation completes successfully.
  </action>
  <verify>
    <automated>cd apps/web && npm list @copilotkit/react-core @copilotkit/react-ui 2>&1 | head -10</automated>
  </verify>
  <done>CopilotKit packages installed, package.json updated</done>
</task>

<task type="auto">
  <name>Task 2: Create CopilotKit provider component</name>
  <files>apps/web/lib/copilotkit-provider.tsx</files>
  <action>
    Create CopilotKit provider configuration at apps/web/lib/copilotkit-provider.tsx.

    The provider should:
    - Configure connection to LangGraph agent endpoint
    - Use environment variable for agent URL (NEXT_PUBLIC_LANGGRAPH_API_URL already exists)
    - Set up AG-UI protocol for state streaming
    - Be a client component ("use client")

    Basic structure:
    ```typescript
    "use client";

    import { CopilotKit } from "@copilotkit/react-core";
    import { CopilotPopup } from "@copilotkit/react-ui";

    const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;

    export function CopilotKitProvider({ children }: { children: React.ReactNode }) {
      return (
        <CopilotKit
          agent={agentUrl}
          // AG-UI protocol is enabled by default in CopilotKit
          // MCP Apps middleware runs on the agent side (Plan 04/05)
          // This provider consumes the AG-UI stream from the agent endpoint
        >
          {children}
        </CopilotKit>
      );
    }
    ```

    Architecture clarification:
    - AG-UI protocol: Built into CopilotKit, streams state updates from agent to UI
    - MCP Apps middleware: Runs in the Python agent (Plan 04/05), enables dynamic component rendering
    - This frontend provider only needs to connect to the agent endpoint

    Note: CopilotPopup UI component can be conditionally rendered in specific pages (Research Hub) rather than globally.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(copilotkit)" | head -10</automated>
  </verify>
  <done>CopilotKit provider component created</done>
</task>

<task type="auto">
  <name>Task 3: Create combined providers wrapper</name>
  <files>apps/web/app/providers.tsx</files>
  <action>
    Create or update apps/web/app/providers.tsx to combine all providers.

    Check if this file exists first. If not, create it.
    Combine: NextAuth SessionProvider + CopilotKitProvider

    Structure:
    ```typescript
    "use client";

    import { SessionProvider } from "next-auth/react";
    import { CopilotKitProvider } from "@/lib/copilotkit-provider";

    export function Providers({ children }: { children: React.ReactNode }) {
      return (
        <SessionProvider>
          <CopilotKitProvider>
            {children}
          </CopilotKitProvider>
        </SessionProvider>
      );
    }
    ```

    If SessionProvider is already in layout.tsx, extract it to this file.
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(providers)" | head -10</automated>
  </verify>
  <done>Combined providers wrapper created</done>
</task>

<task type="auto">
  <name>Task 4: Update root layout to use providers</name>
  <files>apps/web/app/layout.tsx</files>
  <action>
    Update apps/web/app/layout.tsx to wrap children with the Providers component.

    Read the current layout.tsx first to understand existing structure.
    Then update to use the new Providers wrapper.

    The goal is to have:
    ```typescript
    import { Providers } from "./providers";

    export default function RootLayout({ children }) {
      return (
        <html>
          <body>
            <Providers>
              {children}
            </Providers>
          </body>
        </html>
      );
    }
    ```
  </action>
  <verify>
    <automated>cd apps/web && npx tsc --noEmit 2>&1 | grep -E "(layout)" | head -10</automated>
  </verify>
  <done>Root layout updated with Providers wrapper</done>
</task>

</tasks>

<verification>
- CopilotKit packages in package.json
- CopilotKitProvider component exists and exports correctly
- Providers wrapper combines SessionProvider and CopilotKitProvider
- Root layout wraps children with Providers
- TypeScript compiles without errors
- Application still loads (no runtime errors from provider changes)
</verification>

<success_criteria>
- [ ] INFRA-01 satisfied: CopilotKit provider wraps the application
- [ ] INFRA-02 satisfied: AG-UI protocol configured (built into CopilotKit)
- [ ] INFRA-03 satisfied: MCP Apps middleware available (agent-side, configured in plan 04/05)
- [ ] Application loads without errors
- [ ] TypeScript compiles
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-data/03-SUMMARY.md`
</output>
