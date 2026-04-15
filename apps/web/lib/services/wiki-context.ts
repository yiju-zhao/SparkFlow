import prisma from "@/lib/prisma";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  sourceRefs: string[];
  community?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
  sourceRef: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Extract a lightweight wiki context string for the search agent.
 * Returns top entities by connectivity + top relationships.
 * Target: ~500 tokens max.
 */
export async function getWikiContextForSearch(notebookId: string): Promise<string> {
  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
  });

  if (!graph?.graphData) return "";

  const data = graph.graphData as unknown as GraphData;
  if (!data.nodes?.length) return "";

  // Count edges per node to find most connected (central) entities
  const edgeCount = new Map<string, number>();
  for (const node of data.nodes) {
    edgeCount.set(node.id, 0);
  }
  for (const edge of data.edges) {
    edgeCount.set(edge.source, (edgeCount.get(edge.source) || 0) + 1);
    edgeCount.set(edge.target, (edgeCount.get(edge.target) || 0) + 1);
  }

  // Top 10 entities by edge count
  const topNodes = [...data.nodes]
    .sort((a, b) => (edgeCount.get(b.id) || 0) - (edgeCount.get(a.id) || 0))
    .slice(0, 10);

  const topNodeIds = new Set(topNodes.map((n) => n.id));

  // Top 10 relationships between top entities (by weight)
  const topEdges = data.edges
    .filter((e) => topNodeIds.has(e.source) && topNodeIds.has(e.target))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const parts: string[] = [];

  const topicsList = topNodes.map((n) => `${n.label} (${n.type})`).join(", ");
  parts.push(`Topics: ${topicsList}`);

  if (topEdges.length > 0) {
    const nodeLabel = new Map(data.nodes.map((n) => [n.id, n.label]));
    const relsList = topEdges
      .map((e) => `${nodeLabel.get(e.source)} → ${e.relation} → ${nodeLabel.get(e.target)}`)
      .join("; ");
    parts.push(`Relationships: ${relsList}`);
  }

  return parts.join("\n");
}
