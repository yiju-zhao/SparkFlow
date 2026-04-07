"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  memo,
} from "react";
import { useRelativeTime } from "@/lib/hooks/use-relative-time";
import {
  FileText,
  Plus,
  Loader2,
  Upload,
  Link,
  ArrowLeft,
  X,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  addWebpageSource,
  uploadDocumentSource,
  deleteSource,
} from "@/lib/actions/sources";
import type { Source as PrismaSource } from "@prisma/client";
import { Markdown } from "@/components/ui/markdown";
import { useCollapsiblePanel } from "@/components/ui/collapsible-panel";
import type { TocHeading } from "@/lib/utils/toc-extractor";

// Extended Source type with the new content field (until Prisma client is regenerated)
type Source = PrismaSource & {
  content?: string | null;
};

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
      const hasProcessing = list.some(
        (sourceItem) =>
          sourceItem.status === "PROCESSING" || sourceItem.status === "UPLOADING",
      );
      return hasProcessing ? 5000 : false;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

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
      <div className="px-6 pt-3 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-0.5 w-6 bg-accent-primary dark:bg-accent-red" />
          <h2 className="text-[11px] font-semibold tracking-[3px] text-foreground uppercase font-mono">
            SOURCES
          </h2>
        </div>
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
            <p className="text-xs text-muted-foreground">
              Add documents or webpages
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {liveSources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                onSelect={() => onSelectSource(source)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Source Dialog */}
      <AddSourceDialog
        notebookId={notebookId}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
      />
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
      className={`group relative cursor-pointer rounded-[4px] px-4 py-3 transition-all duration-200 bg-surface-elevated hover:bg-surface-hover border-2 border-divider border-l-4 border-l-divider dark:border-0 dark:border-l-4 dark:border-l-accent-red ${isPending ? "opacity-50" : ""
        }`}
      onClick={onSelect}
    >
      {/* Delete Badge - hover visible */}
      <button
        className="absolute -top-2 -right-2 h-4.5 w-4.5 rounded-full bg-accent-red flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
        onClick={(e) => { e.stopPropagation(); handleDelete(e); }}
        title="Delete"
      >
        <X className="h-3 w-3 text-white" />
      </button>

      <div className="min-w-0 flex-1">
        <span className="truncate block text-[13px] font-semibold dark:font-medium leading-tight">{source.title}</span>
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
      </div>
    </div>
  );
});

