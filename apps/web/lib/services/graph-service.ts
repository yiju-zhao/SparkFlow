/**
 * Graph service — extract, merge, cluster, and generate wiki pages.
 * Implements the Graphify-inspired pipeline entirely in TypeScript.
 */

import prisma from "@/lib/prisma";

// Resolve wiki model + API key for a user. BYOK is required: all users
// (including admins) configure their own keys via Settings. If the user
// hasn't picked a wiki model OR hasn't set an API key for that provider,
// this throws — the ingest pipeline surfaces the error to the client.
async function resolveWikiClient(userId: string) {
  const { default: OpenAI } = await import("openai");
  const { resolveApiKey } = await import("@/lib/services/api-key-resolver");

  const settings = await prisma.userSettings.findUnique({
    where: { userId },
    select: { wikiModelProvider: true, wikiModelName: true },
  });

  if (!settings?.wikiModelProvider || !settings.wikiModelName) {
    throw new Error(
      "Wiki model is not configured. Open Settings → Deepdive → Wiki generation model to pick one.",
    );
  }

  // resolveApiKey throws if the user hasn't configured a BYOK key for
  // this provider; the error message points them at /settings.
  const resolved = await resolveApiKey(userId, settings.wikiModelProvider);

  return {
    client: new OpenAI({ apiKey: resolved.apiKey, baseURL: resolved.baseUrl }),
    model: settings.wikiModelName,
  };
}

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
  userId: string,
): Promise<ExtractionResult> {
  const { client: openai, model: wikiModel } = await resolveWikiClient(userId);

  const truncated =
    sourceContent.length > 50000
      ? sourceContent.slice(0, 50000) + "\n\n[... truncated ...]"
      : sourceContent;

  const existingContext =
    existingNodeLabels.length > 0
      ? `\nExisting entities in the graph (reuse these IDs if the source mentions them):\n${existingNodeLabels.map((l) => `- ${l}`).join("\n")}\n`
      : "";

  const completion = await openai.chat.completions.create({
    model: wikiModel,
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

  const nodes: GraphNode[] = (result.nodes || []).map((n: Omit<GraphNode, "sourceRefs">) => ({
    ...n,
    sourceRefs: [sourceId],
  }));

  const edges: GraphEdge[] = (result.edges || []).map((e: Omit<GraphEdge, "sourceRef">) => ({
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

export function mergeGraph(existing: GraphData, extraction: ExtractionResult): GraphData {
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
// 4. Build wiki page content — pure, no DB writes
// ============================================================

export type BuiltWikiPage = {
  slug: string;
  title: string;
  content: string;
  sourceRefs: string[];
};

export type BuiltWikiPayload = {
  communityPages: BuiltWikiPage[];
  indexPage: BuiltWikiPage;
};

export async function buildWikiPagePayload(
  graphData: GraphData,
  communities: CommunityMap,
  userId: string,
): Promise<BuiltWikiPayload> {
  const { client: openai, model: wikiModel } = await resolveWikiClient(userId);

  const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));
  const communityEntries = Object.entries(communities).filter(([, ids]) => ids.length > 0);

  const preparations = communityEntries.map(([communityId, nodeIds]) => {
    const communityNodes = nodeIds.map((id) => nodeMap.get(id)!).filter(Boolean);
    const communityEdges = graphData.edges.filter(
      (e) => nodeIds.includes(e.source) && nodeIds.includes(e.target),
    );
    const bridgeEdges = graphData.edges.filter(
      (e) =>
        (nodeIds.includes(e.source) && !nodeIds.includes(e.target)) ||
        (!nodeIds.includes(e.source) && nodeIds.includes(e.target)),
    );

    const degreeMap: Record<string, number> = {};
    for (const id of nodeIds) degreeMap[id] = 0;
    for (const e of communityEdges) {
      degreeMap[e.source] = (degreeMap[e.source] || 0) + 1;
      degreeMap[e.target] = (degreeMap[e.target] || 0) + 1;
    }
    const topNode = Object.entries(degreeMap).sort((a, b) => b[1] - a[1])[0];
    const communityLabel =
      (topNode ? nodeMap.get(topNode[0])?.label : null) ||
      communityNodes[0]?.label ||
      `Community ${communityId}`;

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
    const bridgeText =
      bridgeEdges.length > 0
        ? bridgeEdges
            .slice(0, 5)
            .map(
              (e) =>
                `- ${nodeMap.get(e.source)?.label || e.source} --${e.relation}--> ${nodeMap.get(e.target)?.label || e.target}`,
            )
            .join("\n")
        : "(none)";

    return {
      communityId,
      communityLabel,
      communityNodes,
      nodesText,
      edgesText,
      bridgeText,
      sourceRefs: [...new Set(communityNodes.flatMap((n) => n.sourceRefs))],
    };
  });

  const completions = await Promise.all(
    preparations.map((p) =>
      openai.chat.completions.create({
        model: wikiModel,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `Write a wiki page for a knowledge graph community. Output markdown.
Use [[node-id]] for wiki links to other entities.
Include "Relationships" with confidence (✓ extracted, ~ inferred, ? ambiguous).
Include "Connections to Other Topics" for bridge edges. Be concise.
Do NOT include a References section — source attribution is handled separately.`,
          },
          {
            role: "user",
            content: `## Community: ${p.communityLabel}\n\n### Entities\n${p.nodesText}\n\n### Internal Relationships\n${p.edgesText || "(none)"}\n\n### Bridge Connections\n${p.bridgeText}`,
          },
        ],
      }),
    ),
  );

  const communityPages: BuiltWikiPage[] = preparations.map((p, i) => ({
    slug: `community-${p.communityId}`,
    title: p.communityLabel,
    content: completions[i].choices[0]?.message?.content || "",
    sourceRefs: p.sourceRefs,
  }));

  // Index page — lists every community with its top entities.
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
    indexLines.push(
      `${nodeIds.length} entities: ${nodes
        .slice(0, 5)
        .map((n) => `[[${n.id}]]`)
        .join(", ")}${nodeIds.length > 5 ? "..." : ""}\n`,
    );
  }

  const indexPage: BuiltWikiPage = {
    slug: "index",
    title: "Wiki Index",
    content: indexLines.join("\n"),
    sourceRefs: [],
  };

  return { communityPages, indexPage };
}

// ============================================================
// 5. Integrate wiki page — lightweight graph update for a single page
// ============================================================

export async function integrateWikiPage(
  notebookId: string,
  pageSlug: string,
  pageContent: string,
  sourceRefs: string[],
  userId: string,
): Promise<{ nodesAdded: number; edgesAdded: number }> {
  const { client: openai, model: wikiModel } = await resolveWikiClient(userId);

  const existingGraph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  const existing: GraphData = existingGraph?.graphData
    ? (existingGraph.graphData as unknown as GraphData)
    : { nodes: [], edges: [] };

  const completion = await openai.chat.completions.create({
    model: wikiModel,
    temperature: 0.2,
    messages: [
      {
        role: "system",
        content: `Extract knowledge graph entities from this wiki article. Output JSON:
{"nodes": [{"id": "slug-name", "label": "Display Name", "type": "entity|concept|method", "summary": "one-line"}], "edges": [{"source": "id-a", "target": "id-b", "relation": "uses|improves|alternative_to|component_of|extends", "confidence": "INFERRED", "weight": 0.7}]}
Only extract key entities. Reuse existing node IDs when possible.
Existing nodes: ${existing.nodes
          .slice(0, 50)
          .map((n) => `${n.id}: ${n.label}`)
          .join(", ")}`,
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
  const nodes: GraphNode[] = (result.nodes || []).map((n: Omit<GraphNode, "sourceRefs">) => ({
    ...n,
    sourceRefs,
  }));
  const edges: GraphEdge[] = (result.edges || []).map((e: Omit<GraphEdge, "sourceRef">) => ({
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
    create: {
      notebookId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graphData: graphWithCommunities as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      communities: communities as any,
    },
    update: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      graphData: graphWithCommunities as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      communities: communities as any,
    },
  });

  return { nodesAdded: nodes.length, edgesAdded: edges.length };
}

// ============================================================
// 6. Remove source — deterministic graph operations
// ============================================================

export function removeSourceFromGraph(graphData: GraphData, sourceId: string): GraphData {
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
      survivingIds.has(edge.source) && survivingIds.has(edge.target) && edge.sourceRef !== sourceId,
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
  userId: string,
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
    userId,
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
    edges: extraction.edges.map((e) => ({
      source: e.source,
      target: e.target,
      relation: e.relation,
    })),
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

  // 4. Build wiki page content OUTSIDE any transaction.
  //    LLM calls here take 10s-60s; never hold a tx across them.
  await updateWikiStatus("generating");
  const { communityPages, indexPage } = await buildWikiPagePayload(
    graphWithCommunities,
    communities,
    userId,
  );

  // 5. Commit everything atomically: graph upsert, wiki-page upserts,
  //    orphan delete, and log append in one short transaction.
  const today = new Date().toISOString().split("T")[0];
  const logEntry = `\n## [${today}] ingest | ${extraction.normalizedTitle || sourceTitle}\nNodes: +${extraction.nodes.length}, Edges: +${extraction.edges.length}, Communities: ${Object.keys(communities).length}`;
  const writtenSlugs = communityPages.map((p) => p.slug);

  await prisma.$transaction(
    async (tx) => {
      await tx.notebookGraph.upsert({
        where: { notebookId },
        create: {
          notebookId,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphData: graphWithCommunities as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communities: communities as any,
        },
        update: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          graphData: graphWithCommunities as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          communities: communities as any,
        },
      });

      for (const p of communityPages) {
        await tx.wikiPage.upsert({
          where: { notebookId_slug: { notebookId, slug: p.slug } },
          create: {
            notebookId,
            slug: p.slug,
            title: p.title,
            content: p.content,
            pageType: "CONCEPT",
            sourceRefs: p.sourceRefs,
          },
          update: { title: p.title, content: p.content, sourceRefs: p.sourceRefs },
        });
      }

      await tx.wikiPage.upsert({
        where: { notebookId_slug: { notebookId, slug: indexPage.slug } },
        create: {
          notebookId,
          slug: indexPage.slug,
          title: indexPage.title,
          content: indexPage.content,
          pageType: "INDEX",
          sourceRefs: [],
        },
        update: { content: indexPage.content },
      });

      await tx.wikiPage.deleteMany({
        where: {
          notebookId,
          slug: { startsWith: "community-" },
          NOT: { slug: { in: writtenSlugs } },
        },
      });

      const logPage = await tx.wikiPage.findUnique({
        where: { notebookId_slug: { notebookId, slug: "log" } },
        select: { id: true, content: true },
      });
      if (logPage) {
        await tx.wikiPage.update({
          where: { id: logPage.id },
          data: { content: logPage.content + logEntry },
        });
      }
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  await updateWikiStatus("done");

  return {
    nodesAdded: extraction.nodes.length,
    edgesAdded: extraction.edges.length,
    communities: Object.keys(communities).length,
    pagesWritten: writtenSlugs.length,
    extractionReport,
  };
}
