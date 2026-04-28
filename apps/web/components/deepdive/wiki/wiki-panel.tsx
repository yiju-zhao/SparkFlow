"use client";

import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Lightbulb, Pencil, RefreshCw, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { ResizableDivider } from "@/components/ui/resizable-divider";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { GraphView } from "./graph-view";
import { HealthCheckButton } from "./health-check";

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content?: string;
  pageType: string;
  sourceRefs: string[];
  updatedAt: string;
}

interface SourceInfo {
  id: string;
  title: string;
}

interface GraphNode {
  id: string;
  label: string;
  type: string;
  summary: string;
  community?: number;
  sourceRefs?: string[];
}

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  confidence: string;
  weight: number;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface WikiPanelProps {
  notebookId: string;
  initialPages?: WikiPage[];
  sources?: SourceInfo[];
  graphData?: GraphData | null;
  onSourceClick?: (sourceId: string) => void;
  /** Set externally (e.g. from chat wiki links) to navigate to a page */
  navigateToSlug?: string | null;
  onNavigateComplete?: () => void;
  /** Fired when the panel enters or leaves the page-detail view. */
  onPageSelectionChange?: (hasSelection: boolean) => void;
}

const CONFIDENCE_LABELS: Record<string, string> = {
  EXTRACTED: "✓",
  INFERRED: "~",
  AMBIGUOUS: "?",
};

interface CommunityInfo {
  id: number;
  slug: string;
  title: string;
  page?: WikiPage;
  nodes: { id: string; label: string; type: string; summary: string; sourceRefs: string[] }[];
  edges: { source: string; target: string; relation: string; confidence: string; weight: number }[];
  sourceCount: number;
}

function buildCommunities(pages: WikiPage[], graphData: GraphData | null): CommunityInfo[] {
  if (!graphData?.nodes || !graphData?.edges) {
    // No graph — fall back to pages as communities without entity/edge detail
    return pages
      .filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG")
      .map((p, i) => ({
        id: i,
        slug: p.slug,
        title: p.title,
        page: p,
        nodes: [],
        edges: [],
        sourceCount: p.sourceRefs.length,
      }));
  }

  // Group nodes by community
  const communityNodes = new Map<number, GraphNode[]>();
  for (const node of graphData.nodes) {
    if (node.community === undefined) continue;
    if (!communityNodes.has(node.community)) communityNodes.set(node.community, []);
    communityNodes.get(node.community)!.push(node);
  }

  // Build community info
  const communities: CommunityInfo[] = [];
  for (const [communityId, nodes] of communityNodes.entries()) {
    const slug = `community-${communityId}`;
    const page = pages.find((p) => p.slug === slug);
    const nodeIds = new Set(nodes.map((n: GraphNode) => n.id));

    // Internal edges only
    const edges = graphData.edges.filter(
      (e: GraphEdge) => nodeIds.has(e.source) && nodeIds.has(e.target),
    );

    // Source count from page or from nodes
    const sourceRefs = new Set<string>();
    for (const n of nodes) {
      if (n.sourceRefs) for (const ref of n.sourceRefs) sourceRefs.add(ref);
    }

    communities.push({
      id: communityId,
      slug,
      title:
        page?.title ||
        nodes.sort((a: GraphNode, b: GraphNode) => {
          const aDeg = graphData.edges.filter(
            (e: GraphEdge) => e.source === a.id || e.target === a.id,
          ).length;
          const bDeg = graphData.edges.filter(
            (e: GraphEdge) => e.source === b.id || e.target === b.id,
          ).length;
          return bDeg - aDeg;
        })[0]?.label ||
        `Community ${communityId}`,
      page,
      nodes: nodes.map((n: GraphNode) => ({
        id: n.id,
        label: n.label,
        type: n.type,
        summary: n.summary,
        sourceRefs: n.sourceRefs || [],
      })),
      edges: edges.map((e: GraphEdge) => ({
        source: e.source,
        target: e.target,
        relation: e.relation,
        confidence: e.confidence,
        weight: e.weight,
      })),
      sourceCount: page?.sourceRefs.length || sourceRefs.size,
    });
  }

  // Sort by source count descending
  communities.sort((a, b) => b.sourceCount - a.sourceCount || a.title.localeCompare(b.title));
  return communities;
}

