"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition, memo } from "react";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import { FileText, Plus, Loader2, ArrowLeft, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { deleteSource } from "@/lib/actions/sources";
import { AddSourceDialog } from "@/components/deepdive/sources/add-source-dialog";
import { IngestReport } from "./ingest-report";
import type { Source } from "@prisma/client";
import { Markdown } from "@/components/ui/markdown";
import { SourceHtmlView } from "./source-html-view";
import { useCollapsiblePanel } from "@/components/ui/collapsible-panel";
import type { TocHeading } from "@/lib/utils/toc-extractor";

interface SourceMetadata {
  toc?: TocHeading[];
  [key: string]: unknown;
}

interface SourcesPanelProps {
  notebookId: string;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source | null) => void;
}

export function SourcesPanel({
  notebookId,
  sources,
  selectedSource,
  onSelectSource,
}: SourcesPanelProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const prevWikiStatusRef = useRef<Map<string, string>>(new Map());

  const { data: liveSources = sources } = useQuery<Source[]>({
    queryKey: ["notebook-sources", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/status`);
      if (!res.ok) {
        throw new Error("Failed to fetch source status");
      }
      const json = (await res.json()) as { sources: Source[] };
      return json.sources || sources;
    },
    initialData: sources,
    refetchInterval: (query) => {
      const list = query.state.data || sources;
      const hasProcessing = list.some((sourceItem) => {
        if (sourceItem.status === "PROCESSING" || sourceItem.status === "UPLOADING") return true;
        const meta = sourceItem.metadata as Record<string, unknown> | null;
        const ws = meta?.wikiStatus as string | undefined;
        return ws && ws !== "done" && ws !== "failed";
      });
      return hasProcessing ? 5000 : false;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // When any source's wikiStatus transitions to "done", invalidate wiki + graph queries
  useEffect(() => {
    const prev = prevWikiStatusRef.current;
    let shouldInvalidate = false;

    for (const src of liveSources) {
      const meta = src.metadata as Record<string, unknown> | null;
      const ws = (meta?.wikiStatus as string) || "";
      const prevWs = prev.get(src.id) || "";
      if (ws === "done" && prevWs !== "done") {
        shouldInvalidate = true;
      }
      prev.set(src.id, ws);
    }

    if (shouldInvalidate) {
      queryClient.invalidateQueries({ queryKey: ["wiki-pages", notebookId] });
      queryClient.invalidateQueries({ queryKey: ["notebook-graph", notebookId] });
    }
  }, [liveSources, notebookId, queryClient]);

  // Show source content view when a source is selected
  if (selectedSource) {
    return (
      <SourceContentView
        key={selectedSource.id}
        source={selectedSource}
        onBack={() => onSelectSource(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 pt-3 pb-1 flex items-center justify-between">
        <span className="px-3 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono text-foreground">
          Sources
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 rounded-[4px] hover:bg-accent/80 transition-colors"
          onClick={() => setIsDialogOpen(true)}
          title="Add Source"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-6">
        {liveSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No sources yet</p>
            <p className="text-xs text-muted-foreground">Add documents or webpages</p>
          </div>
        ) : (
          <>
            {liveSources
              .filter((s) => {
                const meta = s.metadata as Record<string, unknown> | null;
                return meta?.extractionReport && meta?.wikiStatus === "done";
              })
              .slice(0, 1)
              .map((s) => {
                const meta = s.metadata as Record<string, unknown>;
                const report = meta.extractionReport as {
                  nodes: { id: string; label: string; type: string }[];
                  edges: { source: string; target: string; relation: string }[];
                  crossRefs: string[];
                };
                return (
                  <IngestReport
                    key={`report-${s.id}`}
                    sourceTitle={s.title}
                    report={report}
                    onDismiss={() => {
                      fetch(`/api/notebooks/${s.notebookId}/sources/${s.id}/dismiss-report`, {
                        method: "POST",
                      }).catch(() => {});
                    }}
                  />
                );
              })}
            <div className="space-y-2">
              {liveSources.map((source) => (
                <SourceItem
                  key={source.id}
                  source={source}
                  onSelect={() => onSelectSource(source)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Add Source Dialog */}
      <AddSourceDialog notebookId={notebookId} open={isDialogOpen} onOpenChange={setIsDialogOpen} />
    </div>
  );
}

const WIKI_STATUS_LABELS: Record<string, string> = {
  starting: "Wiki: starting...",
  extracting: "Wiki: extracting graph...",
  merging: "Wiki: merging...",
  clustering: "Wiki: clustering...",
  generating: "Wiki: generating pages...",
};

function WikiIngestStatus({ metadata }: { metadata: Record<string, unknown> | null }) {
  const wikiStatus = metadata?.wikiStatus as string | undefined;
  if (!wikiStatus || wikiStatus === "done") return null;
  if (wikiStatus === "failed") {
    return <p className="mt-1 text-[10px] text-red-500">Wiki ingest failed</p>;
  }
  return (
    <div className="mt-1 flex items-center gap-1.5 text-[10px] text-blue-600 dark:text-blue-400">
      <Loader2 className="h-2.5 w-2.5 animate-spin" />
      {WIKI_STATUS_LABELS[wikiStatus] || `Wiki: ${wikiStatus}`}
    </div>
  );
}

const SourceItem = memo(function SourceItem({
  source,
  onSelect,
}: {
  source: Source;
  onSelect: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const relativeTime = useRelativeTime(new Date(source.createdAt));
  const queryClient = useQueryClient();
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", source.notebookId],
        (current) => (current || []).filter((item) => item.id !== source.id),
      );
      await deleteSource(source.id);
      await queryClient.invalidateQueries({
        queryKey: ["notebook-sources", source.notebookId],
      });
    });
  };

  return (
    <div
      className={`group relative cursor-pointer rounded-[4px] px-4 py-3 transition-all duration-200 bg-surface-elevated hover:bg-surface-hover border-2 border-divider border-l-4 border-l-divider dark:border-0 dark:border-l-4 dark:border-l-accent-red ${
        isPending ? "opacity-50" : ""
      }`}
      onClick={onSelect}
    >
      {/* Delete Badge - hover visible */}
      <button
        className="absolute -top-2 -right-2 h-4.5 w-4.5 rounded-full bg-accent-red flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => {
          e.stopPropagation();
          handleDelete(e);
        }}
        title="Delete"
      >
        <X className="h-3 w-3 text-white" />
      </button>

      <div className="min-w-0 flex-1">
        <span className="truncate block text-[13px] font-semibold dark:font-medium leading-tight">
          {source.title}
        </span>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span>{source.sourceType === "DOCUMENT" ? "PDF" : "Web"}</span>
          <span>•</span>
          {relativeTime && <span suppressHydrationWarning>{relativeTime}</span>}
        </div>
        {source.status === "PROCESSING" && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2 py-1 dark:bg-amber-900/50">
              <Loader2 className="h-3 w-3 animate-spin" />
              Processing...
            </span>
          </div>
        )}
        {source.status === "PARTIAL" && (
          <p className="mt-1 text-[11px] text-yellow-600 dark:text-yellow-400">Preview only</p>
        )}
        {source.status === "FAILED" && source.errorMessage && (
          <p className="mt-1 text-xs text-destructive">{source.errorMessage}</p>
        )}
        <WikiIngestStatus metadata={source.metadata as Record<string, unknown> | null} />
      </div>
    </div>
  );
});

// Source content viewer - shows title and markdown content with TOC button
function SourceContentView({ source, onBack }: { source: Source; onBack: () => void }) {
  const [showToc, setShowToc] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const panelContext = useCollapsiblePanel();
  const isAnimationComplete = panelContext?.isAnimationComplete ?? true;

  const rawContent = source.content || "No content available";

  // Rewrite any remaining relative image paths to use the fallback resolver.
  // Images already rewritten to /api/images/{id} are left untouched.
  const markdownContent = useMemo(() => {
    return rawContent.replace(
      /!\[([^\]]*)\]\((?!\/api\/|https?:\/\/)([^)]+)\)/g,
      `![$1](/api/images/by-source/${source.id}/$2)`,
    );
  }, [rawContent, source.id]);

  const [deferredContent, setDeferredContent] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isAnimationComplete) {
      startTransition(() => {
        setDeferredContent(markdownContent);
      });
    } else {
      queueMicrotask(() => setDeferredContent(null));
    }
  }, [isAnimationComplete, markdownContent]);

  // Reset scroll when source changes
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [source.id]);

  const computeHeadings = useCallback((content: string) => {
    const extracted: { id: string; text: string; level: number }[] = [];
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        const id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-");
        extracted.push({ id, text, level });
      }
    }
    return extracted;
  }, []);

  // Use stored TOC from metadata if available, else compute from content
  const storedToc = useMemo(() => {
    const meta = source.metadata as SourceMetadata | null;
    if (meta?.toc && Array.isArray(meta.toc)) {
      return meta.toc.map((h) => ({
        id: h.text
          .toLowerCase()
          .replace(/[^\w\s-]/g, "")
          .replace(/\s+/g, "-"),
        text: h.text,
        level: h.level,
      }));
    }
    return null;
  }, [source.metadata]);

  // Derive headings: use stored TOC if available, otherwise compute from content
  const headings = useMemo(
    () => storedToc ?? computeHeadings(markdownContent),
    [storedToc, computeHeadings, markdownContent],
  );

  const scrollToHeading = (headingText: string) => {
    const container = scrollRef.current;
    if (!container) return;

    // Find all headings in the container and match by text content
    const headings = container.querySelectorAll("h1, h2, h3");
    let targetElement: Element | null = null;

    for (const heading of headings) {
      if (heading.textContent?.trim() === headingText.trim()) {
        targetElement = heading;
        break;
      }
    }

    if (targetElement) {
      const containerRect = container.getBoundingClientRect();
      const elementRect = targetElement.getBoundingClientRect();
      const relativeTop = elementRect.top - containerRect.top + container.scrollTop;

      container.scrollTo({
        top: relativeTop - 16,
        behavior: "smooth",
      });
      setShowToc(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      {/* Header with back button and TOC button */}
      <div className="flex items-center gap-2 border-b border-divider px-4 py-2">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{source.title}</h2>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {source.sourceType === "WEBPAGE" && source.url && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate hover:underline"
              >
                {source.url}
              </a>
            )}
          </div>
        </div>

        {/* TOC Toggle Button */}
        {headings.length > 0 && (
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowToc(!showToc)}
            >
              <FileText className="h-3.5 w-3.5" />
              TOC
            </Button>

            {/* TOC Dropdown */}
            {showToc && (
              <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-background shadow-lg">
                <div className="p-3">
                  <h3 className="mb-2 text-xs font-semibold">Table of Contents</h3>
                  <nav className="max-h-96 space-y-1 overflow-y-auto">
                    {headings.map((heading, index) => (
                      <button
                        key={index}
                        onClick={() => scrollToHeading(heading.text)}
                        className={`block w-full text-left text-xs hover:text-accent-red transition-colors ${
                          heading.level === 1 ? "font-medium" : ""
                        } ${heading.level === 2 ? "pl-2" : ""} ${
                          heading.level === 3 ? "pl-4 text-muted-foreground" : ""
                        }`}
                      >
                        {heading.text}
                      </button>
                    ))}
                  </nav>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
        style={{ contain: "content" }}
      >
        {deferredContent ? (
          source.contentHtml ? (
            <SourceHtmlView
              html={source.contentHtml}
              sourceId={source.id}
              className="space-y-3 text-[14px] leading-5"
            />
          ) : (
            <Markdown className="space-y-3 text-[14px] leading-5 text-muted-foreground">
              {deferredContent}
            </Markdown>
          )
        ) : (
          <div className="space-y-4" aria-hidden>
            <div className="h-5 w-2/3 rounded bg-muted" />
            <div className="space-y-2.5">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-4/5 rounded bg-muted" />
            </div>
            <div className="h-32 w-full rounded bg-muted" />
            <div className="space-y-2.5">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-3/4 rounded bg-muted" />
            </div>
            <div className="space-y-2.5">
              <div className="h-3.5 w-full rounded bg-muted" />
              <div className="h-3.5 w-5/6 rounded bg-muted" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
