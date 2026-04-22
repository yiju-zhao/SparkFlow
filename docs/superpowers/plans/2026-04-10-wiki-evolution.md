# Wiki Evolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evolve SparkFlow's wiki system from auto-generated-only to a Karpathy-style knowledge network with ingest interaction, chat→wiki flow, health checks, editable pages, and an independent wiki panel.

**Architecture:** Six tasks that progressively close the Karpathy loop. Task 1 adds the `ARTICLE` page type. Task 2 upgrades Save-to-Wiki to extract source refs and integrate with the graph. Task 3 promotes Wiki to its own panel. Task 4 adds ingest-time reporting. Task 5 makes wiki pages user-editable. Task 6 adds health check.

**Tech Stack:** Next.js 16, React 19, Prisma 7, Tailwind 4, OpenAI (gpt-4o-mini), graphology, tanstack/react-query

---

## File Structure

| File | Responsibility | Task |
|------|---------------|------|
| `apps/web/prisma/schema.prisma` | Add `ARTICLE` to `WikiPageType` enum | 1 |
| `apps/web/components/deepdive/chat/chat-panel.tsx` | Upgrade `handleSaveToWiki` to extract citations, use `ARTICLE` type, call graph integration API | 2 |
| `apps/web/app/api/notebooks/[id]/wiki/integrate/route.ts` | **New.** POST endpoint — takes a wiki page slug, extracts graph nodes from its content, merges into notebook graph | 2 |
| `apps/web/lib/services/graph-service.ts` | Add `integrateWikiPage()` — lightweight extract+merge for a single wiki page (no full regeneration) | 2 |
| `apps/web/components/deepdive/notebook-layout.tsx` | Change from 3-panel (sources\|chat\|studio) to 4-panel (sources\|chat\|wiki\|studio) with wiki as independent panel | 3 |
| `apps/web/components/deepdive/sources/sources-panel.tsx` | Remove wiki tab — sources-only panel | 3 |
| `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts` | Add PATCH for partial updates (title, content editing) | 5 |
| `apps/web/components/deepdive/wiki/wiki-panel.tsx` | Add edit mode to `WikiPageView` | 5 |
| `apps/web/app/api/notebooks/[id]/wiki/ingest-report/route.ts` | **New.** GET endpoint — returns last ingest extraction results for display | 4 |
| `apps/web/lib/services/wiki-ingest.ts` | Store extraction report in source metadata after ingest | 4 |
| `apps/web/components/deepdive/sources/ingest-report.tsx` | **New.** UI component showing extracted entities/edges, user can dismiss | 4 |
| `apps/web/app/api/notebooks/[id]/wiki/health/route.ts` | **New.** POST endpoint — runs health check (orphans, missing pages, contradictions) | 6 |
| `apps/web/lib/services/wiki-health.ts` | **New.** Health check service — analyzes wiki for issues | 6 |
| `apps/web/components/deepdive/wiki/health-check.tsx` | **New.** UI for health check results | 6 |

---

### Task 1: Add ARTICLE page type to Prisma schema

**Files:**
- Modify: `apps/web/prisma/schema.prisma:112-119`

- [ ] **Step 1: Add ARTICLE to WikiPageType enum**

```prisma
enum WikiPageType {
  ENTITY
  CONCEPT
  SUMMARY
  COMPARISON
  INDEX
  LOG
  ARTICLE
}
```

- [ ] **Step 2: Generate Prisma client**

Run: `cd apps/web && npx prisma generate`
Expected: Prisma Client generated successfully

- [ ] **Step 3: Push schema to dev DB**

Run: `cd apps/web && npx prisma db push`
Expected: Schema synced, no data loss (additive enum change)

