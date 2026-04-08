# Graph-Enhanced Wiki Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a knowledge graph layer to notebook wiki — structured nodes + typed edges extracted by LLM, clustered into communities by Louvain, wiki pages generated from communities, interactive graph visualization.

**Architecture:** Source content → LLM extracts structured graph (nodes + edges with confidence) → merged into persistent graph → Louvain clustering → wiki pages generated per community. Graph stored as JSON in PostgreSQL. All TypeScript/Node.js, no Python dependency.

**Tech Stack:** Graphology (graph data structure + Louvain), react-force-graph-2d (visualization), OpenAI SDK (extraction + page generation), Prisma 7, Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-08-graph-wiki-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/web/lib/services/graph-service.ts` | Core: extract, merge, cluster, generate wiki pages |
| `apps/web/components/deepdive/wiki/graph-view.tsx` | Interactive graph visualization component |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Add NotebookGraph model |
| `apps/web/lib/services/wiki-ingest.ts` | Rewrite to use graph-service pipeline |
| `apps/web/lib/actions/sources.ts` | Update source removal to use graph operations |
| `apps/web/lib/actions/notebooks.ts` | Create NotebookGraph on notebook creation |
| `apps/web/components/deepdive/wiki/wiki-panel.tsx` | Add graph/pages view toggle |
| `apps/web/app/[locale]/deepdive/[id]/page.tsx` | Fetch graph data for visualization |
| `apps/web/components/deepdive/notebook-layout.tsx` | Pass graph data to sources panel |
| `apps/web/components/deepdive/sources/sources-panel.tsx` | Pass graph data to wiki panel |

---

## Task 1: Schema + Dependencies

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add NotebookGraph model**

Add after the WikiPage model in `apps/web/prisma/schema.prisma`:

```prisma
model NotebookGraph {
  id          String   @id @default(cuid())
  notebookId  String   @unique
  graphData   Json     // {nodes: [...], edges: [...]}
  communities Json     // {community_id: [node_ids]}
  updatedAt   DateTime @updatedAt

  notebook Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  @@map("notebook_graphs")
}
```

Add to the Notebook model relations:

```prisma
  graph        NotebookGraph?
```

- [ ] **Step 2: Install graph libraries**

```bash
cd apps/web && npm install graphology graphology-communities-louvain graphology-types react-force-graph-2d
```

- [ ] **Step 3: Generate Prisma client and commit**

```bash
npx prisma generate
git add apps/web/prisma/schema.prisma apps/web/package.json apps/web/package-lock.json
git commit -m "feat(schema): add NotebookGraph model, install graph libraries"
```

---

## Task 2: Graph Service — Core Logic

**Files:**
- Create: `apps/web/lib/services/graph-service.ts`

This is the core module. It handles: LLM extraction of nodes+edges, merging into existing graph, Louvain clustering, and wiki page generation from communities.

- [ ] **Step 1: Create graph-service.ts**

Create `apps/web/lib/services/graph-service.ts`:

```typescript
/**
 * Graph service — extract, merge, cluster, and generate wiki pages.
 * Implements the Graphify-inspired pipeline entirely in TypeScript.
 */

import prisma from "@/lib/prisma";
import Graph from "graphology";
import louvain from "graphology-communities-louvain";

// ============================================================
// Types
// ============================================================

export interface GraphNode {
  id: string;
  label: string;
  type: "entity" | "concept" | "method" | "person" | "dataset" | "tool";
  summary: string;
  sourceRefs: string[];
  community?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: "EXTRACTED" | "INFERRED" | "AMBIGUOUS";
  weight: number;
  sourceRef: string;
}

export interface ExtractionResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  normalizedTitle: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CommunityMap {
  [communityId: string]: string[]; // community ID → node IDs
}

// ============================================================
// 1. Extract — LLM extracts structured graph from source
// ============================================================