// Source content viewer - shows title and markdown content with TOC button
function SourceContentView({
  source,
  onBack,
}: {
  source: Source;
  onBack: () => void;
}) {
  const [showToc, setShowToc] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const panelContext = useCollapsiblePanel();
  const isAnimationComplete = panelContext?.isAnimationComplete ?? true;

  const markdownContent = source.content || "No content available";
  const [deferredContent, setDeferredContent] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (isAnimationComplete) {
      startTransition(() => {
        setDeferredContent(markdownContent);
      });
    } else {
      setDeferredContent(null);
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
      const relativeTop =
        elementRect.top - containerRect.top + container.scrollTop;

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
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0"
          onClick={onBack}
        >
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
                  <h3 className="mb-2 text-xs font-semibold">
                    Table of Contents
                  </h3>
                  <nav className="max-h-96 space-y-1 overflow-y-auto">
                    {headings.map((heading, index) => (
                      <button
                        key={index}
                        onClick={() => scrollToHeading(heading.text)}
                        className={`block w-full text-left text-xs hover:text-accent-red transition-colors ${heading.level === 1 ? "font-medium" : ""
                          } ${heading.level === 2 ? "pl-2" : ""} ${heading.level === 3
                            ? "pl-4 text-muted-foreground"
                            : ""
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

      {/* Markdown content */}
      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4"
        style={{ contain: "content" }}
      >
        {deferredContent ? (
          <Markdown className="space-y-3 text-[14px] leading-5 text-muted-foreground">
            {deferredContent}
          </Markdown>
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

interface AddSourceDialogProps {
  notebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function AddSourceDialog({
  notebookId,
  open,
  onOpenChange,
}: AddSourceDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [url, setUrl] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [uploadMode, setUploadMode] = useState<"file" | "url">("file");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const handleWebpageSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!url.trim()) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimistic: Source = {
      id: tempId,
      notebookId,
      title: url.trim(),
      sourceType: "WEBPAGE",
      url: url.trim(),
      status: "PROCESSING",
      content: null,
      markdownContent: null,
      fileKey: null,
      errorMessage: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    startTransition(async () => {
      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])],
      );
      onOpenChange(false);

      try {
        const created = await addWebpageSource(notebookId, url.trim());
        queryClient.setQueryData<Source[] | undefined>(
          ["notebook-sources", notebookId],
          (current) =>
            (current || []).map((item) =>
              item.id === tempId
                ? {
                  ...created,
                  createdAt: new Date(created.createdAt),
                  updatedAt: new Date(created.updatedAt),
                }
                : item,
            ),
        );
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["notebook-sources", notebookId],
        });
        setUrl("");
      }
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = () => {
    if (!selectedFile) return;

    startTransition(async () => {
      const tempId = `optimistic-${Date.now()}`;
      const optimistic: Source = {
        id: tempId,
        notebookId,
        title: selectedFile.name,
        sourceType: "DOCUMENT",
        url: null,
        status: "PROCESSING",
        content: null,
        markdownContent: null,
          fileKey: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])],
      );
      onOpenChange(false);

      try {
        const formData = new FormData();
        formData.append("file", selectedFile);
        const created = await uploadDocumentSource(notebookId, formData);
        queryClient.setQueryData<Source[] | undefined>(
          ["notebook-sources", notebookId],
          (current) =>
            (current || []).map((item) =>
              item.id === tempId
                ? {
                  ...created,
                  createdAt: new Date(created.createdAt),
                  updatedAt: new Date(created.updatedAt),
                }
                : item,
            ),
        );
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["notebook-sources", notebookId],
        });
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    });
  };

  const handleUrlUpload = async () => {
    if (!documentUrl.trim()) return;

    const tempId = `optimistic-${Date.now()}`;
    // Extract filename from URL for display
    let displayName = "Document";
    try {
      const urlPath = new URL(documentUrl).pathname;
      const lastSegment = urlPath.split("/").pop();
      if (lastSegment) {
        displayName = decodeURIComponent(lastSegment);
      }
    } catch {
      displayName = documentUrl.slice(0, 50);
    }

    const optimistic: Source = {
      id: tempId,
      notebookId,
      title: displayName,
      sourceType: "DOCUMENT",
      url: documentUrl.trim(),
      status: "PROCESSING",
      content: null,
      markdownContent: null,
      fileKey: null,
      errorMessage: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    startTransition(async () => {
      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])],
      );
      onOpenChange(false);

      try {
        const apiUrl = `/api/download?url=${encodeURIComponent(documentUrl)}`;

        const response = await fetch(apiUrl);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const contentType =
          response.headers.get("content-type") ||
          blob.type ||
          "application/octet-stream";
        const headerFilename =
          response.headers.get("x-filename") || displayName;
        let filename = headerFilename;

        if (!/\.[a-z0-9]+$/i.test(filename)) {
          if (contentType.includes("pdf")) {
            filename = `${filename}.pdf`;
          } else if (
            contentType.includes("word") ||
            contentType.includes("docx")
          ) {
            filename = `${filename}.docx`;
          } else if (contentType.includes("text/markdown")) {
            filename = `${filename}.md`;
          } else if (contentType.includes("text/plain")) {
            filename = `${filename}.txt`;
          }
        }

        const file = new File([blob], filename, { type: contentType });

        // Upload using existing document upload action
        const formData = new FormData();
        formData.append("file", file);

        const created = await uploadDocumentSource(notebookId, formData);

        queryClient.setQueryData<Source[] | undefined>(
          ["notebook-sources", notebookId],
          (current) =>
            (current || []).map((item) =>
              item.id === tempId
                ? {
                  ...created,
                  createdAt: new Date(created.createdAt),
                  updatedAt: new Date(created.updatedAt),
                }
                : item,
            ),
        );
      } catch (error) {
        console.error("[SourcesPanel] URL upload failed:", error);
        // Update optimistic item to show error
        queryClient.setQueryData<Source[] | undefined>(
          ["notebook-sources", notebookId],
          (current) =>
            (current || []).map((item) =>
              item.id === tempId
                ? {
                  ...item,
                  status: "FAILED",
                  errorMessage:
                    error instanceof Error
                      ? error.message
                      : "Download failed",
                }
                : item,
            ),
        );
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["notebook-sources", notebookId],
        });
        setDocumentUrl("");
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Source</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="webpage" className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="webpage" className="gap-2">
              <Link className="h-4 w-4" />
              Webpage
            </TabsTrigger>
            <TabsTrigger value="document" className="gap-2">
              <Upload className="h-4 w-4" />
              Document
            </TabsTrigger>
          </TabsList>

          <TabsContent value="webpage" className="mt-4">
            <form onSubmit={handleWebpageSubmit} className="space-y-4">
              <div>
                <label htmlFor="url" className="mb-2 block text-sm font-medium">
                  URL
                </label>
                <Input
                  id="url"
                  type="url"
                  placeholder="https://example.com/article"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  disabled={isPending}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-accent-red hover:bg-accent-red-hover"
                  disabled={isPending || !url.trim()}
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Webpage"
                  )}
                </Button>
              </div>
            </form>
          </TabsContent>

          <TabsContent value="document" className="mt-4">
            <div className="space-y-4">
              {/* Upload Mode Toggle */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={uploadMode === "file" ? "default" : "outline"}
                  size="sm"
                  className={
                    uploadMode === "file"
                      ? "bg-accent-red hover:bg-accent-red-hover"
                      : ""
                  }
                  onClick={() => setUploadMode("file")}
                >
                  <Upload className="mr-2 h-3.5 w-3.5" />
                  File Upload
                </Button>
                <Button
                  type="button"
                  variant={uploadMode === "url" ? "default" : "outline"}
                  size="sm"
                  className={
                    uploadMode === "url"
                      ? "bg-accent-red hover:bg-accent-red-hover"
                      : ""
                  }
                  onClick={() => setUploadMode("url")}
                >
                  <Link className="mr-2 h-3.5 w-3.5" />
                  URL Upload
                </Button>
              </div>

              {uploadMode === "file" ? (
                <>
                  <div>
                    <label className="mb-2 block text-sm font-medium">
                      File
                    </label>
                    <div
                      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-accent-red/50"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground" />
                      <p className="mt-2 text-sm text-muted-foreground">
                        {selectedFile
                          ? selectedFile.name
                          : "Click to select a file"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, DOCX, TXT, MD
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      accept=".pdf,.docx,.txt,.md"
                      onChange={handleFileSelect}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="bg-accent-red hover:bg-accent-red-hover"
                      disabled={isPending || !selectedFile}
                      onClick={handleUpload}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        "Upload"
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="documentUrl"
                      className="mb-2 block text-sm font-medium"
                    >
                      Document URL
                    </label>
                    <Input
                      id="documentUrl"
                      type="url"
                      placeholder="https://example.com/document.pdf"
                      value={documentUrl}
                      onChange={(e) => setDocumentUrl(e.target.value)}
                      disabled={isPending}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      Supported formats: PDF, DOCX, TXT, MD
                    </p>
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => onOpenChange(false)}
                      disabled={isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      className="bg-accent-red hover:bg-accent-red-hover"
                      disabled={isPending || !documentUrl.trim()}
                      onClick={handleUrlUpload}
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Downloading...
                        </>
                      ) : (
                        "Download & Process"
                      )}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
