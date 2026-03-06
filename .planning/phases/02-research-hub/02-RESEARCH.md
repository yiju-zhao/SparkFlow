# Phase 2: Research Hub - Research

**Researched:** 2026-03-06
**Domain:** AI-powered conference discovery with generative UI via CopilotKit
**Confidence:** HIGH

## Summary

Phase 2 delivers an AI assistant integrated into the Research Hub that can generate dynamic tables, charts, and filtered views inline in the chat panel. The implementation leverages CopilotKit's generative UI capabilities (`useComponent` hook) to render React components based on agent tool calls. The existing codebase already has:

1. **CopilotKit infrastructure** - Provider wraps the app, LangGraphAgent configured for the "hub" agent
2. **Hub agent** - Already built with query tools (list_venues, list_instances, list_sessions, search_sessions)
3. **UI components** - ECharts for charts, Shadcn/UI table components, existing chart patterns
4. **Research assistant panel** - Floating trigger + slide-over panel with simulated responses (to be replaced)

The key technical decision is using CopilotKit's `useComponent` hook (v2 API) to register generative UI components that the agent can invoke. These components render inline in the chat with full interactivity.

**Primary recommendation:** Use CopilotKit `useComponent` from `@copilotkit/react-core/v2` to register chart/table components, connecting them to the existing Hub agent which will call tools that return structured data for rendering.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### AI Assistant Integration
- **Entry point**: Floating panel with trigger button (bottom-right). Opens a slide-over panel for AI chat.
- **Agent connection**: Replace simulated responses with real Hub agent calls via CopilotKit. Agent responds with text + generative UI components.
- **Context awareness**: AI knows which conference/session the user is viewing. Can answer "Tell me about this conference" contextually.
- **Suggestions**: Context-aware suggestions that update based on current page (not static).
- **State management**: Reset on panel close. No persistence across browser sessions.

#### Generative UI Placement
- **Render location**: Generated components (tables, charts) render inline in the chat panel. User scrolls chat history to see them.
- **Interactivity**: Fully interactive components:
  - Tables are sortable/filterable
  - Charts have hover details
  - Click table rows to navigate to detail pages
- **Chart types**: Bar, line, and pie charts (as per GENUI-02/03 requirements)
- **Large datasets**: Paginated results. Show first 20 rows with "Load more" or pagination controls.
- **Render mechanism**: MCP Apps structured approach. Agent returns structured data + component type. Frontend renders appropriate component.

#### Hub Landing Experience
- **AI behavior**: On-demand only. No proactive engagement, greetings, or inline insights. User initiates all interactions.
- **Landing layout**: Keep existing layout (stats, year/topic charts, recent conferences). Just add AI panel availability.
- **Navigation**: Keep existing nav structure (Conferences, Sessions, Publications, Toolbox).
- **Availability**: AI panel available on ALL pages including detail pages. Consistent floating trigger everywhere.

#### Filter + AI Integration
- **Filtering approach**: Manual filters only. AI does NOT apply filters to the FilterBar. Clear separation of concerns.
- **Search**: Keyword search + AI natural language search coexist. Both available for different use cases.
- **Filter UX**: Keep existing FilterBar component unchanged. AI can answer questions about filtered data but doesn't change filter state.

### Claude's Discretion
- Exact styling of generated components (tables, charts)
- Animation/transition details for panel open/close
- Error states for failed AI queries
- Empty state for generated components with no data