export async function extractGraph(
  sourceContent: string,
  sourceTitle: string,
  sourceId: string,
  existingNodeLabels: string[]
): Promise<ExtractionResult> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const truncated =
    sourceContent.length > 50000
      ? sourceContent.slice(0, 50000) + "\n\n[... truncated ...]"
      : sourceContent;

  const existingContext =
    existingNodeLabels.length > 0
      ? `\nExisting entities in the graph (reuse these IDs if the source mentions them):\n${existingNodeLabels.map((l) => `- ${l}`).join("\n")}\n`
      : "";

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `You extract knowledge graph data from documents. Output JSON with this exact structure:

{
  "nodes": [
    {"id": "slug-name", "label": "Display Name", "type": "entity|concept|method|person|dataset|tool", "summary": "one-line description"}
  ],
  "edges": [
    {"source": "node-id-a", "target": "node-id-b", "relation": "uses|improves|alternative_to|component_of|authored_by|evaluated_on|contradicts|extends|cites", "confidence": "EXTRACTED|INFERRED|AMBIGUOUS", "weight": 0.8}
  ],
  "normalizedTitle": "Author — Clean Title, Year"
}

Rules:
- Node IDs must be URL-friendly slugs: lowercase, hyphens, no spaces
- EXTRACTED (weight 1.0): relationship directly stated in the text
- INFERRED (weight 0.6-0.9): reasonable inference from context
- AMBIGUOUS (weight 0.1-0.3): uncertain, flagged for review
- Only extract genuinely important entities — not every noun
- Reuse existing node IDs when the source mentions known entities
- Title format: "Author(s) — Descriptive Title, Year"
${existingContext}`,
      },
      {
        role: "user",
        content: `Extract knowledge graph from this source:\n\nTitle: ${sourceTitle}\nSource ID: ${sourceId}\n\n${truncated}`,
      },
    ],
    response_format: { type: "json_object" },
  });

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error("LLM returned empty response");

  const result = JSON.parse(text);

  // Add sourceRef to all nodes and edges
  const nodes: GraphNode[] = (result.nodes || []).map((n: GraphNode) => ({
    ...n,
    sourceRefs: [sourceId],
  }));

  const edges: GraphEdge[] = (result.edges || []).map((e: GraphEdge) => ({
    ...e,
    sourceRef: sourceId,
  }));

  return {
    nodes,
    edges,
    normalizedTitle: result.normalizedTitle || sourceTitle,
  };
}

// ============================================================
// 2. Merge — combine new extraction into existing graph
// ============================================================

export function mergeGraph(
  existing: GraphData,
  extraction: ExtractionResult
): GraphData {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  // Load existing nodes
  for (const node of existing.nodes) {
    nodeMap.set(node.id, { ...node });
  }

  // Merge new nodes
  for (const node of extraction.nodes) {
    const existing = nodeMap.get(node.id);
    if (existing) {
      // Merge: keep richer summary, combine sourceRefs
      existing.sourceRefs = [...new Set([...existing.sourceRefs, ...node.sourceRefs])];
      if (node.summary.length > existing.summary.length) {
        existing.summary = node.summary;
      }
    } else {
      nodeMap.set(node.id, { ...node });
    }
  }

  // Edge dedup key: source|target|relation
  const edgeKey = (e: GraphEdge) => `${e.source}|${e.target}|${e.relation}`;

  // Load existing edges
  for (const edge of existing.edges) {
    edgeMap.set(edgeKey(edge), { ...edge });
  }

  // Merge new edges
  for (const edge of extraction.edges) {
    const key = edgeKey(edge);
    const existing = edgeMap.get(key);
    if (existing) {
      // Keep higher confidence/weight
      if (edge.weight > existing.weight) {
        existing.confidence = edge.confidence;
        existing.weight = edge.weight;
      }
    } else {
      // Only add edge if both nodes exist
      if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
        edgeMap.set(key, { ...edge });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

// ============================================================
// 3. Cluster — Louvain community detection
// ============================================================

export function clusterGraph(graphData: GraphData): {
  graphWithCommunities: GraphData;
  communities: CommunityMap;
} {
  if (graphData.nodes.length === 0) {
    return { graphWithCommunities: graphData, communities: {} };
  }

  const g = new Graph({ type: "undirected" });

  // Add nodes
  for (const node of graphData.nodes) {
    g.addNode(node.id);
  }

  // Add edges (skip if nodes don't exist)
  for (const edge of graphData.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target) && edge.source !== edge.target) {
      if (!g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, { weight: edge.weight });
      }
    }
  }

  // Run Louvain — returns {nodeId: communityId}
  let assignments: Record<string, number> = {};
  try {
    assignments = louvain(g, { resolution: 1.0 });
  } catch {
    // If Louvain fails (e.g., empty graph), assign all to community 0
    for (const node of graphData.nodes) {
      assignments[node.id] = 0;
    }
  }

  // Apply community assignments to nodes
  const nodesWithCommunities = graphData.nodes.map((node) => ({
    ...node,
    community: assignments[node.id] ?? 0,
  }));

  // Build community map
  const communities: CommunityMap = {};
  for (const node of nodesWithCommunities) {
    const cid = String(node.community);
    if (!communities[cid]) communities[cid] = [];
    communities[cid].push(node.id);
  }

  return {
    graphWithCommunities: { nodes: nodesWithCommunities, edges: graphData.edges },
    communities,
  };
}

