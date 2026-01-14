"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Globe, Plus, Loader2, XCircle, MoreVertical, Trash2, Upload, Link, ArrowLeft } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  addWebpageSource,
  uploadDocumentSource,
  deleteSource,
} from "@/lib/actions/sources";
import type { Source as PrismaSource } from "@prisma/client";
import { Markdown } from "@/components/ui/markdown";

// Extended Source type with the new content field (until Prisma client is regenerated)
type Source = PrismaSource & {
  content?: string | null;
};

// Hook to safely format time on client only (avoids hydration mismatch)
function useRelativeTime(date: Date): string {
  const [timeString, setTimeString] = useState<string>(() =>
    formatDistanceToNow(date, { addSuffix: true })
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeString(formatDistanceToNow(date, { addSuffix: true }));
    }, 60000);
    return () => clearInterval(interval);
  }, [date]);

  return timeString;
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
      const shouldPoll = list.some(
        (sourceItem) =>
          (sourceItem.status === "PROCESSING" ||
            sourceItem.status === "UPLOADING") &&
          sourceItem.ragflowDocumentId
      );
      return shouldPoll ? 5000 : 15000;
    },
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // Show source content view when a source is selected
  if (selectedSource) {
    return (
      <SourceContentView
        source={selectedSource}
        onBack={() => onSelectSource(null)}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">Sources</h2>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1 text-xs"
          onClick={() => setIsDialogOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </Button>
      </div>

      {/* Sources List */}
      <div className="flex-1 overflow-y-auto p-2">
        {liveSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No sources yet</p>
            <p className="text-xs text-muted-foreground">
              Add documents or webpages
            </p>
          </div>
        ) : (
          <div className="space-y-1">
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

function SourceItem({
  source,
  onSelect,
}: {
  source: Source;
  onSelect: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const relativeTime = useRelativeTime(new Date(source.createdAt));
  const ragflowMeta = useMemo(
    () => (source.metadata as Record<string, unknown> | null) || {},
    [source.metadata]
  );
  const queryClient = useQueryClient();

  const ragflowRun =
    (ragflowMeta.ragflowRun as string | undefined)?.toString().toUpperCase() ||
    null;
  const ragflowProgress =
    typeof ragflowMeta.ragflowProgress === "number"
      ? ragflowMeta.ragflowProgress
      : null;

  const isRunning =
    ragflowRun === "RUNNING" || ragflowRun === "1" || source.status === "PROCESSING";
  const isFailed =
    ragflowRun === "FAIL" ||
    ragflowRun === "4" ||
    ragflowRun === "-1" ||
    source.status === "FAILED";

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", source.notebookId],
        (current) => (current || []).filter((item) => item.id !== source.id)
      );
      await deleteSource(source.id);
      await queryClient.invalidateQueries({
        queryKey: ["notebook-sources", source.notebookId],
      });
    });
  };

  const statusIcon =
    (isRunning && (
      <span className="relative flex h-3.5 w-3.5 items-center justify-center">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400/60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
      </span>
    )) ||
    (isFailed && <XCircle className="h-3.5 w-3.5 text-destructive" />) ||
    (() => {
      switch (source.status) {
        case "UPLOADING":
          return <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />;
        case "PROCESSING":
          return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />;
        case "FAILED":
          return <XCircle className="h-3.5 w-3.5 text-destructive" />;
        default:
          return null; // READY shows no icon
      }
    })();

  return (
    <div
      className={`group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-accent ${isPending ? "opacity-50" : ""
        }`}
      onClick={onSelect}
    >
      <div className="mt-0.5">
        {source.sourceType === "DOCUMENT" ? (
          <FileText className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{source.title}</span>
          {statusIcon}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {source.sourceType}
          </Badge>
          {relativeTime && <span>{relativeTime}</span>}
        </div>
        {isRunning && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300">
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-2 py-1 dark:bg-amber-900/50">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-60" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500" />
              </span>
              {typeof ragflowProgress === "number"
                ? `Indexing on RagFlow · ${Math.round(ragflowProgress * 100)}%`
                : "Indexing on RagFlow"}
            </span>
          </div>
        )}
        {source.status === "FAILED" && source.errorMessage && (
          <p className="mt-1 text-xs text-destructive">{source.errorMessage}</p>
        )}
      </div>
      <div
        className="opacity-0 transition-opacity group-hover:opacity-100"
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild suppressHydrationWarning>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={isPending}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

// Source content viewer - shows title and markdown content with TOC button
function SourceContentView({
  source,
  onBack,
}: {
  source: Source;
  onBack: () => void;
}) {
  const [showToc, setShowToc] = useState(false);
  const [headings, setHeadings] = useState<{ id: string; text: string; level: number }[]>([]);

  // Get markdown content from the content column
  const markdownContent = source.content || "No content available";

  // Extract headings from markdown
  useEffect(() => {
    const extractedHeadings: { id: string; text: string; level: number }[] = [];
    const lines = markdownContent.split('\n');

    for (const line of lines) {
      const match = line.match(/^(#{1,3})\s+(.+)$/);
      if (match) {
        const level = match[1].length;
        const text = match[2].trim();
        // Generate ID similar to rehype-slug
        const id = text
          .toLowerCase()
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '-');
        extractedHeadings.push({ id, text, level });
      }
    }

    setHeadings(extractedHeadings);
  }, [markdownContent]);

  const scrollToHeading = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setShowToc(false); // Close TOC after clicking
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Header with back button and TOC button */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
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
                  <h3 className="mb-2 text-xs font-semibold">Table of Contents</h3>
                  <nav className="max-h-96 space-y-1 overflow-y-auto">
                    {headings.map((heading, index) => (
                      <button
                        key={index}
                        onClick={() => scrollToHeading(heading.id)}
                        className={`block w-full text-left text-xs hover:text-accent-blue transition-colors ${heading.level === 1 ? 'font-medium' : ''
                          } ${heading.level === 2 ? 'pl-2' : ''
                          } ${heading.level === 3 ? 'pl-4 text-muted-foreground' : ''
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
        <Markdown className="space-y-3 text-[14px] leading-5 text-muted-foreground">
          {markdownContent}
        </Markdown>
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const handleWebpageSubmit = (e: React.FormEvent) => {
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
      fileKey: null,
      ragflowDocumentId: null,
      errorMessage: null,
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    startTransition(async () => {
      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])]
      );
      onOpenChange(false);

      try {
        const created = await addWebpageSource(notebookId, url.trim());
        queryClient.setQueryData<Source[] | undefined>(
          ["notebook-sources", notebookId],
          (current) =>
            (current || []).map((item) =>
              item.id === tempId ? { ...created, createdAt: new Date(created.createdAt), updatedAt: new Date(created.updatedAt) } : item
            )
        );
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["notebook-sources", notebookId] });
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
        status: "UPLOADING",
        content: null,
        fileKey: null,
        ragflowDocumentId: null,
        errorMessage: null,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])]
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
              item.id === tempId ? { ...created, createdAt: new Date(created.createdAt), updatedAt: new Date(created.updatedAt) } : item
            )
        );
      } finally {
        await queryClient.invalidateQueries({ queryKey: ["notebook-sources", notebookId] });
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
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
                <label
                  htmlFor="url"
                  className="mb-2 block text-sm font-medium"
                >
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
              <div>
                <label className="mb-2 block text-sm font-medium">File</label>
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
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