export function WikiPanel({
  notebookId,
  initialPages = [],
  sources = [],
  graphData = null,
  onSourceClick,
  navigateToSlug,
  onNavigateComplete,
  onPageSelectionChange,
}: WikiPanelProps) {
  // Build source ID → title map for resolving [source:id] references
  const sourceMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sources) {
      map[s.id] = s.title;
    }
    return map;
  }, [sources]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  // Top panel height as percentage (0-100), graph gets the rest
  const [topPercent, setTopPercent] = useState(55);
  const [isGraphFullscreen, setIsGraphFullscreen] = useState(false);
  const [isRefreshingGraph, setIsRefreshingGraph] = useState(false);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const handleRefreshGraph = useCallback(async () => {
    setIsRefreshingGraph(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["notebook-graph", notebookId] }),
        queryClient.invalidateQueries({ queryKey: ["wiki-pages", notebookId] }),
      ]);
    } finally {
      setIsRefreshingGraph(false);
    }
  }, [notebookId, queryClient]);

  const handleDividerDrag = useCallback((delta: number) => {
    const container = splitContainerRef.current;
    if (!container) return;
    const totalHeight = container.clientHeight;
    if (totalHeight === 0) return;
    const deltaPercent = (delta / totalHeight) * 100;
    setTopPercent((prev) => Math.min(85, Math.max(15, prev + deltaPercent)));
  }, []);

  const { data: pages = initialPages } = useQuery<WikiPage[]>({
    queryKey: ["wiki-pages", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki`);
      if (!res.ok) throw new Error("Failed to fetch wiki pages");
      const json = await res.json();
      return json.pages || [];
    },
    initialData: initialPages,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  // Fetch graph data via React Query so it auto-refreshes after wiki ingest
  const { data: liveGraphData = graphData } = useQuery<GraphData | null>({
    queryKey: ["notebook-graph", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/graph`);
      if (!res.ok) throw new Error("Failed to fetch graph");
      const json = await res.json();
      return json.graphData || null;
    },
    initialData: graphData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      // Poll while graph is empty but pages exist (ingest in progress)
      const graph = query.state.data;
      const hasNodes = graph?.nodes && graph.nodes.length > 0;
      return !hasNodes && pages.length > 0 ? 10000 : false;
    },
  });

  // Build community tree from pages + graph data
  const communities = useMemo(() => buildCommunities(pages, liveGraphData), [pages, liveGraphData]);
  const totalEntities = useMemo(() => liveGraphData?.nodes?.length || 0, [liveGraphData]);

  // Build entity ID → community slug lookup from graph data
  // So clicking [[rope]] navigates to community-0 (where rope lives)
  const entityToCommunity = useMemo(() => {
    const map: Record<string, string> = {};
    if (liveGraphData?.nodes) {
      for (const node of liveGraphData.nodes) {
        if (node.community !== undefined) {
          map[node.id] = `community-${node.community}`;
        }
      }
    }
    return map;
  }, [liveGraphData]);

  // Resolve a slug: if it's a page slug, use it directly; if it's an entity ID, find its community page
  const pageSlugs = useMemo(() => new Set(pages.map((p) => p.slug)), [pages]);

  const resolveSlug = (slug: string): string => {
    if (pageSlugs.has(slug)) return slug;
    return entityToCommunity[slug] || slug;
  };

  // Handle external navigation (e.g. from chat [[wiki-link]] clicks) via the
  // setState-during-render pattern. Using a useEffect here would trip
  // react-hooks/set-state-in-effect.
  const [lastNavigateSlug, setLastNavigateSlug] = useState(navigateToSlug);
  if (navigateToSlug !== lastNavigateSlug) {
    setLastNavigateSlug(navigateToSlug);
    if (navigateToSlug) {
      setSelectedSlug(resolveSlug(navigateToSlug));
      onNavigateComplete?.();
    }
  }

  // Notify parent so the right rail can widen on page open and restore on close.
  useEffect(() => {
    onPageSelectionChange?.(selectedSlug !== null);
  }, [selectedSlug, onPageSelectionChange]);

  if (selectedSlug) {
    return (
      <WikiPageView
        notebookId={notebookId}
        slug={selectedSlug}
        sourceMap={sourceMap}
        onBack={() => setSelectedSlug(null)}
        onNavigate={(slug) => setSelectedSlug(resolveSlug(slug))}
        onSourceClick={onSourceClick}
      />
    );
  }

  return (
    <div ref={splitContainerRef} className="flex h-full flex-col bg-sf-bg">
      {/* === TOP: Pages List === */}
      <div
        data-guide="wiki-pages-section"
        className="flex flex-col overflow-hidden"
        style={{ height: `${topPercent}%` }}
      >
        <div className="px-5 py-3 flex items-center justify-between border-b border-sf-line bg-sf-surface shrink-0">
          <div className="flex items-baseline gap-3 min-w-0">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-sf-ink-4 whitespace-nowrap">
              Knowledge Base
            </span>
            <span className="text-[11px] font-mono tabular-nums text-sf-ink-4 whitespace-nowrap">
              {communities.length} topics · {totalEntities} entities
            </span>
          </div>
          <HealthCheckButton notebookId={notebookId} />
        </div>

        <div className="flex-1 overflow-y-auto bg-sf-bg">
          {communities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Lightbulb className="h-6 w-6 text-sf-ink-4" />
              <p className="mt-2 text-xs text-sf-ink-4">Add sources to discover knowledge</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 p-3">
              {communities.map((community) => (
                <CommunityItem
                  key={community.slug}
                  community={community}
                  graphData={liveGraphData}
                  onSelectEntity={(nodeId) => setSelectedSlug(resolveSlug(nodeId))}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === DIVIDER === */}
      <ResizableDivider
        direction="horizontal"
        onDrag={handleDividerDrag}
        onDoubleClick={() => setTopPercent(55)}
      />

      {/* === BOTTOM: Graph === */}
      <div
        data-guide="wiki-graph-section"
        className="flex flex-col overflow-hidden bg-sf-surface"
        style={{ height: `${100 - topPercent}%` }}
      >
        <div className="px-5 py-3 border-b border-sf-line flex items-center justify-between shrink-0">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-sf-ink-4">
            Relationship Graph
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-[6px] hover:bg-sf-bg-alt"
              onClick={handleRefreshGraph}
              disabled={isRefreshingGraph}
              title="Refresh graph"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-sf-ink-3 ${isRefreshingGraph ? "animate-spin" : ""}`}
              />
            </Button>
            <Button
              data-guide="wiki-graph-expand"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-[6px] hover:bg-sf-bg-alt"
              onClick={() => setIsGraphFullscreen(true)}
              title="Expand graph"
            >
              <Maximize2 className="h-3.5 w-3.5 text-sf-ink-3" />
            </Button>
          </div>
        </div>
        <div className="flex-1 bg-sf-surface-muted">
          <GraphView
            graphData={liveGraphData}
            onNodeClick={(slug) => setSelectedSlug(resolveSlug(slug))}
          />
        </div>
      </div>

      {/* === Fullscreen Graph Dialog === */}
      <Dialog open={isGraphFullscreen} onOpenChange={setIsGraphFullscreen}>
        <DialogContent
          showCloseButton={false}
          className="w-[95vw] max-w-[95vw] h-[90vh] p-0 sm:max-w-[95vw] gap-0 flex flex-col"
        >
          <DialogTitle className="sr-only">Knowledge Graph</DialogTitle>
          <div className="px-5 py-3 border-b border-sf-line flex items-center justify-between shrink-0 bg-sf-surface">
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-sf-ink-4">
              Relationship Graph
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-[6px] hover:bg-sf-bg-alt"
                onClick={handleRefreshGraph}
                disabled={isRefreshingGraph}
                title="Refresh graph"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-sf-ink-3 ${isRefreshingGraph ? "animate-spin" : ""}`}
                />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 rounded-[6px] text-sf-ink-3 hover:bg-sf-bg-alt hover:text-sf-ink"
                onClick={() => setIsGraphFullscreen(false)}
                title="Close"
                aria-label="Close"
              >
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <GraphView
              graphData={liveGraphData}
              onNodeClick={(slug) => {
                setIsGraphFullscreen(false);
                setSelectedSlug(resolveSlug(slug));
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const CommunityItem = memo(function CommunityItem({
  community,
  graphData,
  onSelectEntity,
}: {
  community: CommunityInfo;
  graphData: GraphData | null;
  onSelectEntity: (nodeId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const nodeMap = useMemo(() => {
    const map = new Map<string, string>();
    if (graphData?.nodes) {
      for (const n of graphData.nodes) map.set(n.id, n.label);
    }
    return map;
  }, [graphData]);

  return (
    <div
      className={`rounded-[10px] border transition-colors overflow-hidden ${
        expanded
          ? "bg-sf-accent border-sf-accent text-white"
          : "bg-sf-surface border-sf-line hover:border-sf-line-strong text-sf-ink"
      }`}
    >
      {/* Community header */}
      <button
        className="w-full text-left px-3.5 py-2.5 flex justify-between items-center cursor-pointer"
        onClick={() => {
          setExpanded(!expanded);
        }}
      >
        <div className="min-w-0 flex-1 pr-3">
          <h4
            className={`text-[13.5px] font-bold tracking-tight truncate leading-tight ${
              expanded ? "text-white" : "text-sf-ink"
            }`}
          >
            {community.title}
          </h4>
          <p
            className={`text-[11px] leading-tight mt-0.5 font-mono tabular-nums ${
              expanded ? "text-white/75" : "text-sf-ink-4"
            }`}
          >
            {community.sourceCount > 0 ? `${community.sourceCount} sources` : "No sources yet"}
          </p>
        </div>
        <div
          className={`flex gap-2.5 text-[10px] font-bold tabular-nums shrink-0 ${
            expanded ? "text-white/70" : "text-sf-ink-4"
          }`}
        >
          <div className="flex items-baseline gap-1">
            <span className="text-[13px]">{community.nodes.length}</span>
            <span className="text-[9px] tracking-[0.12em]">ENT</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-[13px]">{community.edges.length}</span>
            <span className="text-[9px] tracking-[0.12em]">REL</span>
          </div>
        </div>
      </button>

      {/* Expanded: entities + relationships (on solid blue card) */}
      {expanded && (
        <div className="px-3.5 pb-3.5 space-y-3.5">
          {/* Entities */}
          {community.nodes.length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-[0.18em] block mb-2">
                Entities
              </span>
              <div className="flex flex-col gap-1">
                {community.nodes.map((node) => {
                  const sourceRefCount = node.sourceRefs?.length ?? 0;
                  return (
                    <button
                      key={node.id}
                      className="w-full text-left flex items-center gap-2 px-2.5 py-2 bg-white/10 hover:bg-white/15 transition-colors rounded-[8px] border border-white/10"
                      onClick={() => onSelectEntity(node.id)}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-[13px] font-semibold truncate text-white">
                          {node.label}
                        </span>
                        <span className="text-[9px] bg-white/20 text-white px-1.5 py-px font-bold rounded-[3px] uppercase tracking-[0.08em]">
                          {node.type}
                        </span>
                      </div>
                      {sourceRefCount > 0 && (
                        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono tabular-nums text-white/70">
                          <span className="w-1.5 h-1.5 rounded-full bg-white/70" aria-hidden />
                          {sourceRefCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Relationships */}
          {community.edges.length > 0 && (
            <div>
              <span className="text-[10px] font-bold text-white/70 uppercase tracking-[0.18em] block mb-2">
                Relationships
              </span>
              <div className="flex flex-col gap-1">
                {community.edges.map((edge, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-white/10 hover:bg-white/15 transition-colors rounded-[6px]"
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      <span className="font-semibold text-white truncate">
                        {nodeMap.get(edge.source) || edge.source}
                      </span>
                      <span className="text-[9px] font-bold text-white/90 px-2 py-0.5 rounded-full uppercase bg-white/15 whitespace-nowrap tracking-[0.08em]">
                        {edge.relation.replace(/_/g, " ")}
                      </span>
                      <span className="font-semibold text-white truncate">
                        {nodeMap.get(edge.target) || edge.target}
                      </span>
                    </div>
                    <span
                      className="text-[10px] shrink-0 text-white/70 ml-2 font-mono"
                      title={edge.confidence}
                    >
                      {CONFIDENCE_LABELS[edge.confidence] || ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function WikiPageView({
  notebookId,
  slug,
  sourceMap,
  onBack,
  onNavigate,
  onSourceClick,
}: {
  notebookId: string;
  slug: string;
  sourceMap: Record<string, string>;
  onBack: () => void;
  onNavigate: (slug: string) => void;
  onSourceClick?: (sourceId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();

  const {
    data: page,
    isLoading,
    isError,
  } = useQuery<WikiPage & { content: string }>({
    queryKey: ["wiki-page", notebookId, slug],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`);
      if (!res.ok) throw new Error("Page not found");
      return res.json();
    },
    retry: false,
  });

  const handleStartEdit = () => {
    if (page?.content) {
      setEditContent(page.content);
      setIsEditing(true);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent }),
      });
      await queryClient.invalidateQueries({ queryKey: ["wiki-page", notebookId, slug] });
      await queryClient.invalidateQueries({ queryKey: ["wiki-pages", notebookId] });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to save wiki page:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Resolve source IDs to titles for display. Extracting sourceRefs into its
  // own constant keeps the useMemo dep list stable (react-compiler can't
  // preserve memoization with an optional-chain expression).
  const sourceRefs = page?.sourceRefs;
  const sourceTitles = useMemo(() => {
    if (!sourceRefs) return [];
    return sourceRefs.map((id) => ({
      id,
      title: sourceMap[id] || id.slice(0, 8) + "...",
    }));
  }, [sourceRefs, sourceMap]);

  return (
    <div className="flex h-full flex-col bg-sf-surface">
      <div className="px-5 pt-4 pb-3 border-b border-sf-line shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-[6px] text-sf-ink-3 hover:bg-sf-bg-alt hover:text-sf-ink transition-colors"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-sm font-bold text-sf-ink truncate flex-1 min-w-0">
            {page?.title || slug}
          </h2>
          {page && !isEditing && page.pageType !== "INDEX" && page.pageType !== "LOG" && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 rounded-[6px] text-sf-ink-3 hover:bg-sf-bg-alt hover:text-sf-ink"
              onClick={handleStartEdit}
              title="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isEditing && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-3 text-xs rounded-[6px]"
                onClick={() => setIsEditing(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 text-xs rounded-[6px] bg-sf-accent hover:bg-sf-accent-ink text-white"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
        {sourceTitles.length > 0 && (
          <p className="mt-1 ml-9 text-[11px] font-mono tabular-nums text-sf-ink-4">
            {sourceTitles.length} source{sourceTitles.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-sf-ink-4">Loading…</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <p className="text-sm text-sf-ink-3">Page &quot;{slug}&quot; not found</p>
            <p className="text-xs text-sf-ink-4 mt-1">
              This entity exists in the graph but doesn&apos;t have its own page yet
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-3 text-xs rounded-[6px]"
              onClick={onBack}
            >
              Go back
            </Button>
          </div>
        ) : isEditing ? (
          <textarea
            className="w-full h-full min-h-64 resize-none bg-transparent text-sm font-mono leading-relaxed text-sf-ink outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        ) : page?.content ? (
          <>
            <WikiMarkdown
              content={page.content}
              onNavigate={onNavigate}
              onSourceClick={onSourceClick}
            />
            {sourceTitles.length > 0 && (
              <div className="mt-6 pt-4 border-t border-sf-line">
                <h4 className="text-[11px] font-bold uppercase tracking-[0.18em] text-sf-ink-4 mb-3">
                  Related Sources
                </h4>
                <div className="flex flex-col gap-1.5">
                  {sourceTitles.map(({ id, title }) => (
                    <button
                      key={id}
                      className="flex items-center gap-2 w-full text-left rounded-[8px] px-3 py-2 text-xs bg-sf-surface hover:bg-sf-bg-alt transition-colors border border-sf-line"
                      onClick={() => onSourceClick?.(id)}
                    >
                      <FileText className="h-3.5 w-3.5 text-sf-ink-4 shrink-0" />
                      <span className="truncate text-sf-ink-2 font-medium">{title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-sf-ink-4">No content</p>
        )}
      </div>
    </div>
  );
}

function WikiMarkdown({
  content,
  onNavigate,
  onSourceClick,
}: {
  content: string;
  onNavigate: (slug: string) => void;
  onSourceClick?: (sourceId: string) => void;
}) {
  // Replace [[slug]] with clickable wiki links
  let processed = content.replace(
    /\[\[([a-zA-Z0-9_-]+)\]\]/g,
    (_, slug) => `<wiki-link data-slug="${slug}">${slug.replace(/-/g, " ")}</wiki-link>`,
  );

  // Strip LLM-generated [source:id] references — accurate sources shown in "Related Sources" section instead
  processed = processed.replace(/\[source:[a-zA-Z0-9_-]+\]/g, "");
  // Also strip any "References" section the LLM may have appended
  processed = processed.replace(/\n##?\s*References?\s*\n[\s\S]*$/i, "").trimEnd();

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Handle wiki link clicks
        if (target.tagName === "WIKI-LINK" || target.closest("wiki-link")) {
          const el = target.tagName === "WIKI-LINK" ? target : target.closest("wiki-link")!;
          const slug = el.getAttribute("data-slug");
          if (slug) {
            e.preventDefault();
            onNavigate(slug);
          }
        }
        // Handle source ref clicks
        if (target.tagName === "SOURCE-REF" || target.closest("source-ref")) {
          const el = target.tagName === "SOURCE-REF" ? target : target.closest("source-ref")!;
          const sourceId = el.getAttribute("data-source-id");
          if (sourceId && onSourceClick) {
            e.preventDefault();
            onSourceClick(sourceId);
          }
        }
      }}
    >
      <Markdown>{processed}</Markdown>
      <style>{`
        wiki-link {
          color: var(--color-accent-primary, #3b82f6);
          cursor: pointer;
          text-decoration: underline;
          text-decoration-style: dotted;
          text-underline-offset: 2px;
        }
        wiki-link:hover {
          text-decoration-style: solid;
        }
        source-ref {
          display: inline;
          font-size: 0.75rem;
          color: var(--color-muted-foreground, #6b7280);
          background: var(--color-accent, #f3f4f6);
          border-radius: 4px;
          padding: 1px 4px;
          cursor: pointer;
          opacity: 0.8;
        }
      `}</style>
    </div>
  );
}