// ============================================================
// 4. Generate — create wiki pages from communities
// ============================================================

export async function generateWikiPages(
  notebookId: string,
  graphData: GraphData,
  communities: CommunityMap
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  const openai = new OpenAI();

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
  const writtenSlugs: string[] = [];

  // Generate one wiki page per community
  for (const [communityId, nodeIds] of Object.entries(communities)) {
    if (nodeIds.length === 0) continue;

    const communityNodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const communityEdges = graphData.edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)
    );

    // Find bridge edges (cross-community)
    const bridgeEdges = graphData.edges.filter(
      (e) =>
        (nodeIds.includes(e.source) && !nodeIds.includes(e.target)) ||
        (!nodeIds.includes(e.source) && nodeIds.includes(e.target))
    );

    // God nodes (highest degree within community)
    const degreeMap: Record<string, number> = {};
    for (const id of nodeIds) degreeMap[id] = 0;
    for (const e of communityEdges) {
      degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
      degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
    }
    const godNodes = Object.entries(degreeMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => nodeMap.get(id)!)
      .filter(Boolean);

    // Determine community label from most connected node
    const communityLabel = godNodes[0]?.label || communityNodes[0]?.label || `Community ${communityId}`;

    // Build structured input for LLM
    const nodesText = communityNodes
      .map((n) => `- **${n.label}** (${n.type}): ${n.summary}`)
      .join("\n");

    const edgesText = communityEdges
      .map((e) => {
        const src = nodeMap.get(e.source)?.label || e.source;
        const tgt = nodeMap.get(e.target)?.label || e.target;
        return `- ${src} --${e.relation}--> ${tgt} (${e.confidence}, ${e.weight})`;
      })
      .join("\n");

    const bridgeText = bridgeEdges.length > 0
      ? bridgeEdges.slice(0, 5).map((e) => {
          const src = nodeMap.get(e.source)?.label || e.source;
          const tgt = nodeMap.get(e.target)?.label || e.target;
          return `- ${src} --${e.relation}--> ${tgt}`;
        }).join("\n")
      : "(none)";

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `Write a wiki page for a knowledge graph community. Output markdown.
Use [[node-id]] for wiki links between entities.
Use [source:sourceId] for source citations.
Include a "Relationships" section with confidence indicators (✓ extracted, ~ inferred, ? ambiguous).
Include a "Connections to Other Topics" section for bridge edges.
Keep it informative and concise.`,
        },
        {
          role: "user",
          content: `## Community: ${communityLabel}

### Entities
${nodesText}

### Internal Relationships
${edgesText}

### Bridge Connections
${bridgeText}`,
        },
      ],
    });

    const pageContent = completion.choices[0]?.message?.content || "";
    const slug = `community-${communityId}`;

    // Collect all sourceRefs from community nodes
    const allSourceRefs = [...new Set(communityNodes.flatMap((n) => n.sourceRefs))];

    await prisma.wikiPage.upsert({
      where: { notebookId_slug: { notebookId, slug } },
      create: {
        notebookId,
        slug,
        title: communityLabel,
        content: pageContent,
        pageType: "CONCEPT",
        sourceRefs: allSourceRefs,
      },
      update: {
        title: communityLabel,
        content: pageContent,
        sourceRefs: allSourceRefs,
      },
    });
    writtenSlugs.push(slug);
  }

  // Generate index page
  const indexLines = ["# Wiki Index\n"];
  for (const [communityId, nodeIds] of Object.entries(communities)) {
    if (nodeIds.length === 0) continue;
    const nodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const label = nodes.sort((a, b) =>
      graphData.edges.filter((e) => e.source === b.id || e.target === b.id).length -
      graphData.edges.filter((e) => e.source === a.id || e.target === a.id).length
    )[0]?.label || `Community ${communityId}`;

    indexLines.push(`## [[community-${communityId}]] — ${label}`);
    indexLines.push(`${nodeIds.length} entities: ${nodes.slice(0, 5).map((n) => `[[${n.id}]]`).join(", ")}${nodeIds.length > 5 ? "..." : ""}\n`);
  }

  await prisma.wikiPage.upsert({
    where: { notebookId_slug: { notebookId, slug: "index" } },
    create: { notebookId, slug: "index", title: "Wiki Index", content: indexLines.join("\n"), pageType: "INDEX", sourceRefs: [] },
    update: { content: indexLines.join("\n") },
  });

  return writtenSlugs;
}

