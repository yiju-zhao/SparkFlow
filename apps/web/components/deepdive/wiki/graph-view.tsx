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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

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
    setDimensions({
      width: Math.floor(el.clientWidth),
      height: Math.floor(el.clientHeight),
    });

    return () => observer.disconnect();
  }, []);

  // Zoom to fit after graph settles
  useEffect(() => {
    if (fgRef.current && dimensions.width > 0) {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(400, 40);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [dimensions.width, graphData]);

  // Compute node degrees for sizing
  const degreeMap = useMemo(() => {
    const map: Record<string, number> = {};
    if (!graphData) return map;
    for (const e of graphData.edges) {
      map[e.source] = (map[e.source] || 0) + 1;
      map[e.target] = (map[e.target] || 0) + 1;
    }
    return map;
  }, [graphData]);

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
      val: 2 + (degreeMap[n.id] || 0),
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
  }, [graphData, degreeMap]);

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
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full py-8 text-center">
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
            const degree = degreeMap[node.id] || 0;
            const color = COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];

            // Node radius scales with degree
            const baseRadius = 4 + Math.min(degree * 1.5, 8);

            // Draw node circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, baseRadius, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // Label: clamp font size for readability at all zoom levels
            const rawFontSize = 11 / globalScale;
            const fontSize = Math.max(3, Math.min(rawFontSize, 14));

            // Truncate long labels
            const maxChars = globalScale > 1.5 ? 30 : 16;
            const displayLabel = label.length > maxChars ? label.slice(0, maxChars) + "…" : label;

            ctx.font = `500 ${fontSize}px -apple-system, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = color;
            ctx.fillText(displayLabel, node.x, node.y + baseRadius + 2);
          }}
          linkColor={(link: any) => {
            if (link.confidence === "EXTRACTED") return "rgba(120,120,120,0.5)";
            if (link.confidence === "INFERRED") return "rgba(120,120,120,0.25)";
            return "rgba(120,120,120,0.12)";
          }}
          linkWidth={(link: any) => Math.max(0.5, link.weight * 1.5)}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={0.95}
          onNodeClick={handleNodeClick}
          cooldownTicks={150}
          d3AlphaDecay={0.02}
          d3VelocityDecay={0.3}
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          minZoom={0.3}
          maxZoom={8}
          enableZoomInteraction={true}
          enablePanInteraction={true}
        />
      )}
    </div>
  );
}
