/**
 * Graph service — extract, merge, cluster, and generate wiki pages.
 * Implements the Graphify-inspired pipeline entirely in TypeScript.
 */

import prisma from "@/lib/prisma";

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
  existingNodeLabels: string[],
  userId?: string
): Promise<ExtractionResult> {
  const { default: OpenAI } = await import("openai");
  let openaiConfig: { apiKey?: string; baseURL?: string } = {};
  if (userId) {
    try {
      const { resolveApiKey } = await import("@/lib/services/api-key-resolver");
      const resolved = await resolveApiKey(userId, "openai");
      openaiConfig = { apiKey: resolved.apiKey, baseURL: resolved.baseUrl };
    } catch {
      // Fall through to default (will fail for non-admin if no env key)
    }
  }
  const openai = new OpenAI(openaiConfig);

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

export async function clusterGraph(graphData: GraphData): Promise<{
  graphWithCommunities: GraphData;
  communities: CommunityMap;
}> {
  if (graphData.nodes.length === 0) {
    return { graphWithCommunities: graphData, communities: {} };
  }

  const { default: Graph } = await import("graphology");
  const { default: louvain } = await import("graphology-communities-louvain");

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
  communities: CommunityMap,
  userId?: string
): Promise<string[]> {
  const { default: OpenAI } = await import("openai");
  let openaiConfig: { apiKey?: string; baseURL?: string } = {};
  if (userId) {
    try {
      const { resolveApiKey } = await import("@/lib/services/api-key-resolver");
      const resolved = await resolveApiKey(userId, "openai");
      openaiConfig = { apiKey: resolved.apiKey, baseURL: resolved.baseUrl };
    } catch {
      // Fall through
    }
  }
  const openai = new OpenAI(openaiConfig);

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));

  // Prepare all community data first
  const communityEntries = Object.entries(communities).filter(([, ids]) => ids.length > 0);

  const preparations = communityEntries.map(([communityId, nodeIds]) => {
    const communityNodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const communityEdges = graphData.edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target)
    );
    const bridgeEdges = graphData.edges.filter(
      (e) =>
        (nodeIds.includes(e.source) && !nodeIds.includes(e.target)) ||
        (!nodeIds.includes(e.source) && nodeIds.includes(e.target))
    );

    // Find god nodes by degree
    const degreeMap: Record<string, number> = {};
    for (const id of nodeIds) degreeMap[id] = 0;
    for (const e of communityEdges) {
      degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
      degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
    }
    const topNode = Object.entries(degreeMap).sort((a, b) => b[1] - a[1])[0];
    const communityLabel = (topNode ? nodeMap.get(topNode[0])?.label : null) || communityNodes[0]?.label || `Community ${communityId}`;

    const nodesText = communityNodes.map((n) => `- **${n.label}** (${n.type}): ${n.summary}`).join("\n");
    const edgesText = communityEdges.map((e) => {
      const src = nodeMap.get(e.source)?.label || e.source;
      const tgt = nodeMap.get(e.target)?.label || e.target;
      return `- ${src} --${e.relation}--> ${tgt} (${e.confidence}, ${e.weight})`;
    }).join("\n");
    const bridgeText = bridgeEdges.length > 0
      ? bridgeEdges.slice(0, 5).map((e) => `- ${nodeMap.get(e.source)?.label || e.source} --${e.relation}--> ${nodeMap.get(e.target)?.label || e.target}`).join("\n")
      : "(none)";

    return {
      communityId, communityLabel, communityNodes, nodesText, edgesText, bridgeText,
      sourceRefs: [...new Set(communityNodes.flatMap((n) => n.sourceRefs))],
    };
  });

  // Parallel LLM calls for all communities
  const completions = await Promise.all(
    preparations.map((p) =>
      openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Write a wiki page for a knowledge graph community. Output markdown.
Use [[node-id]] for wiki links. Use [source:sourceId] for citations.
Include "Relationships" with confidence (✓ extracted, ~ inferred, ? ambiguous).
Include "Connections to Other Topics" for bridge edges. Be concise.`,
          },
          {
            role: "user",
            content: `## Community: ${p.communityLabel}\n\n### Entities\n${p.nodesText}\n\n### Internal Relationships\n${p.edgesText || "(none)"}\n\n### Bridge Connections\n${p.bridgeText}`,
          },
        ],
      })
    )
  );

  // Write all pages to DB
  const writtenSlugs = await Promise.all(
    preparations.map(async (p, i) => {
      const slug = `community-${p.communityId}`;
      const content = completions[i].choices[0]?.message?.content || "";
      await prisma.wikiPage.upsert({
        where: { notebookId_slug: { notebookId, slug } },
        create: { notebookId, slug, title: p.communityLabel, content, pageType: "CONCEPT", sourceRefs: p.sourceRefs },
        update: { title: p.communityLabel, content, sourceRefs: p.sourceRefs },
      });
      return slug;
    })
  );

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
// 5. Integrate wiki page — lightweight graph update for a single page
// ============================================================