- [ ] **Step 4: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(wiki): add ARTICLE page type for chat-to-wiki saves"
```

---

### Task 2: Upgrade Save-to-Wiki with source refs and graph integration

**Files:**
- Modify: `apps/web/components/deepdive/chat/chat-panel.tsx:345-382`
- Modify: `apps/web/lib/services/graph-service.ts` (add `extractFromWikiPage`)
- Create: `apps/web/app/api/notebooks/[id]/wiki/integrate/route.ts`
- Modify: `apps/web/components/deepdive/wiki/wiki-panel.tsx:31-45` (add ARTICLE to type labels/icons)

- [ ] **Step 1: Add ARTICLE to wiki panel type labels and icons**

In `apps/web/components/deepdive/wiki/wiki-panel.tsx`, update the two maps:

```typescript
import { ArrowLeft, BookOpen, FileText, GitCompare, Lightbulb, Users, ScrollText, MessageSquare } from "lucide-react";

const PAGE_TYPE_ICONS: Record<string, typeof FileText> = {
  ENTITY: Users,
  CONCEPT: Lightbulb,
  SUMMARY: FileText,
  COMPARISON: GitCompare,
  INDEX: BookOpen,
  LOG: ScrollText,
  ARTICLE: MessageSquare,
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  ENTITY: "Entities",
  CONCEPT: "Concepts",
  SUMMARY: "Summaries",
  COMPARISON: "Comparisons",
  ARTICLE: "Articles",
};
```

- [ ] **Step 2: Add `extractFromWikiPage` to graph-service.ts**

Append to `apps/web/lib/services/graph-service.ts` before the `runGraphPipeline` function:

```typescript
/**
 * Lightweight graph integration for a single wiki page (e.g. saved from chat).
 * Extracts nodes/edges, merges into existing graph, re-clusters, updates DB.
 * Does NOT regenerate community pages — only updates the graph structure.
 */
export async function integrateWikiPage(
  notebookId: string,
  pageSlug: string,
  pageContent: string,
  sourceRefs: string[]
): Promise<{ nodesAdded: number; edgesAdded: number }> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as unknown as GraphData)
    : { nodes: [], edges: [] };

  // Lightweight extraction — only nodes and edges, no title normalization
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Extract knowledge graph entities from this wiki article. Output JSON:
{"nodes": [{"id": "slug-name", "label": "Display Name", "type": "entity|concept|method", "summary": "one-line"}], "edges": [{"source": "id-a", "target": "id-b", "relation": "uses|improves|alternative_to|component_of|extends", "confidence": "INFERRED", "weight": 0.7}]}
Only extract key entities. Reuse existing node IDs when possible.
Existing nodes: ${existing.nodes.slice(0, 50).map((n) => `${n.id}: ${n.label}`).join(", ")}`,
      },
      {
        role: "user",
        content: pageContent.slice(0, 10000),
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) return { nodesAdded: 0, edgesAdded: 0 };

  const result = JSON.parse(text);
  const nodes: GraphNode[] = (result.nodes || []).map((n: any) => ({
    ...n,
    sourceRefs,
  }));
  const edges: GraphEdge[] = (result.edges || []).map((e: any) => ({
    ...e,
    sourceRef: pageSlug,
  }));

  if (nodes.length === 0 && edges.length === 0) {
    return { nodesAdded: 0, edgesAdded: 0 };
  }

  // Merge
  const merged = mergeGraph(existing, { nodes, edges, normalizedTitle: "" });

  // Re-cluster
  const { graphWithCommunities, communities } = await clusterGraph(merged);

  // Store updated graph
  await prisma.notebookGraph.upsert({
    where: { notebookId },
    create: { notebookId, graphData: graphWithCommunities as any, communities: communities as any },
    update: { graphData: graphWithCommunities as any, communities: communities as any },
  });

  return { nodesAdded: nodes.length, edgesAdded: edges.length };
}
```

- [ ] **Step 3: Create the integrate API route**

