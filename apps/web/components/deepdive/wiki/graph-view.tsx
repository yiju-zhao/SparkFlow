"use client";

import { useMemo, useCallback, useRef, useState, useEffect } from "react";
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

const COMMUNITY_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16",
];

export function GraphView({ graphData, onNodeClick }: GraphViewProps) {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 400, height: 500 });

  // Track container size with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });

    observer.observe(el);
    // Set initial size
    setDimensions({
      width: Math.floor(el.clientWidth),
      height: Math.floor(el.clientHeight),
    });

    return () => observer.disconnect();
  }, []);

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
      val: 3,
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
    <div ref={containerRef} className="h-full w-full">
      {dimensions.width > 0 && dimensions.height > 0 && (
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

            ctx.beginPath();
            ctx.arc(node.x, node.y, 5, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

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
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
        />
      )}
    </div>
  );
}
