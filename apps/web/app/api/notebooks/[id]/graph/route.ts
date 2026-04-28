import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface StoredGraphNode {
  id: string;
  community?: number | null;
  [k: string]: unknown;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: notebookId } = await params;

  const graph = await prisma.notebookGraph.findUnique({
    where: { notebookId },
    select: { graphData: true, communities: true },
  });

  if (!graph?.graphData) {
    return NextResponse.json({ graphData: null });
  }

  // Backfill `node.community` from the sibling `communities` column when
  // the stored nodes don't carry it. Pre-fix ingest runs (and the now-
  // retired TS pipeline at certain points) wrote graphData with nodes
  // lacking `community`; without this hydration the wiki UI groups
  // nothing and shows zero topics. Cheap O(N) pass per request.
  const graphData = graph.graphData as { nodes: StoredGraphNode[]; edges: unknown[] };
  const needsBackfill =
    Array.isArray(graphData.nodes) &&
    graphData.nodes.some((n) => n.community === undefined || n.community === null);
  if (needsBackfill && graph.communities) {
    const idToCommunity: Record<string, number> = {};
    for (const [cidStr, nodeIds] of Object.entries(graph.communities as Record<string, string[]>)) {
      const cid = Number(cidStr);
      if (Number.isNaN(cid)) continue;
      for (const nodeId of nodeIds) idToCommunity[nodeId] = cid;
    }
    for (const node of graphData.nodes) {
      if (
        (node.community === undefined || node.community === null) &&
        idToCommunity[node.id] !== undefined
      ) {
        node.community = idToCommunity[node.id];
      }
    }
  }

  return NextResponse.json({ graphData });
}