### Deferred Ideas (OUT OF SCOPE)
- AI-driven filter application
- Conversation persistence across sessions
- Proactive AI suggestions/greetings
- Additional chart types (scatter, area, radar)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| RHUB-01 | User can view list of all conferences with basic stats | Existing: ConferenceGrid + ConferenceCard components, getConferences query |
| RHUB-02 | User can browse sessions within a conference | Existing: Conference detail page with sessions, getSession queries |
| RHUB-03 | User can view session detail page | Existing: Session detail page at /explore/sessions/[id] |
| RHUB-04 | User can filter sessions by topic tag | Existing: FilterBar component with topic options |
| RHUB-05 | User can filter sessions by date | Existing: FilterBar component with date filtering |
| RHUB-06 | User can filter sessions by speaker name | Existing: FilterBar component with speaker options |
| RHUB-07 | User can search sessions by keyword | Existing: search_sessions tool in hub agent, FilterBar |
| GENUI-01 | User can ask AI assistant questions about hub content | CopilotKit integration with LangGraphAgent for hub |
| GENUI-02 | AI assistant can generate dynamic tables from query results | CopilotKit useComponent hook + existing Table UI components |
| GENUI-03 | AI assistant can generate dynamic charts (bar, line, pie) | CopilotKit useComponent hook + existing ECharts patterns |
| GENUI-04 | AI assistant can generate filtered views based on constraints | Agent tools return filtered data, useComponent renders results |
| GENUI-05 | Generated UI components render in assistant panel | CopilotKit renders useComponent inline in chat |
| GENUI-06 | User can interact with generated components | Tables sortable, charts have tooltips, row clicks navigate |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @copilotkit/react-core | ^1.52.1 | CopilotKit core with generative UI | Already installed, provides useComponent hook |
| @copilotkit/runtime | ^1.52.1 | CopilotKit runtime for Next.js | Already installed, handles agent communication |
| echarts | ^5.6.0 | Chart library (bar, line, pie) | Already installed, used in hub charts |
| recharts | ^3.7.0 | Alternative chart library | Already installed, simpler API for generative UI |
| framer-motion | ^12.23.26 | Animations for panel | Already installed, used in research-assistant-panel |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.5 | Schema validation for useComponent | Define component prop types |
| @radix-ui/react-* | various | Shadcn/UI primitives | Already installed for UI components |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| ECharts | Recharts | Recharts has simpler declarative API for generative UI; ECharts more powerful but complex |
| useComponent | MCP Apps | MCP Apps requires MCP server setup; useComponent simpler for React-native components |

**Installation:**
No new packages required - all dependencies already installed.

## Architecture Patterns

### Recommended Project Structure
```
apps/web/
├── components/
│   └── explore/
│       ├── research-assistant-panel.tsx  # Update: integrate CopilotKit
│       └── generative-ui/                 # NEW: generative UI components
│           ├── generative-table.tsx       # Dynamic table from agent data
│           ├── generative-chart.tsx       # Dynamic charts (bar, line, pie)
│           └── index.ts                   # Exports + useComponent registrations
├── lib/
│   └── copilotkit-provider.tsx           # Update: add context provider
└── app/
    └── api/copilotkit/route.ts           # Already configured for hub agent
```

### Pattern 1: CopilotKit Generative UI with useComponent

**What:** Register React components that the agent can invoke to render UI inline in chat.

**When to use:** When you want the AI to display structured data (tables, charts) instead of just text.

**Example:**
```tsx
// components/explore/generative-ui/generative-chart.tsx
import { z } from "zod";
import { useComponent } from "@copilotkit/react-core/v2";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
} from "recharts";

// Define the schema for the component props
export const GenerativeChartProps = z.object({
  title: z.string().describe("Chart title"),
  chartType: z.enum(["bar", "line", "pie"]).describe("Type of chart"),
  data: z.array(z.object({
    label: z.string().describe("X-axis label or pie segment name"),
    value: z.number().describe("Y-axis value or pie segment value"),
  })).describe("Chart data points"),
});

// Chart colors matching existing hub palette
const CHART_COLORS = ["#00D084", "#3b82f6", "#eab308", "#a855f7", "#ef4444", "#f97316"];

function GenerativeChart({ title, chartType, data }: z.infer<typeof GenerativeChartProps>) {
  if (!data || data.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        No data to display
      </div>
    );
  }

  return (
    <div className="bg-card rounded-lg p-4 my-2">
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        {chartType === "bar" ? (
          <BarChart data={data} layout="vertical">
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 12 }} />
            <Tooltip />
            <Bar dataKey="value" fill="#00D084" radius={[0, 4, 4, 0]} />
          </BarChart>
        ) : chartType === "line" ? (
          <LineChart data={data}>
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#00D084" strokeWidth={2} dot={{ fill: "#00D084" }} />
          </LineChart>
        ) : (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export default GenerativeChart;
```

**Registration pattern:**
```tsx
// components/explore/generative-ui/index.ts
"use client";

import { useComponent } from "@copilotkit/react-core/v2";
import GenerativeChart, { GenerativeChartProps } from "./generative-chart";
import GenerativeTable, { GenerativeTableProps } from "./generative-table";

// Register generative UI components
export function useGenerativeComponents() {
  useComponent({
    name: "showChart",
    description: "Display a chart (bar, line, or pie) with data from the research hub",
    parameters: GenerativeChartProps,
    render: GenerativeChart,
  });

  useComponent({
    name: "showTable",
    description: "Display a table with session or conference data",
    parameters: GenerativeTableProps,
    render: GenerativeTable,
  });
}
```