// ============================================================
// 5. Remove source — deterministic graph operations
// ============================================================

export function removeSourceFromGraph(
  graphData: GraphData,
  sourceId: string
): GraphData {
  // Remove nodes that only reference this source
  const survivingNodes = graphData.nodes
    .map((node) => {
      const remainingRefs = node.sourceRefs.filter((ref) => ref !== sourceId);
      if (remainingRefs.length === 0) return null; // delete
      return { ...node, sourceRefs: remainingRefs };
    })
    .filter(Boolean) as GraphNode[];

  const survivingIds = new Set(survivingNodes.map((n) => n.id));

  // Remove edges referencing deleted nodes or only citing this source
  const survivingEdges = graphData.edges.filter(
    (edge) =>
      survivingIds.has(edge.source) &&
      survivingIds.has(edge.target) &&
      edge.sourceRef !== sourceId
  );

  return { nodes: survivingNodes, edges: survivingEdges };
}

// ============================================================
// Full pipeline
// ============================================================

export async function runGraphPipeline(
  notebookId: string,
  sourceId: string,
  sourceContent: string,
  sourceTitle: string
): Promise<{ nodesAdded: number; edgesAdded: number; communities: number; pagesWritten: number }> {
  // Load existing graph
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as GraphData)
    : { nodes: [], edges: [] };

  // 1. Extract
  const extraction = await extractGraph(
    sourceContent,
    sourceTitle,
    sourceId,
    existing.nodes.map((n) => `${n.id}: ${n.label}`)
  );

  // Update source title
  if (extraction.normalizedTitle) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { title: extraction.normalizedTitle },
    });
  }

  // 2. Merge
  const merged = mergeGraph(existing, extraction);

  // 3. Cluster
  const { graphWithCommunities, communities } = clusterGraph(merged);

  // 4. Store graph
  await prisma.notebookGraph.upsert({
    where: { notebookId },
    create: { notebookId, graphData: graphWithCommunities as any, communities: communities as any },
    update: { graphData: graphWithCommunities as any, communities: communities as any },
  });

  // 5. Generate wiki pages
  const writtenSlugs = await generateWikiPages(notebookId, graphWithCommunities, communities);

  // 6. Log
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ingest | ${extraction.normalizedTitle || sourceTitle}\nNodes: +${extraction.nodes.length}, Edges: +${extraction.edges.length}, Communities: ${Object.keys(communities).length}`;

  const logPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });
  if (logPage) {
    await prisma.wikiPage.update({
      where: { id: logPage.id },
      data: { content: logPage.content + logEntry },
    });
  }

  return {
    nodesAdded: extraction.nodes.length,
    edgesAdded: extraction.edges.length,
    communities: Object.keys(communities).length,
    pagesWritten: writtenSlugs.length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/services/graph-service.ts
git commit -m "feat: add graph service — extract, merge, cluster, generate"
```

---

## Task 3: Rewrite Wiki Ingest

**Files:**
- Modify: `apps/web/lib/services/wiki-ingest.ts`

Replace the current free-text ingest with the graph pipeline.

- [ ] **Step 1: Rewrite wiki-ingest.ts**

Replace the entire `ingestSourceToWiki` function body to call the graph pipeline:

