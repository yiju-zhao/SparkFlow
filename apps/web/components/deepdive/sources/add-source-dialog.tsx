"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  Globe,
  BookOpen,
  MessageCircle,
  Search,
  ArrowRight,
  ArrowLeft,
  Upload,
  Link,
  Loader2,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  addWebpageSource,
  uploadDocumentSource,
  addPublicationSource,
  addWechatSource,
} from "@/lib/actions/sources";
import type { Source as PrismaSource } from "@prisma/client";
import type { SourceSearchType, SearchResult, SearchStatusResponse } from "@/lib/types/search";

type Source = PrismaSource & { content?: string | null };

const SOURCE_TYPE_OPTIONS: {
  value: SourceSearchType;
  label: string;
  description: string;
  icon: typeof Globe;
}[] = [
  {
    value: "web",
    label: "Web",
    description: "Search the web via Tavily",
    icon: Globe,
  },
  {
    value: "publication",
    label: "Publication",
    description: "Papers in SparkFlow database",
    icon: BookOpen,
  },
  {
    value: "wechat",
    label: "WeChat Article",
    description: "Articles from WeChat sources",
    icon: MessageCircle,
  },
];

interface AddSourceDialogProps {
  notebookId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddSourceDialog({ notebookId, open, onOpenChange }: AddSourceDialogProps) {
  // Search state
  const [sourceType, setSourceType] = useState<SourceSearchType>("web");
  const [query, setQuery] = useState("");
  const [domains, setDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [showDomainInput, setShowDomainInput] = useState(false);
  const [isSourceTypeOpen, setIsSourceTypeOpen] = useState(false);

  // Search results state
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [view, setView] = useState<"idle" | "searching" | "results">("idle");

  // File upload state
  const [isPending, startTransition] = useTransition();
  const [urlsText, setUrlsText] = useState("");
  const [showWebsites, setShowWebsites] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const queryClient = useQueryClient();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetSearch = useCallback(() => {
    setResults([]);
    setSelected(new Set());
    setIsSearching(false);
    setSearchError(null);
    setView("idle");
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const handleSourceTypeChange = (type: SourceSearchType) => {
    setSourceType(type);
    setIsSourceTypeOpen(false);
    setDomains([]);
    setDomainInput("");
    setShowDomainInput(false);
    resetSearch();
  };

  const handleAddDomain = () => {
    const domain = domainInput.trim().toLowerCase();
    if (domain && !domains.includes(domain)) {
      setDomains((prev) => [...prev, domain]);
    }
    setDomainInput("");
    setShowDomainInput(false);
  };

  const handleRemoveDomain = (domain: string) => {
    setDomains((prev) => prev.filter((d) => d !== domain));
  };

  const handleSearch = async () => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setView("searching");
    setResults([]);
    setSelected(new Set());

    try {
      const res = await fetch(`/api/notebooks/${notebookId}/sources/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: query.trim(),
          sourceType,
          domains: sourceType === "web" ? domains : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Search failed: ${res.status}`);
      }

      const { taskId } = await res.json();

      // Poll for results
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/notebooks/${notebookId}/sources/search/${taskId}`);
          if (!statusRes.ok) return;

          const data: SearchStatusResponse = await statusRes.json();
          setResults(data.results);

          if (data.status === "completed") {
            setIsSearching(false);
            setView("results");
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          } else if (data.status === "failed") {
            setIsSearching(false);
            setSearchError(data.error || "Search failed");
            setView("results");
            if (pollRef.current) {
              clearInterval(pollRef.current);
              pollRef.current = null;
            }
          }
        } catch {
          // Polling error, will retry
        }
      }, 2000);
    } catch (err) {
      setIsSearching(false);
      setSearchError(err instanceof Error ? err.message : "Search failed");
      setView("results");
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedResults = results.filter((r) => selected.has(r.id));
    if (selectedResults.length === 0) return;

    startTransition(async () => {
      for (const result of selectedResults) {
        const tempId = `optimistic-${Date.now()}-${result.id}`;
        const optimistic: Source = {
          id: tempId,
          notebookId,
          title: result.title,
          sourceType: result.sourceType === "publication" ? "DOCUMENT" : "WEBPAGE",
          url: result.url || null,
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

        try {
          if (result.sourceType === "web" && result.url) {
            await addWebpageSource(notebookId, result.url, result.title);
          } else if (result.sourceType === "publication") {
            await addPublicationSource(notebookId, result.id);
          } else if (result.sourceType === "wechat") {
            await addWechatSource(notebookId, parseInt(result.id));
          }
        } catch (err) {
          console.error(`[AddSource] Failed to add ${result.title}:`, err);
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["notebook-sources", notebookId],
      });

      onOpenChange(false);
      resetSearch();
      setQuery("");
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      handleFileUpload(file);
    }
  };

  const handleFileUpload = (file: File) => {
    startTransition(async () => {
      const tempId = `optimistic-${Date.now()}`;
      const optimistic: Source = {
        id: tempId,
        notebookId,
        title: file.name,
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
        formData.append("file", file);
        await uploadDocumentSource(notebookId, formData);
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["notebook-sources", notebookId],
        });
        setSelectedFile(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      handleFileUpload(file);
    }
  };

  const handleWebsitesInsert = () => {
    const urls = urlsText
      .split(/[\s\n]+/)
      .map((u) => u.trim())
      .filter((u) => u && (u.startsWith("http://") || u.startsWith("https://")));
    if (urls.length === 0) return;

    startTransition(async () => {
      for (const singleUrl of urls) {
        const tempId = `optimistic-${Date.now()}-${singleUrl}`;
        const optimistic: Source = {
          id: tempId,
          notebookId,
          title: singleUrl,
          sourceType: "WEBPAGE",
          url: singleUrl,
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

        try {
          await addWebpageSource(notebookId, singleUrl);
        } catch (err) {
          console.error(`[AddSource] Failed to add ${singleUrl}:`, err);
        }
      }

      await queryClient.invalidateQueries({
        queryKey: ["notebook-sources", notebookId],
      });

      onOpenChange(false);
      setUrlsText("");
      setShowWebsites(false);
    });
  };

  const currentSourceOption = SOURCE_TYPE_OPTIONS.find((o) => o.value === sourceType)!;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          resetSearch();
          setQuery("");
        }
      }}
    >
      <DialogContent className="sm:max-w-[560px] p-0 gap-0" showCloseButton={false}>
        <DialogTitle className="sr-only">Add Source</DialogTitle>
        {showWebsites ? (
          /* Websites sub-view — full takeover, no search bar */
          <div className="px-6 py-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-3">
              <button
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                onClick={() => {
                  setShowWebsites(false);
                  setUrlsText("");
                }}
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <h3 className="text-base font-semibold">Website URLs</h3>
            </div>

            <p className="text-sm text-muted-foreground mb-3">
              Paste website URLs below to add as sources.
            </p>

            {/* Textarea */}
            <textarea
              placeholder="Paste any links"
              value={urlsText}
              onChange={(e) => setUrlsText(e.target.value)}
              disabled={isPending}
              autoFocus
              className="w-full min-h-40 p-4 border-2 border-border rounded-xl text-sm bg-transparent outline-none resize-y placeholder:text-muted-foreground focus:border-primary transition-colors"
            />

            {/* Hints */}
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground list-disc pl-4">
              <li>To add multiple URLs, separate with a space or new line.</li>
              <li>Only the visible text on the website will be imported.</li>
              <li>Paid articles are not supported.</li>
            </ul>

            {/* Insert Button */}
            <div className="flex justify-end mt-4">
              <Button disabled={isPending || !urlsText.trim()} onClick={handleWebsitesInsert}>
                {isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Inserting...
                  </>
                ) : (
                  "Insert"
                )}
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Search Section */}
            <div className="p-6 pb-4">
              {/* Close Button Row */}
              <div className="flex justify-end -mt-2 -mr-2 mb-2">
                <DialogClose className="h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                  <span className="sr-only">Close</span>
                </DialogClose>
              </div>
              {/* Search Bar */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSearch();
                }}
                className="flex items-center gap-3 rounded-xl border-2 border-border px-4 py-3"
              >
                <Search className="h-5 w-5 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="Search for new sources..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  disabled={isPending}
                />
                <button
                  type="submit"
                  disabled={!query.trim() || isPending || isSearching}
                  className="h-9 w-9 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 disabled:opacity-30 transition-opacity"
                >
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="h-4 w-4" />
                  )}
                </button>
              </form>

              {/* Controls Row */}
              <div className="flex items-center gap-2 mt-3">
                {/* Source Type Dropdown */}
                <Popover open={isSourceTypeOpen} onOpenChange={setIsSourceTypeOpen}>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-full text-xs font-medium hover:bg-accent/50 transition-colors">
                      <currentSourceOption.icon className="h-3.5 w-3.5" />
                      {currentSourceOption.label}
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-1" align="start">
                    {SOURCE_TYPE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors ${
                          sourceType === option.value ? "bg-accent/50" : "hover:bg-accent/30"
                        }`}
                        onClick={() => handleSourceTypeChange(option.value)}
                      >
                        <option.icon className="h-5 w-5 shrink-0" />
                        <div>
                          <div className="text-sm font-semibold">{option.label}</div>
                          <div className="text-xs text-muted-foreground">{option.description}</div>
                        </div>
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                {/* Domain filter (web only) */}
                {sourceType === "web" && (
                  <>
                    {showDomainInput ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          handleAddDomain();
                        }}
                        className="flex items-center"
                      >
                        <input
                          type="text"
                          placeholder="e.g. arxiv.org"
                          value={domainInput}
                          onChange={(e) => setDomainInput(e.target.value)}
                          onBlur={() => {
                            if (!domainInput.trim()) setShowDomainInput(false);
                          }}
                          autoFocus
                          className="px-3 py-1.5 border border-dashed border-border rounded-full text-xs bg-transparent outline-none w-32"
                        />
                      </form>
                    ) : (
                      <button
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-dashed border-border rounded-full text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                        onClick={() => setShowDomainInput(true)}
                      >
                        <span className="text-sm leading-none">+</span>
                        Add domains...
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Domain chips */}
              {domains.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {domains.map((domain) => (
                    <span
                      key={domain}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-accent/30 text-accent-foreground rounded-full text-xs"
                    >
                      {domain}
                      <button
                        onClick={() => handleRemoveDomain(domain)}
                        className="hover:text-destructive transition-colors"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="border-t border-border mx-6" />

            {view === "idle" ? (
              <>
                {/* Drop Zone */}
                <div
                  className="mx-6 my-4 p-8 border-2 border-dashed border-border rounded-xl text-center cursor-pointer hover:border-foreground/30 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <p className="text-lg text-muted-foreground">or drop your files</p>
                  <p className="text-xs text-muted-foreground mt-1">pdf, docx, txt, md</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,.md"
                  onChange={handleFileSelect}
                />

                {/* Bottom Actions */}
                <div className="flex gap-2.5 px-6 pb-6">
                  <button
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-xl text-sm font-medium hover:bg-accent/30 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4" />
                    Upload files
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-2 py-3 border border-border rounded-xl text-sm font-medium hover:bg-accent/30 transition-colors"
                    onClick={() => setShowWebsites(true)}
                  >
                    <Link className="h-4 w-4" />
                    Websites
                  </button>
                </div>
              </>
            ) : (
              <div className="px-6 py-4 max-h-80 overflow-y-auto">
                {isSearching && results.length === 0 && (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Searching...</span>
                  </div>
                )}

                {searchError && (
                  <div className="text-sm text-destructive text-center py-4">{searchError}</div>
                )}

                {!isSearching && results.length === 0 && !searchError && (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No results found
                  </div>
                )}

                {results.length > 0 && (
                  <div className="space-y-2">
                    {results.map((result) => {
                      const isSelected = selected.has(result.id);
                      return (
                        <div
                          key={result.id}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5"
                              : "border-border hover:border-foreground/20"
                          }`}
                          onClick={() => handleToggleSelect(result.id)}
                        >
                          <div
                            className={`mt-0.5 h-5 w-5 rounded shrink-0 flex items-center justify-center ${
                              isSelected
                                ? "bg-primary text-primary-foreground"
                                : "border-2 border-muted-foreground/30"
                            }`}
                          >
                            {isSelected && <Check className="h-3.5 w-3.5" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold leading-tight">
                              {result.title}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {result.meta}
                            </div>
                            {result.snippet && (
                              <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
                                {result.snippet}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {results.length > 0 && (
                  <div className="flex justify-end mt-4 pb-2">
                    <Button
                      disabled={selected.size === 0 || isPending}
                      onClick={handleAddSelected}
                      className="bg-foreground text-background hover:bg-foreground/90"
                    >
                      {isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Adding...
                        </>
                      ) : (
                        `Add ${selected.size} selected source${selected.size !== 1 ? "s" : ""}`
                      )}
                    </Button>
                  </div>
                )}

                {!isSearching && (
                  <button
                    className="text-xs text-muted-foreground hover:text-foreground mt-2 transition-colors"
                    onClick={() => {
                      resetSearch();
                      setQuery("");
                    }}
                  >
                    Clear search
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
