"use client";

import { useState, useMemo, useCallback, useRef, useEffect, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileText, GitCompare, Lightbulb, MessageSquare, Pencil, Users, ScrollText, ChevronRight, ChevronDown, Wrench, Database, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
import { ResizableDivider } from "@/components/ui/resizable-divider";
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

interface WikiPanelProps {
  notebookId: string;
  initialPages?: WikiPage[];
  sources?: SourceInfo[];
  graphData?: { nodes: any[]; edges: any[] } | null;
  onSourceClick?: (sourceId: string) => void;
  /** Set externally (e.g. from chat wiki links) to navigate to a page */
  navigateToSlug?: string | null;
  onNavigateComplete?: () => void;
}

const PAGE_TYPE_ICONS: Record<string, typeof FileText> = {
  ENTITY: Users,
  CONCEPT: Lightbulb,
  SUMMARY: FileText,
  COMPARISON: GitCompare,
  ARTICLE: MessageSquare,
  INDEX: BookOpen,
  LOG: ScrollText,
};

const ENTITY_TYPE_ICONS: Record<string, typeof FileText> = {
  entity: Users,
  concept: Lightbulb,
  method: Wrench,
  person: User,
  dataset: Database,
  tool: Wrench,
};

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

function buildCommunities(
  pages: WikiPage[],
  graphData: { nodes: any[]; edges: any[] } | null,
): CommunityInfo[] {
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
  const communityNodes = new Map<number, typeof graphData.nodes>();
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
    const nodeIds = new Set(nodes.map((n: any) => n.id));

    // Internal edges only
    const edges = graphData.edges.filter(
      (e: any) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );

    // Source count from page or from nodes
    const sourceRefs = new Set<string>();
    for (const n of nodes) {
      if (n.sourceRefs) for (const ref of n.sourceRefs) sourceRefs.add(ref);
    }

    communities.push({
      id: communityId,
      slug,
      title: page?.title || nodes.sort((a: any, b: any) => {
        const aDeg = graphData.edges.filter((e: any) => e.source === a.id || e.target === a.id).length;
        const bDeg = graphData.edges.filter((e: any) => e.source === b.id || e.target === b.id).length;
        return bDeg - aDeg;
      })[0]?.label || `Community ${communityId}`,
      page,
      nodes: nodes.map((n: any) => ({ id: n.id, label: n.label, type: n.type, summary: n.summary, sourceRefs: n.sourceRefs || [] })),
      edges: edges.map((e: any) => ({ source: e.source, target: e.target, relation: e.relation, confidence: e.confidence, weight: e.weight })),
      sourceCount: page?.sourceRefs.length || sourceRefs.size,
    });
  }

  // Sort by source count descending
  communities.sort((a, b) => b.sourceCount - a.sourceCount || a.title.localeCompare(b.title));
  return communities;
}