```typescript
/**
 * Wiki ingest service — extracts knowledge graph from source,
 * merges into notebook graph, clusters, generates wiki pages.
 */

import { runGraphPipeline, removeSourceFromGraph, clusterGraph, generateWikiPages } from "./graph-service";
import type { GraphData } from "./graph-service";
import prisma from "@/lib/prisma";

export async function ingestSourceToWiki(
  notebookId: string,
  sourceId: string
): Promise<{ pagesWritten: number; pages: string[] }> {
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { wikiSchema: true } } },
  });

  if (!source) throw new Error(`Source ${sourceId} not found`);

  const content = source.markdownContent || source.content;
  if (!content) throw new Error("Source has no content to ingest");

  const result = await runGraphPipeline(notebookId, sourceId, content, source.title);

  return {
    pagesWritten: result.pagesWritten,
    pages: [`${result.nodesAdded} nodes, ${result.edgesAdded} edges, ${result.communities} communities`],
  };
}

/**
 * Remove a source's contributions from the wiki via graph operations.
 * Deterministic — no LLM needed for removal, only for regeneration.
 */
export async function removeSourceFromWiki(
  notebookId: string,
  sourceId: string,
  sourceTitle: string
): Promise<{ pagesDeleted: number; pagesUpdated: number }> {
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  if (!existingGraph?.graphData) {
    return { pagesDeleted: 0, pagesUpdated: 0 };
  }

  const graphData = existingGraph.graphData as GraphData;

  // 1. Remove source from graph (deterministic)
  const cleaned = removeSourceFromGraph(graphData, sourceId);

  // 2. Re-cluster
  const { graphWithCommunities, communities } = clusterGraph(cleaned);

  // 3. Store updated graph
  await prisma.notebookGraph.update({
    where: { notebookId },
    data: {
      graphData: graphWithCommunities as any,
      communities: communities as any,
    },
  });

  // 4. Delete old community pages
  const oldPages = await prisma.wikiPage.findMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });
  await prisma.wikiPage.deleteMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });

  // 5. Regenerate wiki pages from new communities
  let pagesWritten = 0;
  if (cleaned.nodes.length > 0) {
    const slugs = await generateWikiPages(notebookId, graphWithCommunities, communities);
    pagesWritten = slugs.length;
  } else {
    // Empty graph — reset index
    await prisma.wikiPage.upsert({
      where: { notebookId_slug: { notebookId, slug: "index" } },
      create: { notebookId, slug: "index", title: "Wiki Index", content: "# Wiki Index\n\nWiki is empty. Add sources to start building knowledge.", pageType: "INDEX", sourceRefs: [] },
      update: { content: "# Wiki Index\n\nWiki is empty. Add sources to start building knowledge." },
    });
  }

  // 6. Log
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] remove | ${sourceTitle}\nRemoved source, ${oldPages.length} old pages deleted, ${pagesWritten} pages regenerated`;
  const logPage = await prisma.wikiPage.findUnique({
    where: { notebookId_slug: { notebookId, slug: "log" } },
  });
  if (logPage) {
    await prisma.wikiPage.update({
      where: { id: logPage.id },
      data: { content: logPage.content + logEntry },
    });
  }

  return { pagesDeleted: oldPages.length, pagesUpdated: pagesWritten };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/services/wiki-ingest.ts
git commit -m "feat: rewrite wiki ingest to use graph pipeline"
```

---

## Task 4: Create NotebookGraph on Notebook Creation

**Files:**
- Modify: `apps/web/lib/actions/notebooks.ts`

- [ ] **Step 1: Add NotebookGraph creation after notebook + wiki pages**

In `createNotebook()`, after the `prisma.wikiPage.createMany` call, add:

```typescript
  // Create empty graph
  await prisma.notebookGraph.create({
    data: {
      notebookId: notebook.id,
      graphData: { nodes: [], edges: [] },
      communities: {},
    },
  });
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/lib/actions/notebooks.ts
git commit -m "feat: create empty NotebookGraph on notebook creation"
```

---

## Task 5: Graph Visualization Component

**Files:**
- Create: `apps/web/components/deepdive/wiki/graph-view.tsx`

- [ ] **Step 1: Create graph-view.tsx**

Create `apps/web/components/deepdive/wiki/graph-view.tsx`:

```tsx
"use client";

import { useMemo, useCallback, useRef } from "react";

// Dynamic import to avoid SSR issues with canvas
import dynamic from "next/dynamic";
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

interface GraphNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  community?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
}

interface GraphViewProps {
  graphData: { nodes: GraphNode[]; edges: GraphEdge[] } | null;
  onNodeClick?: (communitySlug: string) => void;
}

// Community colors — up to 10 distinct communities
const COMMUNITY_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

