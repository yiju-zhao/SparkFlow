"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  FileText,
  Globe,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  MoreVertical,
  Trash2,
  Upload,
  Link,
  ArrowLeft,
} from "lucide-react";
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
import type { Source } from "@prisma/client";
import ReactMarkdown from "react-markdown";

// Hook to safely format time on client only (avoids hydration mismatch)
function useRelativeTime(date: Date): string {
  const [timeString, setTimeString] = useState<string>("");

  useEffect(() => {
    setTimeString(formatDistanceToNow(date, { addSuffix: true }));
    // Update every minute
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
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
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
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">No sources yet</p>
            <p className="text-xs text-muted-foreground">
              Add documents or webpages
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {sources.map((source) => (
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

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    startTransition(async () => {
      await deleteSource(source.id);
    });
  };

  const statusIcon = {
    UPLOADING: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
    PROCESSING: <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />,
    READY: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
    FAILED: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  }[source.status];

  return (
    <div
      className={`group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2 hover:bg-accent ${
        isPending ? "opacity-50" : ""
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
        {source.status === "FAILED" && source.errorMessage && (
          <p className="mt-1 text-xs text-destructive">{source.errorMessage}</p>
        )}
      </div>
      <div className="opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
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

// Source content viewer - shows title and markdown content
function SourceContentView({
  source,
  onBack,
}: {
  source: Source;
  onBack: () => void;
}) {
  // Extract markdown content from metadata
  const metadata = source.metadata as Record<string, unknown> | null;
  const markdownContent =
    (metadata?.markdown as string) ||
    (metadata?.content as string) ||
    "No content available";

  return (
    <div className="flex h-full flex-col">
      {/* Header with back button */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
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
      </div>

      {/* Markdown content */}
      <div className="flex-1 overflow-y-auto p-4">
        <article className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown>{markdownContent}</ReactMarkdown>
        </article>
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

  const handleWebpageSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    startTransition(async () => {
      await addWebpageSource(notebookId, url.trim());
      setUrl("");
      onOpenChange(false);
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
      const formData = new FormData();
      formData.append("file", selectedFile);
      await uploadDocumentSource(notebookId, formData);
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onOpenChange(false);
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
