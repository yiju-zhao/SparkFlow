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
  [communityId: string]: string[];
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

  const nodes: GraphNode[] = (result.nodes || []).map((n: any) => ({
    ...n,
    sourceRefs: [sourceId],
  }));

  const edges: GraphEdge[] = (result.edges || []).map((e: any) => ({
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

  for (const node of existing.nodes) {
    nodeMap.set(node.id, { ...node });
  }

  for (const node of extraction.nodes) {
    const ex = nodeMap.get(node.id);
    if (ex) {
      ex.sourceRefs = [...new Set([...ex.sourceRefs, ...node.sourceRefs])];
      if (node.summary.length > ex.summary.length) {
        ex.summary = node.summary;
      }
    } else {
      nodeMap.set(node.id, { ...node });
    }
  }

  const edgeKey = (e: GraphEdge) => `${e.source}|${e.target}|${e.relation}`;

  for (const edge of existing.edges) {
    edgeMap.set(edgeKey(edge), { ...edge });
  }

  for (const edge of extraction.edges) {
    const key = edgeKey(edge);
    const ex = edgeMap.get(key);
    if (ex) {
      if (edge.weight > ex.weight) {
        ex.confidence = edge.confidence;
        ex.weight = edge.weight;
      }
    } else {
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

  for (const node of graphData.nodes) {
    g.addNode(node.id);
  }

  for (const edge of graphData.edges) {
    if (g.hasNode(edge.source) && g.hasNode(edge.target) && edge.source !== edge.target) {
      if (!g.hasEdge(edge.source, edge.target)) {
        g.addEdge(edge.source, edge.target, { weight: edge.weight });
      }
    }
  }

  let assignments: Record<string, number> = {};
  try {
    assignments = louvain(g, { resolution: 1.0 });
  } catch {
    for (const node of graphData.nodes) {
      assignments[node.id] = 0;
    }
  }

  const nodesWithCommunities = graphData.nodes.map((node) => ({
    ...node,
    community: assignments[node.id] ?? 0,
  }));

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

  for (const [communityId, nodeIds] of Object.entries(communities)) {
    if (nodeIds.length === 0) continue;

    const communityNodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const communityEdges = graphData.edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)
    );

    const bridgeEdges = graphData.edges.filter(
      (e) =>
        (nodeIds.includes(e.source) && !nodeIds.includes(e.target)) ||
        (!nodeIds.includes(e.source) && nodeIds.includes(e.target))
    );

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

    const communityLabel = godNodes[0]?.label || communityNodes[0]?.label || `Community ${communityId}`;

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
${edgesText || "(none)"}

### Bridge Connections
${bridgeText}`,
        },
      ],
    });

    const pageContent = completion.choices[0]?.message?.content || "";
    const slug = `community-${communityId}`;

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
    const sorted = [...nodes].sort((a, b) => {
      const degA = graphData.edges.filter((e) => e.source === a.id || e.target === a.id).length;
      const degB = graphData.edges.filter((e) => e.source === b.id || e.target === b.id).length;
      return degB - degA;
    });
    const label = sorted[0]?.label || `Community ${communityId}`;
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
  const survivingNodes = graphData.nodes
    .map((node) => {
      const remainingRefs = node.sourceRefs.filter((ref) => ref !== sourceId);
      if (remainingRefs.length === 0) return null;
      return { ...node, sourceRefs: remainingRefs };
    })
    .filter(Boolean) as GraphNode[];

  const survivingIds = new Set(survivingNodes.map((n) => n.id));

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
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as unknown as GraphData)
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

  // 5. Delete old community pages and regenerate
  await prisma.wikiPage.deleteMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });
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