Create `apps/web/app/api/notebooks/[id]/wiki/integrate/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { integrateWikiPage } from "@/lib/services/graph-service";
import prisma from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;
  const { slug } = await request.json();

  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  const page = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug } },
  });

  if (!page) {
    return NextResponse.json({ error: "Page not found" }, { status: 404 });
  }

  try {
    const result = await integrateWikiPage(
      notebookId,
      slug,
      page.content,
      page.sourceRefs
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error("Wiki integrate failed:", error);
    return NextResponse.json({ error: "Integration failed" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Upgrade handleSaveToWiki in chat-panel.tsx**

Replace the existing `handleSaveToWiki` function (lines 347-382) in `apps/web/components/deepdive/chat/chat-panel.tsx`:

```typescript
  const handleSaveToWiki = useCallback(
    async (messageId: string, content: string) => {
      if (savingWikiId) return;
      setSavingWikiId(messageId);
      try {
        const slug = `article-${Date.now()}`;
        // Generate a clean title from the first line or first 60 chars
        const firstLine = content.split("\n").find((l) => l.trim().length > 0) || "";
        const title = firstLine
          .replace(/^#+\s*/, "")
          .replace(/[*_~`]/g, "")
          .slice(0, 80)
          .trim() || "Chat Synthesis";

        // Extract source IDs from citation badges in the chat context
        // Citations are rendered as [N] referencing sources — collect sourceIds from the chat's sources prop
        const sourceIds = sources
          .filter((s) => s.status === "READY")
          .map((s) => s.id);

        // Save the wiki page
        await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            pageType: "ARTICLE",
            sourceRefs: sourceIds,
          }),
        });

        // Integrate into knowledge graph (fire-and-forget)
        fetch(`/api/notebooks/${notebookId}/wiki/integrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => {});

        // Log the save
        fetch(`/api/notebooks/${notebookId}/wiki/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: `saved | Chat article saved as [[${slug}]] — "${title}"`,
          }),
        }).catch(() => {});
      } catch (error) {
        console.error("Failed to save to wiki:", error);
      } finally {
        setSavingWikiId(null);
      }
    },
    [notebookId, savingWikiId, sources],
  );
```

Note: `sources` is already available in chat-panel.tsx props.

- [ ] **Step 5: Verify type check passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/deepdive/chat/chat-panel.tsx \
        apps/web/lib/services/graph-service.ts \
        apps/web/app/api/notebooks/[id]/wiki/integrate/route.ts \
        apps/web/components/deepdive/wiki/wiki-panel.tsx
git commit -m "feat(wiki): upgrade save-to-wiki with ARTICLE type, source refs, and graph integration"
```

---

### Task 3: Promote Wiki to independent panel

**Files:**
- Modify: `apps/web/components/deepdive/notebook-layout.tsx`
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx`

- [ ] **Step 1: Remove Wiki tab from SourcesPanel**

In `apps/web/components/deepdive/sources/sources-panel.tsx`:

Remove the `activeTab` state, wiki tab button, and the `WikiPanel` rendering. The component becomes sources-only.

Remove these imports:
```typescript
// Remove this import:
import { WikiPanel } from "@/components/deepdive/wiki/wiki-panel";
```

Remove from props interface:
```typescript
interface SourcesPanelProps {
  notebookId: string;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source | null) => void;
  // Remove: wikiPages and graphData props
}
```

Remove the `activeTab` state and the wiki tab button. The tab bar becomes just a "SOURCES" header with the add button. Remove the conditional `{activeTab === "wiki" ? <WikiPanel ... /> : ...}` — always render the sources list.

- [ ] **Step 2: Add Wiki as fourth panel in NotebookLayout**

In `apps/web/components/deepdive/notebook-layout.tsx`:

Add wiki panel import:
```typescript
import { WikiPanel } from "@/components/deepdive/wiki/wiki-panel";
```

Add wiki panel width constants:
```typescript
const WIKI_DEFAULT_WIDTH = 300;
const WIKI_CONTENT_WIDTH = 480;
```

Add wiki width state:
```typescript
const [wikiWidth, setWikiWidth] = useState(WIKI_DEFAULT_WIDTH);
```

Add wiki drag/collapse/expand handlers (same pattern as studio panel):
```typescript
const handleWikiDrag = useCallback((delta: number) => {
  setWikiWidth((prev) => clampWidth(prev - delta));
}, [clampWidth]);

const handleWikiDoubleClick = useCallback(() => {
  setWikiWidth(WIKI_DEFAULT_WIDTH);
}, []);

const handleWikiExpand = useCallback((width: number) => {
  setWikiWidth(Math.max(WIKI_DEFAULT_WIDTH, width));
}, []);

const wikiCollapsed = wikiWidth === 0;
```

Update the return JSX to insert Wiki panel between Chat and Studio:

```tsx
return (
  <div className="flex flex-1 overflow-hidden">
    {/* Sources Panel (Left) */}
    {sourcesCollapsed ? (
      <CollapsedGripStrip side="left" onExpand={handleSourcesExpand} />
    ) : (
      <>
        <motion.div className="h-full overflow-hidden" style={{ width: sourcesWidth }} initial={false} animate={{ width: sourcesWidth }} transition={{ type: "spring", stiffness: 400, damping: 35 }}>
          <SourcesPanel
            notebookId={notebook.id}
            sources={sources}
            selectedSource={selectedSource}
            onSelectSource={handleSelectSource}
          />
        </motion.div>
        <ResizableDivider direction="vertical" onDrag={handleSourcesDrag} onDoubleClick={handleSourcesDoubleClick} />
      </>
    )}

    {/* Chat Panel (Center) */}
    <motion.div className="flex min-w-0 flex-1 flex-col overflow-hidden" layout transition={{ layout: { type: "spring", stiffness: 400, damping: 35, mass: 0.8 } }}>
      <ChatPanel notebookId={notebook.id} sources={sources} initialSessions={initialChatSessions} initialMessages={initialMessages} />
    </motion.div>

    {/* Wiki Panel */}
    {wikiCollapsed ? (
      <CollapsedGripStrip side="right" onExpand={handleWikiExpand} />
    ) : (
      <>
        <ResizableDivider direction="vertical" onDrag={handleWikiDrag} onDoubleClick={handleWikiDoubleClick} />
        <motion.div className="h-full overflow-hidden" style={{ width: wikiWidth }} initial={false} animate={{ width: wikiWidth }} transition={{ type: "spring", stiffness: 400, damping: 35 }}>
          <WikiPanel
            notebookId={notebook.id}
            initialPages={wikiPages}
            sources={sources.map((s) => ({ id: s.id, title: s.title }))}
            graphData={graphData}
          />
        </motion.div>
      </>
    )}

    {/* Studio Panel (Right) */}
    {studioCollapsed ? (
      <CollapsedGripStrip side="right" onExpand={handleStudioExpand} />
    ) : (
      <>
        <ResizableDivider direction="vertical" onDrag={handleStudioDrag} onDoubleClick={handleStudioDoubleClick} />
        <motion.div className="h-full overflow-hidden" style={{ width: studioWidth }} initial={false} animate={{ width: studioWidth }} transition={{ type: "spring", stiffness: 400, damping: 35 }}>
          <StudioPanel notebookId={notebook.id} notes={notes} selectedNote={selectedNote} onSelectNote={handleSelectNote} />
        </motion.div>
      </>
    )}
  </div>
);
```

- [ ] **Step 3: Verify type check passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors (SourcesPanel no longer expects wikiPages/graphData props)

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/deepdive/notebook-layout.tsx \
        apps/web/components/deepdive/sources/sources-panel.tsx
git commit -m "feat(wiki): promote wiki to independent panel, sources panel is sources-only"
```

---

### Task 4: Ingest-time extraction report

**Files:**
- Modify: `apps/web/lib/services/graph-service.ts` (return extraction details from `runGraphPipeline`)
- Modify: `apps/web/lib/services/wiki-ingest.ts` (store report in source metadata)
- Create: `apps/web/components/deepdive/sources/ingest-report.tsx`
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx` (show report)

- [ ] **Step 1: Store extraction report in source metadata**

In `apps/web/lib/services/graph-service.ts`, update the `runGraphPipeline` return type and store a report:

Change the return type at line 388:
```typescript
export async function runGraphPipeline(
  notebookId: string,
  sourceId: string,
  sourceContent: string,
  sourceTitle: string
): Promise<{
  nodesAdded: number;
  edgesAdded: number;
  communities: number;
  pagesWritten: number;
  extractionReport: {
    nodes: { id: string; label: string; type: string }[];
    edges: { source: string; target: string; relation: string }[];
    crossRefs: string[];
  };
}> {
```

After the extract step (after line 410), build the report and detect cross-references:

```typescript
  // Build extraction report
  const newNodeIds = new Set(extraction.nodes.map((n) => n.id));
  const existingNodeIds = new Set(existing.nodes.map((n) => n.id));
  const crossRefs = extraction.nodes
    .filter((n) => existingNodeIds.has(n.id))
    .map((n) => `"${n.label}" already exists in the knowledge network`);

  // Also detect similar concepts across sources
  for (const edge of extraction.edges) {
    if (existingNodeIds.has(edge.source) && newNodeIds.has(edge.target)) {
      const src = existing.nodes.find((n) => n.id === edge.source);
      const tgt = extraction.nodes.find((n) => n.id === edge.target);
      if (src && tgt) {
        crossRefs.push(`"${tgt.label}" ${edge.relation} "${src.label}" (from previous sources)`);
      }
    }
  }

  const extractionReport = {
    nodes: extraction.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type })),
    edges: extraction.edges.map((e) => ({ source: e.source, target: e.target, relation: e.relation })),
    crossRefs,
  };
```

Update the return at the end:
```typescript
  return {
    nodesAdded: extraction.nodes.length,
    edgesAdded: extraction.edges.length,
    communities: Object.keys(communities).length,
    pagesWritten: writtenSlugs.length,
    extractionReport,
  };
```

- [ ] **Step 2: Store report in source metadata in wiki-ingest.ts**

In `apps/web/lib/services/wiki-ingest.ts`, update the `ingestSourceToWiki` function to save the report:

Replace the try block body:
```typescript
    const result = await runGraphPipeline(notebookId, sourceId, content, source.title);

    // Store extraction report in source metadata for UI display
    const currentMeta = (await prisma.source.findUnique({ where: { id: sourceId }, select: { metadata: true } }))?.metadata as Record<string, unknown> || {};
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        metadata: {
          ...currentMeta,
          wikiStatus: "done",
          extractionReport: result.extractionReport,
        },
      },
    });

    return {
      pagesWritten: result.pagesWritten,
      pages: [`${result.nodesAdded} nodes, ${result.edgesAdded} edges, ${result.communities} communities`],
    };
```

- [ ] **Step 3: Create IngestReport component**

Create `apps/web/components/deepdive/sources/ingest-report.tsx`:

```tsx
"use client";

import { useState } from "react";
import { X, Lightbulb, GitCompare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExtractionReport {
  nodes: { id: string; label: string; type: string }[];
  edges: { source: string; target: string; relation: string }[];
  crossRefs: string[];
}

interface IngestReportProps {
  sourceTitle: string;
  report: ExtractionReport;
  onDismiss: () => void;
}

export function IngestReport({ sourceTitle, report, onDismiss }: IngestReportProps) {
  if (report.nodes.length === 0) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Wiki extracted from "{sourceTitle}"
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{report.nodes.length}</span> entities,{" "}
          <span className="font-medium text-foreground">{report.edges.length}</span> relationships
        </p>

        {report.nodes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {report.nodes.slice(0, 8).map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium"
              >
                {n.label}
              </span>
            ))}
            {report.nodes.length > 8 && (
              <span className="text-[10px] text-muted-foreground">+{report.nodes.length - 8} more</span>
            )}
          </div>
        )}

        {report.crossRefs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-1 mb-1">
              <GitCompare className="h-3 w-3 text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Cross-references found
              </span>
            </div>
            {report.crossRefs.slice(0, 3).map((ref, i) => (
              <p key={i} className="text-[10px] flex items-center gap-1">
                <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                {ref}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Show IngestReport in SourcesPanel**

In `apps/web/components/deepdive/sources/sources-panel.tsx`, add the import and render the report above the sources list for any source that has a fresh extraction report:

Add import:
```typescript
import { IngestReport } from "./ingest-report";
```

Inside the sources list section (before the `<div className="space-y-2">` that maps liveSources), add:

```tsx
{liveSources
  .filter((s) => {
    const meta = s.metadata as Record<string, unknown> | null;
    return meta?.extractionReport && meta?.wikiStatus === "done";
  })
  .slice(0, 1)
  .map((s) => {
    const meta = s.metadata as Record<string, unknown>;
    return (
      <IngestReport
        key={`report-${s.id}`}
        sourceTitle={s.title}
        report={meta.extractionReport as any}
        onDismiss={() => {
          // Clear the report from metadata
          fetch(`/api/notebooks/${s.notebookId}/sources/${s.id}/dismiss-report`, {
            method: "POST",
          }).catch(() => {});
        }}
      />
    );
  })}
```

- [ ] **Step 5: Create dismiss-report API route**

Create `apps/web/app/api/notebooks/[id]/sources/[sourceId]/dismiss-report/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    select: { metadata: true },
  });

  const meta = (source?.metadata as Record<string, unknown>) || {};
  delete meta.extractionReport;

  await prisma.source.update({
    where: { id: sourceId },
    data: { metadata: meta },
  });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: Verify type check passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/services/graph-service.ts \
        apps/web/lib/services/wiki-ingest.ts \
        apps/web/components/deepdive/sources/ingest-report.tsx \
        apps/web/components/deepdive/sources/sources-panel.tsx \
        apps/web/app/api/notebooks/[id]/sources/[sourceId]/dismiss-report/route.ts
git commit -m "feat(wiki): show extraction report after source ingest with cross-references"
```

---

### Task 5: Make wiki pages user-editable

**Files:**
- Modify: `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts` (add PATCH handler)
- Modify: `apps/web/components/deepdive/wiki/wiki-panel.tsx` (add edit mode)

- [ ] **Step 1: Add PATCH handler to wiki slug route**

In `apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts`, add a PATCH handler:

```typescript
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, slug } = await params;
  const body = await request.json();

  const page = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug } },
  });

  if (!page) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await prisma.wikiPage.update({
    where: { id: page.id },
    data: {
      ...(body.title !== undefined && { title: body.title }),
      ...(body.content !== undefined && { content: body.content }),
    },
  });

  return NextResponse.json(updated);
}
```

- [ ] **Step 2: Add edit mode to WikiPageView**

In `apps/web/components/deepdive/wiki/wiki-panel.tsx`, update the `WikiPageView` function to add edit mode.

Add `Pencil` and `Save` to the lucide imports:
```typescript
import { ArrowLeft, BookOpen, FileText, GitCompare, Lightbulb, Users, ScrollText, MessageSquare, Pencil, Save } from "lucide-react";
```

Add `Button` import:
```typescript
import { Button } from "@/components/ui/button";
```

Update `WikiPageView` to add editing state:

```typescript
function WikiPageView({
  notebookId,
  slug,
  sourceMap,
  onBack,
  onNavigate,
}: {
  notebookId: string;
  slug: string;
  sourceMap: Record<string, string>;
  onBack: () => void;
  onNavigate: (slug: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const { data: page, isLoading } = useQuery<WikiPage & { content: string }>({
    queryKey: ["wiki-page", notebookId, slug],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`);
      if (!res.ok) throw new Error("Failed to fetch wiki page");
      return res.json();
    },
  });

  const handleStartEdit = () => {
    if (page?.content) {
      setEditContent(page.content);
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      await queryClient.invalidateQueries({ queryKey: ["wiki-page", notebookId, slug] });
      await queryClient.invalidateQueries({ queryKey: ["wiki-pages", notebookId] });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save wiki page:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // ... sourceTitles memo stays the same ...

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-[4px] hover:bg-accent/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[13px] font-semibold truncate flex-1">
            {page?.title || slug}
          </h2>
          {page && !isEditing && page.pageType !== "INDEX" && page.pageType !== "LOG" && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleStartEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isEditing && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs bg-accent-red hover:bg-accent-red-hover text-white" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
        {/* ... sourceTitles badges stay the same ... */}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : isEditing ? (
          <textarea
            className="w-full h-full min-h-64 resize-none bg-transparent text-sm font-mono leading-relaxed outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        ) : page?.content ? (
          <WikiMarkdown content={page.content} sourceMap={sourceMap} onNavigate={onNavigate} />
        ) : (
          <p className="text-sm text-muted-foreground">No content</p>
        )}
      </div>
    </div>
  );
}
```

Note: Add `useQueryClient` to the imports from `@tanstack/react-query` if not already imported (it is — `useQuery` is already imported from there, just add `useQueryClient` to the destructured import).

- [ ] **Step 3: Verify type check passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/notebooks/[id]/wiki/[slug]/route.ts \
        apps/web/components/deepdive/wiki/wiki-panel.tsx
git commit -m "feat(wiki): add user editing of wiki pages with PATCH API"
```

---

### Task 6: Wiki health check

**Files:**
- Create: `apps/web/lib/services/wiki-health.ts`
- Create: `apps/web/app/api/notebooks/[id]/wiki/health/route.ts`
- Create: `apps/web/components/deepdive/wiki/health-check.tsx`
- Modify: `apps/web/components/deepdive/wiki/wiki-panel.tsx` (add health check button)

- [ ] **Step 1: Create wiki-health service**

Create `apps/web/lib/services/wiki-health.ts`:

```typescript
import prisma from "@/lib/prisma";
import type { GraphData } from "./graph-service";

export interface HealthIssue {
  type: "orphan" | "missing_page" | "stale";
  severity: "warning" | "info";
  description: string;
  nodeId?: string;
  suggestion: string;
}

export interface HealthReport {
  issues: HealthIssue[];
  stats: {
    totalPages: number;
    totalNodes: number;
    totalEdges: number;
    orphanNodes: number;
  };
}

export async function runHealthCheck(notebookId: string): Promise<HealthReport> {
  const [pages, graphRecord] = await Promise.all([
    prisma.wikiPage.findMany({
      where: { notebookId },
      select: { slug: true, title: true, content: true, pageType: true, sourceRefs: true },
    }),
    prisma.notebookGraph.findUnique({ where: { notebookId } }),
  ]);

  const graphData = graphRecord?.graphData as unknown as GraphData | null;
  const nodes = graphData?.nodes || [];
  const edges = graphData?.edges || [];

  const issues: HealthIssue[] = [];

  // 1. Orphan nodes — nodes with no edges
  const connectedNodes = new Set<string>();
  for (const edge of edges) {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  }
  const orphanNodes = nodes.filter((n) => !connectedNodes.has(n.id));
  for (const node of orphanNodes) {
    issues.push({
      type: "orphan",
      severity: "info",
      description: `"${node.label}" has no connections to other entities`,
      nodeId: node.id,
      suggestion: `Consider linking to related concepts or removing if not relevant`,
    });
  }

  // 2. Nodes mentioned in edges but missing from node list
  const nodeIds = new Set(nodes.map((n) => n.id));
  const missingNodeIds = new Set<string>();
  for (const edge of edges) {
    if (!nodeIds.has(edge.source)) missingNodeIds.add(edge.source);
    if (!nodeIds.has(edge.target)) missingNodeIds.add(edge.target);
  }
  for (const id of missingNodeIds) {
    issues.push({
      type: "missing_page",
      severity: "warning",
      description: `Node "${id}" referenced in edges but missing from graph`,
      nodeId: id,
      suggestion: `This node may have been removed. Consider cleaning up edges`,
    });
  }

  // 3. Pages with no source refs (except INDEX and LOG)
  for (const page of pages) {
    if (page.pageType === "INDEX" || page.pageType === "LOG") continue;
    if (page.sourceRefs.length === 0 && page.pageType !== "ARTICLE") {
      issues.push({
        type: "stale",
        severity: "info",
        description: `Page "${page.title}" has no source references`,
        suggestion: `This page may be stale or need to be linked to sources`,
      });
    }
  }

  return {
    issues,
    stats: {
      totalPages: pages.filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG").length,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      orphanNodes: orphanNodes.length,
    },
  };
}
```

- [ ] **Step 2: Create health check API route**

Create `apps/web/app/api/notebooks/[id]/wiki/health/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runHealthCheck } from "@/lib/services/wiki-health";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  try {
    const report = await runHealthCheck(notebookId);
    return NextResponse.json(report);
  } catch (error) {
    console.error("Health check failed:", error);
    return NextResponse.json({ error: "Health check failed" }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create HealthCheck UI component**

Create `apps/web/components/deepdive/wiki/health-check.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Activity, AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthIssue {
  type: "orphan" | "missing_page" | "stale";
  severity: "warning" | "info";
  description: string;
  suggestion: string;
}

interface HealthReport {
  issues: HealthIssue[];
  stats: { totalPages: number; totalNodes: number; totalEdges: number; orphanNodes: number };
}

export function HealthCheckButton({ notebookId }: { notebookId: string }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const runCheck = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki/health`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Health check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 rounded-[4px] hover:bg-accent/80 transition-colors"
        onClick={runCheck}
        disabled={isLoading}
        title="Health Check"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Activity className="h-3.5 w-3.5" />
        )}
      </Button>

      {isOpen && report && (
        <div className="absolute left-0 right-0 top-full z-50 mx-3 mt-1 rounded-lg border border-border bg-background shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold">Health Check</h3>
            <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setIsOpen(false)}>
              &times;
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3 text-center">
            <div><div className="text-lg font-bold">{report.stats.totalPages}</div><div className="text-[10px] text-muted-foreground">Pages</div></div>
            <div><div className="text-lg font-bold">{report.stats.totalNodes}</div><div className="text-[10px] text-muted-foreground">Nodes</div></div>
            <div><div className="text-lg font-bold">{report.stats.totalEdges}</div><div className="text-[10px] text-muted-foreground">Edges</div></div>
            <div><div className="text-lg font-bold">{report.stats.orphanNodes}</div><div className="text-[10px] text-muted-foreground">Orphans</div></div>
          </div>

          {report.issues.length === 0 ? (
            <p className="text-xs text-green-600 dark:text-green-400 text-center py-2">No issues found</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {report.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {issue.severity === "warning" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p>{issue.description}</p>
                    <p className="text-muted-foreground text-[10px]">{issue.suggestion}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Add HealthCheckButton to WikiPanel header**

In `apps/web/components/deepdive/wiki/wiki-panel.tsx`, import and add the button:

```typescript
import { HealthCheckButton } from "./health-check";
```

In the WikiPanel header area (around line 98), add it next to the page count:

```tsx
<div className="px-6 pt-3 pb-3 flex items-center justify-between relative">
  <div className="flex items-center gap-1">
    {/* existing Pages/Graph toggle buttons */}
  </div>
  <div className="flex items-center gap-1">
    <HealthCheckButton notebookId={notebookId} />
    <span className="text-[11px] text-muted-foreground">
      {pages.filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG").length} pages
    </span>
  </div>
</div>
```

- [ ] **Step 5: Verify type check passes**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/wiki-health.ts \
        apps/web/app/api/notebooks/[id]/wiki/health/route.ts \
        apps/web/components/deepdive/wiki/health-check.tsx \
        apps/web/components/deepdive/wiki/wiki-panel.tsx
git commit -m "feat(wiki): add knowledge network health check with orphan/missing/stale detection"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Save-to-Wiki upgrade (ARTICLE type, source refs, graph integration) — Task 2
- [x] Wiki as independent panel — Task 3
- [x] Ingest-time extraction report — Task 4
- [x] Wiki pages user-editable — Task 5
- [x] Health check — Task 6
- [x] Prisma schema update — Task 1

**Placeholder scan:** No TBDs, TODOs, or "implement later" found. All steps have complete code.

**Type consistency:**
- `extractionReport` shape matches between graph-service.ts (producer) and ingest-report.tsx (consumer)
- `HealthReport`/`HealthIssue` types match between wiki-health.ts and health-check.tsx
- `WikiPageType` enum ARTICLE added in schema and referenced as string `"ARTICLE"` in TypeScript (consistent with existing pattern)
- `integrateWikiPage` signature matches its usage in the API route
