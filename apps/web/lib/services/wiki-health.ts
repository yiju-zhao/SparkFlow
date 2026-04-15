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

  // 3. Pages with no source refs (except INDEX, LOG, ARTICLE)
  for (const page of pages) {
    if (page.pageType === "INDEX" || page.pageType === "LOG" || page.pageType === "ARTICLE")
      continue;
    if (page.sourceRefs.length === 0) {
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