**Source:** [CopilotKit Generative UI Docs](https://docs.copilotkit.ai/generative-ui/your-components)

### Pattern 2: Interactive Table with Row Navigation

**What:** A table component that supports sorting and row clicks to navigate to detail pages.

**Example:**
```tsx
// components/explore/generative-ui/generative-table.tsx
"use client";

import { z } from "zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronUp, ChevronDown, ExternalLink } from "lucide-react";

export const GenerativeTableProps = z.object({
  title: z.string().describe("Table title"),
  columns: z.array(z.object({
    key: z.string().describe("Column key matching data field"),
    label: z.string().describe("Column header label"),
    type: z.enum(["text", "number", "date"]).optional().describe("Column data type"),
  })).describe("Column definitions"),
  rows: z.array(z.record(z.union([z.string(), z.number()]))).describe("Table data rows"),
  rowLinkPrefix: z.string().optional().describe("URL prefix for row click navigation (e.g., '/explore/sessions/')"),
  pageSize: z.number().optional().default(10).describe("Rows per page"),
});

function GenerativeTable({
  title,
  columns,
  rows,
  rowLinkPrefix,
  pageSize = 10,
}: z.infer<typeof GenerativeTableProps>) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);

  // Sort rows
  const sortedRows = [...rows].sort((a, b) => {
    if (!sortKey) return 0;
    const aVal = a[sortKey];
    const bVal = b[sortKey];
    const cmp = typeof aVal === "number" && typeof bVal === "number"
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Paginate
  const paginatedRows = sortedRows.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(rows.length / pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const handleRowClick = (row: Record<string, string | number>) => {
    if (rowLinkPrefix && row.id) {
      router.push(`${rowLinkPrefix}${row.id}`);
    }
  };

  return (
    <div className="bg-card rounded-lg my-2 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h4 className="text-sm font-semibold">{title}</h4>
        <span className="text-xs text-muted-foreground">{rows.length} results</span>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead
                key={col.key}
                className="cursor-pointer hover:bg-muted/50 select-none"
                onClick={() => handleSort(col.key)}
              >
                <div className="flex items-center gap-1">
                  {col.label}
                  {sortKey === col.key && (
                    sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
                  )}
                </div>
              </TableHead>
            ))}
            {rowLinkPrefix && <TableHead className="w-10" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {paginatedRows.map((row, idx) => (
            <TableRow
              key={row.id ?? idx}
              className={rowLinkPrefix ? "cursor-pointer" : ""}
              onClick={() => handleRowClick(row)}
            >
              {columns.map((col) => (
                <TableCell key={col.key}>{String(row[col.key] ?? "")}</TableCell>
              ))}
              {rowLinkPrefix && (
                <TableCell>
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 px-4 py-2 border-t text-xs">
          <button
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-2 py-1 disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-muted-foreground">Page {page + 1} of {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-2 py-1 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

export default GenerativeTable;
```

### Pattern 3: Context-Aware AI Suggestions

**What:** Update suggestions based on current page context using usePathname.

**Example:**
```tsx
// hooks/use-context-suggestions.ts
"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";

export function useContextSuggestions() {
  const pathname = usePathname();

  return useMemo(() => {
    // Conference detail page
    if (pathname.match(/\/explore\/conferences\/[\w-]+$/)) {
      return [
        "What are the trending topics at this conference?",
        "Show me sessions by speaker",
        "Compare this year to previous years",
      ];
    }
    // Session detail page
    if (pathname.match(/\/explore\/sessions\/[\w-]+$/)) {
      return [
        "Find similar sessions",
        "Who else presented on this topic?",
        "Summarize the key points",
      ];
    }
    // Default hub suggestions
    return [
      "What are the trending topics?",
      "Which venues published the most?",
      "Summarize recent conferences",
    ];
  }, [pathname]);
}
```

### Anti-Patterns to Avoid

- **Don't use CopilotPopup or CopilotChat**: Use custom panel to match existing UI design
- **Don't modify FilterBar state from AI**: Clear separation - AI answers about data, doesn't change filters
- **Don't persist conversation state**: Reset on panel close as per requirements
- **Don't use MCP Apps unless needed**: useComponent is simpler for React-native components

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AI chat panel | Custom chat UI | Existing ResearchAssistantPanel | Already built, just needs CopilotKit integration |
| Tables | Custom table logic | Shadcn/UI Table + sorting | Already installed, consistent styling |
| Charts | Custom SVG charts | Recharts or ECharts | Already installed, existing patterns in codebase |
| Agent communication | Custom fetch | CopilotKit LangGraphAgent | Already configured in route.ts |
| State management for chat | Custom useState | CopilotKit built-in | Handles streaming, history automatically |

**Key insight:** The existing codebase has most UI components needed. Focus on wiring CopilotKit generative UI, not building new UI from scratch.

## Common Pitfalls

### Pitfall 1: Forgetting to Call useComponent Hook

**What goes wrong:** Component registered but never renders because hook not called.

**Why it happens:** useComponent must be called inside a component within CopilotKit provider.

**How to avoid:** Create a wrapper component that calls all useComponent hooks, render it inside the panel.

**Warning signs:** Agent calls tool but no UI appears in chat.

```tsx
// CORRECT: Call hook inside component within CopilotKit provider
function GenerativeUIProvider({ children }) {
  useComponent({ name: "showChart", ... });
  useComponent({ name: "showTable", ... });
  return <>{children}</>;
}

// WRONG: Call hook outside provider or at module level
useComponent({ name: "showChart", ... }); // Error!
```

### Pitfall 2: Mismatched Zod Schema and Component Props

**What goes wrong:** Runtime errors when agent passes data that doesn't match component expectations.

**Why it happens:** Agent hallucinates field names or types.

**How to avoid:** Use `z.infer<typeof Schema>` for component props, add descriptive `.describe()` on each field.

**Warning signs:** "Cannot read property X of undefined" in generative components.

### Pitfall 3: ECharts SSR Issues

**What goes wrong:** Hydration mismatch or "window is not defined" errors.

**Why it happens:** ECharts requires browser APIs.

**How to avoid:** Use existing `useECharts` hook which handles SSR, or prefer Recharts for generative UI (simpler SSR).

**Warning signs:** Errors on server-side render, blank charts.

### Pitfall 4: Context Not Available in Chat

**What goes wrong:** AI doesn't know which conference/session user is viewing.

**Why it happens:** Context not passed to agent.

**How to avoid:** Use CopilotKit's context injection - pass current page ID via CopilotKit provider or add to system message.

**Warning signs:** AI gives generic answers instead of context-specific ones.

## Code Examples

### Updating Research Assistant Panel with CopilotKit

```tsx
// components/explore/research-assistant-panel.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useCopilotChat, useCopilotReadable } from "@copilotkit/react-core";
import { Button } from "@/components/ui/button";
import { X, Send, Sparkles } from "lucide-react";
import { useGenerativeComponents } from "./generative-ui";
import { useContextSuggestions } from "@/hooks/use-context-suggestions";

interface ResearchAssistantPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextData?: {
    conferenceId?: string;
    conferenceName?: string;
    sessionId?: string;
    sessionTitle?: string;
  };
}

export function ResearchAssistantPanel({
  open,
  onOpenChange,
  contextData,
}: ResearchAssistantPanelProps) {
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Register generative UI components
  useGenerativeComponents();

  // Make context readable by the agent
  useCopilotReadable(
    contextData?.conferenceName
      ? `User is viewing conference: ${contextData.conferenceName}`
      : contextData?.sessionTitle
      ? `User is viewing session: ${contextData.sessionTitle}`
      : "User is on the Research Hub homepage"
  );

  // Get context-aware suggestions
  const suggestions = useContextSuggestions();

  const {
    visibleMessages,
    setMessages,
    appendMessage,
    isLoading,
    reloadMessages,
  } = useCopilotChat();

  // Reset on close
  useEffect(() => {
    if (!open) {
      setMessages([]);
      setInput("");
    }
  }, [open, setMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleMessages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const handleSend = async (text?: string) => {
    const content = text || input.trim();
    if (!content || isLoading) return;

    await appendMessage({ role: "user", content });
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[200] bg-black/20 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => onOpenChange(false)}
          />

          {/* Panel - same structure as existing, just using CopilotKit messages */}
          <motion.div
            className="fixed top-0 right-0 bottom-0 z-[200] w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Header - unchanged */}
            {/* Messages - use visibleMessages from useCopilotChat */}
            {/* Input - unchanged */}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

### Passing Context from Page to Panel

```tsx
// app/explore/conferences/[id]/page.tsx
import { getConference } from "@/lib/explore/queries";
import { ExploreShell } from "@/app/explore/explore-shell";
import { ConferenceDetail } from "@/components/explore/conferences/conference-detail";

export default async function ConferencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const conference = await getConference(id);

  return (
    <ExploreShell
      aiContext={{
        conferenceId: id,
        conferenceName: `${conference.venue.name} ${conference.year}`,
      }}
    >
      <ConferenceDetail conference={conference} />
    </ExploreShell>
  );
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Simulated responses | Real agent via CopilotKit | Phase 2 | Actual AI-powered answers |
| Static suggestions | Context-aware suggestions | Phase 2 | Relevant prompts for current page |
| Text-only responses | Generative UI components | Phase 2 | Rich visual data in chat |
| CopilotChat component | Custom panel | Phase 2 | Matches existing UI design |

**Deprecated/outdated:**
- Simulated responses in research-assistant-panel.tsx: Replace with CopilotKit hooks
- Static SUGGESTIONS array: Replace with context-aware suggestions

## Open Questions

1. **How to handle large result sets in tables?**
   - What we know: Agent returns data, table paginates client-side
   - What's unclear: Should we add server-side pagination for very large queries?
   - Recommendation: Start with client-side pagination (20 rows), add server-side if needed

2. **Should chart data be aggregated by agent or frontend?**
   - What we know: Agent can return raw session data or pre-aggregated stats
   - What's unclear: Which approach is more reliable?
   - Recommendation: Agent returns pre-aggregated data for charts (cleaner prompt, fewer errors)

3. **Error handling for failed agent calls?**
   - What we know: CopilotKit has built-in error states
   - What's unclear: Custom error UI needed?
   - Recommendation: Use default CopilotKit error handling initially, customize if needed

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (in node_modules) - needs project setup |
| Config file | None - needs creation |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| RHUB-01 | View list of conferences | E2E | `npx vitest run conferences.test.ts` | Wave 0 |
| RHUB-02 | Browse sessions in conference | E2E | `npx vitest run sessions.test.ts` | Wave 0 |
| RHUB-03 | View session detail | E2E | `npx vitest run session-detail.test.ts` | Wave 0 |
| RHUB-04-07 | Filter functionality | E2E | `npx vitest run filters.test.ts` | Wave 0 |
| GENUI-01 | Ask AI questions | Integration | `npx vitest run ai-chat.test.ts` | Wave 0 |
| GENUI-02 | Generate tables | Unit | `npx vitest run generative-table.test.tsx` | Wave 0 |
| GENUI-03 | Generate charts | Unit | `npx vitest run generative-chart.test.tsx` | Wave 0 |
| GENUI-04 | Generate filtered views | Integration | `npx vitest run ai-filters.test.ts` | Wave 0 |
| GENUI-05 | Components render in panel | Integration | `npx vitest run panel-render.test.tsx` | Wave 0 |
| GENUI-06 | Component interactivity | Unit | `npx vitest run table-interactivity.test.tsx` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --changed`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` - Vitest configuration
- [ ] `apps/web/tests/setup.ts` - Test setup with React Testing Library
- [ ] `apps/web/tests/components/generative-ui/` - Generative component tests
- [ ] `apps/web/tests/e2e/` - E2E tests for user flows
- [ ] Framework install: `npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom` - if not already present

## Sources

### Primary (HIGH confidence)
- [CopilotKit Docs - Generative UI](https://docs.copilotkit.ai/generative-ui/your-components) - useComponent hook pattern
- [CopilotKit Docs - MCP Apps](https://docs.copilotkit.ai/generative-ui/mcp-apps) - Alternative approach for dynamic components
- [CopilotKit Docs - State Rendering](https://docs.copilotkit.ai/generative-ui/state-rendering) - Real-time state updates
- Existing codebase analysis - CopilotKit provider, hub agent, chart patterns

### Secondary (MEDIUM confidence)
- [CopilotKit Docs - Tool Rendering](https://docs.copilotkit.ai/generative-ui/tool-rendering) - Custom tool UI
- Recharts documentation - Chart component APIs
- ECharts documentation - Advanced chart configuration

### Tertiary (LOW confidence)
- None - All findings verified against official sources or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed, patterns documented
- Architecture: HIGH - Existing codebase patterns clear, CopilotKit docs comprehensive
- Pitfalls: MEDIUM - Based on documentation patterns, needs implementation validation

**Research date:** 2026-03-06
**Valid until:** 30 days - CopilotKit API stable, but check for minor version updates