export function GraphView({ graphData, onNodeClick }: GraphViewProps) {
  const fgRef = useRef<any>(null);

  const data = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) {
      return { nodes: [], links: [] };
    }

    const nodes = graphData.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      summary: n.summary,
      community: n.community ?? 0,
      val: 3, // base node size
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));

    const links = graphData.edges
      .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
        confidence: e.confidence,
        weight: e.weight,
      }));

    return { nodes, links };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick && node.community !== undefined) {
        onNodeClick(`community-${node.community}`);
      }
    },
    [onNodeClick]
  );

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-8 text-center">
        <p className="text-sm text-muted-foreground">No graph data yet</p>
        <p className="text-xs text-muted-foreground">Add sources to build the knowledge graph</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ForceGraph2D
        ref={fgRef}
        graphData={data}
        nodeLabel={(node: any) => `${node.label} (${node.type})\n${node.summary}`}
        nodeColor={(node: any) => COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length]}
        nodeVal={(node: any) => node.val}
        nodeCanvasObject={(node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
          const label = node.label;
          const fontSize = 12 / globalScale;
          const color = COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];

          // Draw node circle
          ctx.beginPath();
          ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();

          // Draw label
          ctx.font = `${fontSize}px Sans-Serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = color;
          ctx.fillText(label, node.x, node.y + 8);
        }}
        linkColor={(link: any) => {
          if (link.confidence === "EXTRACTED") return "rgba(100,100,100,0.6)";
          if (link.confidence === "INFERRED") return "rgba(100,100,100,0.3)";
          return "rgba(100,100,100,0.15)";
        }}
        linkWidth={(link: any) => link.weight * 2}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        onNodeClick={handleNodeClick}
        cooldownTicks={100}
        width={400}
        height={500}
        backgroundColor="transparent"
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/deepdive/wiki/graph-view.tsx
git commit -m "feat(ui): add interactive graph visualization component"
```

---

## Task 6: Add Graph View to Wiki Panel

**Files:**
- Modify: `apps/web/components/deepdive/wiki/wiki-panel.tsx`

- [ ] **Step 1: Add view toggle and GraphView**

At the top of wiki-panel.tsx, add the import:

```typescript
import { GraphView } from "./graph-view";
```

Add a `graphData` prop to `WikiPanelProps`:

```typescript
interface WikiPanelProps {
  notebookId: string;
  initialPages?: WikiPage[];
  sources?: SourceInfo[];
  graphData?: { nodes: any[]; edges: any[] } | null;
}
```

In the WikiPanel function, add view state:

```typescript
const [view, setView] = useState<"pages" | "graph">("pages");
```

Replace the header section with a toggle:

```tsx
<div className="px-6 pt-3 pb-3 flex items-center justify-between">
  <div className="flex items-center gap-1">
    <button
      className={`px-2 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
        view === "pages"
          ? "text-foreground bg-accent/20"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => setView("pages")}
    >
      Pages
    </button>
    <button
      className={`px-2 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
        view === "graph"
          ? "text-foreground bg-accent/20"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={() => setView("graph")}
    >
      Graph
    </button>
  </div>
  <span className="text-[11px] text-muted-foreground">
    {pages.filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG").length} pages
  </span>
</div>
```

Then conditionally render based on view:
- If `view === "graph"`: render `<GraphView graphData={graphData} onNodeClick={(slug) => setSelectedSlug(slug)} />`
- If `view === "pages"`: render existing pages list

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/deepdive/wiki/wiki-panel.tsx
git commit -m "feat(ui): add pages/graph view toggle in wiki panel"
```

---

## Task 7: Wire Graph Data Through Layout

**Files:**
- Modify: `apps/web/app/[locale]/deepdive/[id]/page.tsx`
- Modify: `apps/web/components/deepdive/notebook-layout.tsx`
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx`

- [ ] **Step 1: Fetch graph data in page.tsx**

Add to the `Promise.all` data fetching:

```typescript
prisma.notebookGraph.findUnique({
  where: { notebookId: id },
  select: { graphData: true },
})
```

Pass as `graphData={notebookGraph?.graphData || null}` to NotebookLayout.

- [ ] **Step 2: Pass through layout → sources panel → wiki panel**

Add `graphData` prop through the chain:
- `NotebookLayout` accepts `graphData` and passes to `SourcesPanel`
- `SourcesPanel` passes to `WikiPanel`
- `WikiPanel` passes to `GraphView`

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/ apps/web/components/deepdive/
git commit -m "feat: wire graph data from server to wiki panel visualization"
```

---

## Task 8: Sync Schema + Verify

- [ ] **Step 1: Push schema**

```bash
cd apps/web && npx prisma db push
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Push**

```bash
git push origin feature/global-knowledge-base
```
