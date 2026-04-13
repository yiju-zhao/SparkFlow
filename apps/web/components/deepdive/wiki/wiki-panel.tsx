"use client";

import { useState, useMemo, memo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileText, GitCompare, Lightbulb, MessageSquare, Pencil, Users, ScrollText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Markdown } from "@/components/ui/markdown";
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

const PAGE_TYPE_LABELS: Record<string, string> = {
  ENTITY: "Entities",
  CONCEPT: "Concepts",
  SUMMARY: "Summaries",
  COMPARISON: "Comparisons",
  ARTICLE: "Articles",
};

export function WikiPanel({ notebookId, initialPages = [], sources = [], graphData = null, onSourceClick }: WikiPanelProps) {
  // Build source ID → title map for resolving [source:id] references
  const sourceMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const s of sources) {
      map[s.id] = s.title;
    }
    return map;
  }, [sources]);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [view, setView] = useState<"pages" | "graph">("pages");

  const { data: pages = initialPages } = useQuery<WikiPage[]>({
    queryKey: ["wiki-pages", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki`);
      if (!res.ok) throw new Error("Failed to fetch wiki pages");
      const json = await res.json();
      return json.pages || [];
    },
    initialData: initialPages,
    // Auto-refresh every 5s so new pages appear after wiki ingest completes
    refetchInterval: 5000,
  });

  const grouped = useMemo(() => {
    const groups: Record<string, WikiPage[]> = {};
    for (const page of pages) {
      if (page.pageType === "INDEX" || page.pageType === "LOG") continue;
      const type = page.pageType;
      if (!groups[type]) groups[type] = [];
      groups[type].push(page);
    }
    return groups;
  }, [pages]);

  const indexPage = useMemo(() => pages.find((p) => p.slug === "index"), [pages]);

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
    <div className="flex h-full flex-col">
      <div className="px-6 pt-3 pb-3 flex items-center justify-between relative">
        <div className="flex items-center gap-1">
          <button
            className={`px-2 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
              view === "pages"
                ? "text-foreground bg-accent/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("pages")}
          >
            Pages
          </button>
          <button
            className={`px-2 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
              view === "graph"
                ? "text-foreground bg-accent/20"
                : "text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setView("graph")}
          >
            Graph
          </button>
        </div>
        <div className="flex items-center gap-1">
          <HealthCheckButton notebookId={notebookId} />
          <span className="text-[11px] text-muted-foreground">
            {pages.filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG").length} pages
          </span>
        </div>
      </div>

      {view === "graph" ? (
        <div className="flex-1 px-2">
          <GraphView graphData={graphData} onNodeClick={(slug) => setSelectedSlug(resolveSlug(slug))} />
        </div>
      ) : (
        <>
          {indexPage && (
            <div className="px-6 pb-2">
              <button
                className="w-full text-left rounded-[4px] px-4 py-2 text-[13px] font-medium bg-surface-elevated hover:bg-surface-hover transition-colors border border-divider dark:border-0"
                onClick={() => setSelectedSlug("index")}
              >
                <BookOpen className="inline h-3.5 w-3.5 mr-2 text-muted-foreground" />
                Wiki Index
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
            {Object.keys(grouped).length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <BookOpen className="h-8 w-8 text-muted-foreground/50" />
                <p className="mt-2 text-sm text-muted-foreground">Wiki is empty</p>
                <p className="text-xs text-muted-foreground">
                  Add sources to start building knowledge
                </p>
              </div>
            ) : (
              Object.entries(PAGE_TYPE_LABELS).map(([type, label]) => {
                const items = grouped[type];
                if (!items || items.length === 0) return null;
                return (
                  <div key={type} className="mb-4">
                    <h3 className="text-[11px] font-semibold tracking-[2px] text-muted-foreground uppercase mb-2">
                      {label}
                    </h3>
                    <div className="space-y-1.5">
                      {items.map((page) => (
                        <WikiPageItem
                          key={page.id}
                          page={page}
                          onSelect={() => setSelectedSlug(page.slug)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

const WikiPageItem = memo(function WikiPageItem({
  page,
  onSelect,
}: {
  page: WikiPage;
  onSelect: () => void;
}) {
  const Icon = PAGE_TYPE_ICONS[page.pageType] || FileText;

  return (
    <button
      className="w-full text-left group rounded-[4px] px-3 py-2 transition-all duration-200 bg-surface-elevated hover:bg-surface-hover border border-divider dark:border-0"
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="truncate text-[13px] font-medium leading-tight">
          {page.title}
        </span>
      </div>
      {page.sourceRefs.length > 0 && (
        <span className="text-[10px] text-muted-foreground ml-5.5">
          {page.sourceRefs.length} source{page.sourceRefs.length > 1 ? "s" : ""}
        </span>
      )}
    </button>
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
          <div className="mt-1 ml-9 flex flex-wrap gap-1">
            {sourceTitles.map(({ id, title }) => (
              <button
                key={id}
                className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent/20 hover:text-foreground transition-colors cursor-pointer"
                title={`Source: ${title}`}
                onClick={() => onSourceClick?.(id)}
              >
                {title.length > 30 ? title.slice(0, 30) + "..." : title}
              </button>
            ))}
          </div>
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
          <WikiMarkdown content={page.content} sourceMap={sourceMap} onNavigate={onNavigate} onSourceClick={onSourceClick} />
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

  // Replace [source:id] with clickable source refs
  processed = processed.replace(
    /\[source:([a-zA-Z0-9_-]+)\]/g,
    (_, id) => {
      const title = sourceMap[id];
      return title
        ? `<source-ref data-source-id="${id}" title="${title}">📄 ${title.length > 25 ? title.slice(0, 25) + "…" : title}</source-ref>`
        : `<source-ref data-source-id="${id}">📄 ${id.slice(0, 8)}…</source-ref>`;
    }
  );

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