export function WikiPanel({ notebookId, initialPages = [], sources = [], graphData = null, onSourceClick, navigateToSlug, onNavigateComplete }: WikiPanelProps) {
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
  const splitContainerRef = useRef<HTMLDivElement>(null);

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

  // Build community tree from pages + graph data
  const communities = useMemo(() => buildCommunities(pages, graphData), [pages, graphData]);
  const totalEntities = useMemo(() => graphData?.nodes?.length || 0, [graphData]);

  // Build entity ID → community slug lookup from graph data
  // So clicking [[rope]] navigates to community-0 (where rope lives)
  const entityToCommunity = useMemo(() => {
    const map: Record<string, string> = {};
    if (graphData?.nodes) {
      for (const node of graphData.nodes) {
        if (node.community !== undefined) {
          map[node.id] = `community-${node.community}`;
        }
      }
    }
    return map;
  }, [graphData]);

  // Resolve a slug: if it's a page slug, use it directly; if it's an entity ID, find its community page
  const pageSlugs = useMemo(() => new Set(pages.map((p) => p.slug)), [pages]);

  const resolveSlug = (slug: string): string => {
    if (pageSlugs.has(slug)) return slug;
    return entityToCommunity[slug] || slug;
  };

  // Handle external navigation (e.g. from chat [[wiki-link]] clicks)
  useEffect(() => {
    if (navigateToSlug) {
      setSelectedSlug(resolveSlug(navigateToSlug));
      onNavigateComplete?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateToSlug]);

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
    <div ref={splitContainerRef} className="flex h-full flex-col">
      {/* === TOP: Pages List === */}
      <div className="flex flex-col overflow-hidden" style={{ height: `${topPercent}%` }}>
        <div className="px-6 pt-3 pb-2 flex items-center justify-between relative shrink-0">
          <span className="text-[11px] font-semibold tracking-[2px] uppercase font-mono text-foreground">Knowledge Base</span>
          <div className="flex items-center gap-1">
            <HealthCheckButton notebookId={notebookId} />
            <span className="text-[11px] text-muted-foreground">
              {communities.length} topics · {totalEntities} entities
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {communities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-center">
              <Lightbulb className="h-6 w-6 text-muted-foreground/50" />
              <p className="mt-2 text-xs text-muted-foreground">Add sources to discover knowledge</p>
            </div>
          ) : (
            <div className="space-y-1">
              {communities.map((community) => (
                <CommunityItem
                  key={community.slug}
                  community={community}
                  graphData={graphData}
                  onSelectPage={() => setSelectedSlug(community.slug)}
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
      <div className="flex flex-col overflow-hidden" style={{ height: `${100 - topPercent}%` }}>
        <div className="px-6 pt-1 pb-1 shrink-0">
          <span className="text-[10px] font-semibold tracking-[2px] uppercase font-mono text-muted-foreground">Graph</span>
        </div>
        <div className="flex-1">
          <GraphView graphData={graphData} onNodeClick={(slug) => setSelectedSlug(resolveSlug(slug))} />
        </div>
      </div>
    </div>
  );
}

const CommunityItem = memo(function CommunityItem({
  community,
  graphData,
  onSelectPage,
  onSelectEntity,
}: {
  community: CommunityInfo;
  graphData: { nodes: any[]; edges: any[] } | null;
  onSelectPage: () => void;
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

  const meta = [
    `${community.nodes.length} entities`,
    `${community.edges.length} relations`,
    community.sourceCount > 0 ? `${community.sourceCount} sources` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-[4px] border border-divider dark:border-0 bg-surface-elevated overflow-hidden">
      {/* Community header */}
      <div className="flex items-center gap-1">
        <button
          className="shrink-0 h-8 w-8 flex items-center justify-center hover:bg-surface-hover transition-colors rounded-[4px]"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          }
        </button>
        <button
          className="flex-1 min-w-0 text-left py-2 pr-3 hover:text-accent-red transition-colors"
          onClick={onSelectPage}
        >
          <span className="truncate text-[13px] font-medium leading-tight block">
            {community.title}
          </span>
          <span className="text-[10px] text-muted-foreground">{meta}</span>
        </button>
      </div>

      {/* Expanded: entities + relationships */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-divider/50">
          {/* Entities */}
          {community.nodes.length > 0 && (
            <div className="mb-2">
              <span className="text-[9px] font-semibold tracking-[1.5px] uppercase text-muted-foreground">Entities</span>
              <div className="mt-1 space-y-0.5">
                {community.nodes.map((node) => {
                  const Icon = ENTITY_TYPE_ICONS[node.type] || FileText;
                  return (
                    <button
                      key={node.id}
                      className="w-full text-left flex items-start gap-2 px-2 py-1.5 rounded-[4px] hover:bg-surface-hover transition-colors"
                      onClick={() => onSelectEntity(node.id)}
                    >
                      <Icon className="h-3 w-3 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-[12px] font-medium block truncate">{node.label}</span>
                        {node.summary && (
                          <span className="text-[10px] text-muted-foreground line-clamp-1">{node.summary}</span>
                        )}
                      </div>
                      <span className="text-[9px] text-muted-foreground shrink-0 mt-0.5">{node.type}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Relationships */}
          {community.edges.length > 0 && (
            <div>
              <span className="text-[9px] font-semibold tracking-[1.5px] uppercase text-muted-foreground">Relationships</span>
              <div className="mt-1 space-y-0.5">
                {community.edges.map((edge, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    <span className="font-medium text-foreground truncate shrink-0 max-w-20">
                      {nodeMap.get(edge.source) || edge.source}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted shrink-0">
                      {edge.relation.replace(/_/g, " ")}
                    </span>
                    <span className="font-medium text-foreground truncate shrink-0 max-w-20">
                      {nodeMap.get(edge.target) || edge.target}
                    </span>
                    <span className="text-[9px] shrink-0" title={edge.confidence}>
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

  const { data: page, isLoading, isError } = useQuery<WikiPage & { content: string }>({
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

  // Resolve source IDs to titles for display
  const sourceTitles = useMemo(() => {
    if (!page?.sourceRefs) return [];
    return page.sourceRefs.map((id) => ({
      id,
      title: sourceMap[id] || id.slice(0, 8) + "...",
    }));
  }, [page?.sourceRefs, sourceMap]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="h-7 w-7 flex items-center justify-center rounded-[4px] hover:bg-accent/80 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h2 className="text-[13px] font-semibold truncate">
            {page?.title || slug}
          </h2>
          {page && !isEditing && page.pageType !== "INDEX" && page.pageType !== "LOG" && (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={handleStartEdit} title="Edit">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {isEditing && (
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setIsEditing(false)}>
                Cancel
              </Button>
              <Button size="sm" className="h-7 px-2 text-xs bg-accent-red hover:bg-accent-red-hover text-white" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          )}
        </div>
        {sourceTitles.length > 0 && (
          <p className="mt-0.5 ml-9 text-[10px] text-muted-foreground">
            {sourceTitles.length} source{sourceTitles.length > 1 ? "s" : ""}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Page &quot;{slug}&quot; not found</p>
            <p className="text-xs text-muted-foreground mt-1">This entity exists in the graph but doesn&apos;t have its own page yet</p>
            <Button variant="ghost" size="sm" className="mt-3 text-xs" onClick={onBack}>Go back</Button>
          </div>
        ) : isEditing ? (
          <textarea
            className="w-full h-full min-h-64 resize-none bg-transparent text-sm font-mono leading-relaxed outline-none"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
          />
        ) : page?.content ? (
          <>
            <WikiMarkdown content={page.content} sourceMap={sourceMap} onNavigate={onNavigate} onSourceClick={onSourceClick} />
            {sourceTitles.length > 0 && (
              <div className="mt-6 pt-4 border-t border-divider">
                <h4 className="text-[10px] font-semibold tracking-[2px] uppercase text-muted-foreground mb-2">
                  Related Sources
                </h4>
                <div className="space-y-1">
                  {sourceTitles.map(({ id, title }) => (
                    <button
                      key={id}
                      className="flex items-center gap-2 w-full text-left rounded-[4px] px-3 py-2 text-[12px] bg-surface-elevated hover:bg-surface-hover transition-colors border border-divider dark:border-0"
                      onClick={() => onSourceClick?.(id)}
                    >
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{title}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">No content</p>
        )}
      </div>
    </div>
  );
}

function WikiMarkdown({
  content,
  sourceMap,
  onNavigate,
  onSourceClick,
}: {
  content: string;
  sourceMap: Record<string, string>;
  onNavigate: (slug: string) => void;
  onSourceClick?: (sourceId: string) => void;
}) {
  // Replace [[slug]] with clickable wiki links
  let processed = content.replace(
    /\[\[([a-zA-Z0-9_-]+)\]\]/g,
    (_, slug) => `<wiki-link data-slug="${slug}">${slug.replace(/-/g, " ")}</wiki-link>`
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