export async function integrateWikiPage(
  notebookId: string,
  pageSlug: string,
  pageContent: string,
  sourceRefs: string[],
  userId?: string
): Promise<{ nodesAdded: number; edgesAdded: number }> {
  const { default: OpenAI } = await import("openai");
  let openaiConfig: { apiKey?: string; baseURL?: string } = {};
  if (userId) {
    try {
      const { resolveApiKey } = await import("@/lib/services/api-key-resolver");
      const resolved = await resolveApiKey(userId, "openai");
      openaiConfig = { apiKey: resolved.apiKey, baseURL: resolved.baseUrl };
    } catch {
      // Fall through
    }
  }
  const openai = new OpenAI(openaiConfig);

  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as unknown as GraphData)
    : { nodes: [], edges: [] };

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

  const merged = mergeGraph(existing, { nodes, edges, normalizedTitle: "" });
  const { graphWithCommunities, communities } = await clusterGraph(merged);

  await prisma.notebookGraph.upsert({
    where: { notebookId },
    create: { notebookId, graphData: graphWithCommunities as any, communities: communities as any },
    update: { graphData: graphWithCommunities as any, communities: communities as any },
  });

  return { nodesAdded: nodes.length, edgesAdded: edges.length };
}

// ============================================================
// 6. Remove source — deterministic graph operations
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
  sourceTitle: string,
  userId?: string
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
  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as unknown as GraphData)
    : { nodes: [], edges: [] };

  // Single status update helper — writes directly without re-reading metadata
  const updateWikiStatus = (wikiStatus: string) =>
    prisma.source.update({
      where: { id: sourceId },
      data: { metadata: { wikiStatus } },
    });

  // 1. Extract
  await updateWikiStatus("extracting");
  const extraction = await extractGraph(
    sourceContent,
    sourceTitle,
    sourceId,
    existing.nodes.map((n) => `${n.id}: ${n.label}`),
    userId
  );

  // Build extraction report with cross-references
  const newNodeIds = new Set(extraction.nodes.map((n) => n.id));
  const existingNodeIds = new Set(existing.nodes.map((n) => n.id));
  const crossRefs: string[] = [];

  // Nodes that already exist in the graph
  for (const n of extraction.nodes) {
    if (existingNodeIds.has(n.id)) {
      crossRefs.push(`"${n.label}" already exists in the knowledge network`);
    }
  }

  // Edges connecting new nodes to existing ones
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

  // Update source title
  if (extraction.normalizedTitle) {
    await prisma.source.update({
      where: { id: sourceId },
      data: { title: extraction.normalizedTitle },
    });
  }

  // 2. Merge
  await updateWikiStatus("merging");
  const merged = mergeGraph(existing, extraction);

  // 3. Cluster
  await updateWikiStatus("clustering");
  const { graphWithCommunities, communities } = await clusterGraph(merged);

  // 4. Store graph
  await prisma.notebookGraph.upsert({
    where: { notebookId },
    create: { notebookId, graphData: graphWithCommunities as any, communities: communities as any },
    update: { graphData: graphWithCommunities as any, communities: communities as any },
  });

  // 5. Delete old community pages and regenerate
  await updateWikiStatus("generating");
  await prisma.wikiPage.deleteMany({
    where: { notebookId, slug: { startsWith: "community-" } },
  });
  const writtenSlugs = await generateWikiPages(notebookId, graphWithCommunities, communities, userId);

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

  await updateWikiStatus("done");

  return {
    nodesAdded: extraction.nodes.length,
    edgesAdded: extraction.edges.length,
    communities: Object.keys(communities).length,
    pagesWritten: writtenSlugs.length,
    extractionReport,
  };
}
