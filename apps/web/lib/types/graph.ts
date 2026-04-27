/**
 * Knowledge-graph type definitions consumed by the wiki UI and the
 * Prisma JSON columns (notebookGraph.graphData / .communities).
 *
 * Authoritative implementation lives in apps/langgraph/workflows/wiki_ingest.py;
 * the Python side serializes to snake_case (source_refs etc.) and the
 * Node-side wiki-ingest.ts converts to the camelCase shape declared here
 * before storing in Prisma. The wiki UI components consume this shape.
 */

export interface GraphNode {
  id: string;
  label: string;
  type: "entity" | "concept" | "method" | "person" | "dataset" | "tool" | string;
  summary: string;
  sourceRefs: string[];
  community?: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: "EXTRACTED" | "INFERRED" | "AMBIGUOUS" | string;
  weight: number;
  sourceRef: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface CommunityMap {
  [communityId: string]: string[];
}
