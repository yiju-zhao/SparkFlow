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

  // Responsive sizing
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width: Math.floor(width), height: Math.floor(height) });
    });
    observer.observe(el);
    setDimensions({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  // Zoom-to-fit once simulation settles
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || dimensions.width === 0) return;
    // Wait for simulation to cool down (cooldownTicks=80 at default decay ≈ 2s)
    const timer = setTimeout(() => fg.zoomToFit(300, 30), 2000);
    return () => clearTimeout(timer);
  }, [dimensions.width, graphData]);

  // Degree map — used for node sizing
  const degreeMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (!graphData) return m;
    for (const e of graphData.edges) {
      m[e.source] = (m[e.source] || 0) + 1;
      m[e.target] = (m[e.target] || 0) + 1;
    }
    return m;
  }, [graphData]);

  const data = useMemo(() => {
    if (!graphData || graphData.nodes.length === 0) return { nodes: [], links: [] };
    const nodeIds = new Set(graphData.nodes.map((n) => n.id));
    return {
      nodes: graphData.nodes.map((n) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        summary: n.summary,
        community: n.community ?? 0,
      })),
      links: graphData.edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({ source: e.source, target: e.target, relation: e.relation, confidence: e.confidence, weight: e.weight })),
    };
  }, [graphData]);

  const handleNodeClick = useCallback(
    (node: any) => {
      if (onNodeClick && node.community !== undefined) {
        onNodeClick(`community-${node.community}`);
      }
    },
    [onNodeClick],
  );

  // ── Custom canvas renderer ──
  // Key insight: nodeCanvasObject works in GRAPH coordinates.
  // To draw text at a fixed SCREEN pixel size, divide desired px by globalScale.
  const paintNode = useCallback(
    (node: any, ctx: CanvasRenderingContext2D, globalScale: number) => {
      const color = COMMUNITY_COLORS[node.community % COMMUNITY_COLORS.length];
      const degree = degreeMap[node.id] || 0;

      // ── Circle ──
      // Radius in graph-coords. Divide by globalScale so it looks the same size on screen.
      const screenRadius = 4 + Math.min(degree, 6); // 4-10 screen pixels
      const r = screenRadius / globalScale;

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = color;
      ctx.fill();

      // ── Label ──
      // Fixed 11px on screen regardless of zoom
      const screenFontSize = 11;
      const fontSize = screenFontSize / globalScale;

      // Only show labels when zoomed in enough (avoid clutter at overview zoom)
      if (globalScale < 0.4) return;

      const maxLen = globalScale < 0.8 ? 10 : globalScale < 1.5 ? 18 : 40;
      const text = node.label.length > maxLen ? node.label.slice(0, maxLen) + "…" : node.label;

      ctx.font = `500 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillStyle = color;
      ctx.fillText(text, node.x, node.y + r + 2 / globalScale);
    },
    [degreeMap],
  );

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div ref={containerRef} className="flex flex-col items-center justify-center h-full text-center">
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
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="transparent"
          /* ── Nodes ── */
          nodeCanvasObject={paintNode}
          nodePointerAreaPaint={(node: any, color: string, ctx: CanvasRenderingContext2D, globalScale: number) => {
            // Larger hit area for easier clicking
            const r = 10 / globalScale;
            ctx.beginPath();
            ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
          }}
          nodeLabel={(node: any) => `${node.label} (${node.type})\n${node.summary}`}
          onNodeClick={handleNodeClick}
          /* ── Links ── */
          linkLabel={(link: any) => {
            const src = typeof link.source === "object" ? link.source.label : link.source;
            const tgt = typeof link.target === "object" ? link.target.label : link.target;
            return `${src} → ${link.relation.replace(/_/g, " ")} → ${tgt}`;
          }}
          linkColor={(link: any) => {
            if (link.confidence === "EXTRACTED") return "rgba(140,140,140,0.45)";
            if (link.confidence === "INFERRED") return "rgba(140,140,140,0.2)";
            return "rgba(140,140,140,0.1)";
          }}
          linkWidth={(link: any) => Math.max(0.3, link.weight)}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={0.92}
          /* ── Force layout ── */
          d3AlphaDecay={0.05}
          d3VelocityDecay={0.4}
          cooldownTicks={80}
          /* ── Zoom ── */
          minZoom={0.2}
          maxZoom={6}
        />
      )}
    </div>
  );
}
