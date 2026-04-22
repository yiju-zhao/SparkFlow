# Add Source Modal Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the notebook's Add Source modal with unified search (Web/Publication/WeChat) via LangGraph agent, file drop zone, and multi-select results.

**Architecture:** Frontend sends search requests to a Next.js API route that proxies to the LangGraph agent. The agent performs deep search and results are polled incrementally. Source addition (extraction + processing) stays in Next.js server actions. WeChat DB accessed via raw `pg` pool.

**Tech Stack:** Next.js 16, React 19, React Query, shadcn/ui (Dialog, Popover, Input, Button), pg (for WeChat DB), LangGraph agent

---

## File Structure

| File | Responsibility |
|------|---------------|
| `lib/services/wechat-client.ts` | **New** — pg pool + search/fetch helpers for WeChat external DB |
| `lib/types/search.ts` | **New** — shared SearchResult, SearchRequest, SearchStatus types |
| `app/api/notebooks/[id]/sources/search/route.ts` | **New** — POST to create search task (proxies to LangGraph agent) |
| `app/api/notebooks/[id]/sources/search/[taskId]/route.ts` | **New** — GET to poll search task status/results |
| `lib/actions/sources.ts` | **Modify** — add `addPublicationSource`, `addWechatSource` server actions |
| `components/deepdive/sources/add-source-dialog.tsx` | **New** — extracted + rewritten AddSourceDialog component |
| `components/deepdive/sources/sources-panel.tsx` | **Modify** — remove old AddSourceDialog, import new one |

---

### Task 1: Shared Types

**Files:**
- Create: `lib/types/search.ts`

- [ ] **Step 1: Create search types file**

```ts
// lib/types/search.ts

export type SourceSearchType = "web" | "publication" | "wechat";

export interface SearchRequest {
  query: string;
  sourceType: SourceSearchType;
  domains?: string[]; // only for sourceType "web"
}

export interface SearchResult {
  id: string;
  title: string;
  snippet: string;
  meta: string;
  url?: string;
  sourceType: SourceSearchType;
}

export interface SearchStatusResponse {
  status: "searching" | "completed" | "failed";
  results: SearchResult[];
  error?: string;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `lib/types/search.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/types/search.ts
git commit -m "feat(deepdive): add shared search types for source modal"
```

---

### Task 2: WeChat Database Client

**Files:**
- Create: `lib/services/wechat-client.ts`

- [ ] **Step 1: Create WeChat client with pg pool and search/fetch helpers**

```ts
// lib/services/wechat-client.ts
import pg from "pg";

const pool = new pg.Pool({
  host: process.env.WECHAT_DB_HOST,
  port: parseInt(process.env.WECHAT_DB_PORT || "5432"),
  user: process.env.WECHAT_DB_USER,
  password: process.env.WECHAT_DB_PASSWORD,
  database: process.env.WECHAT_DB_NAME,
  max: 5,
  idleTimeoutMillis: 30000,
});

export interface WechatArticle {
  id: number;
  title: string;
  author: string;
  publish_time: Date | null;
  original_url: string;
  cover_url: string;
  content_html: string;
  content_text: string;
  source_name: string;
}

export interface WechatImage {
  id: number;
  article_id: number;
  image_type: string;
  original_url: string;
  mime_type: string;
  data: Buffer;
}

export async function searchWechatArticles(
  query: string,
  limit = 10,
): Promise<WechatArticle[]> {
  const result = await pool.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE a.title ILIKE $1 OR a.content_text ILIKE $1
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $2`,
    [`%${query}%`, limit],
  );
  return result.rows;
}

export async function getWechatArticleById(
  articleId: number,
): Promise<WechatArticle | null> {
  const result = await pool.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE a.id = $1`,
    [articleId],
  );
  return result.rows[0] || null;
}

export async function getWechatArticleImages(
  articleId: number,
): Promise<WechatImage[]> {
  const result = await pool.query<WechatImage>(
    `SELECT id, article_id, image_type, original_url, mime_type, data
     FROM wechat_articles.images
     WHERE article_id = $1
     ORDER BY image_index ASC`,
    [articleId],
  );
  return result.rows;
}
```

- [ ] **Step 2: Add env vars to .env.local**

Add to `.env.local`:
```
WECHAT_DB_HOST=<ip>
WECHAT_DB_PORT=<port>
WECHAT_DB_USER=<user>
WECHAT_DB_PASSWORD=<password>
WECHAT_DB_NAME=<dbname>
```

- [ ] **Step 3: Install pg package if not already installed**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npm ls pg 2>&1 | head -5`

If not installed:
Run: `npm install pg && npm install -D @types/pg`

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to `wechat-client.ts`

- [ ] **Step 5: Commit**

```bash
git add lib/services/wechat-client.ts package.json package-lock.json
git commit -m "feat(deepdive): add WeChat external database client"
```

---

### Task 3: Search API Routes

**Files:**
- Create: `app/api/notebooks/[id]/sources/search/route.ts`
- Create: `app/api/notebooks/[id]/sources/search/[taskId]/route.ts`

- [ ] **Step 1: Create in-memory search task store and POST route**

The POST route creates a search task, fires the LangGraph agent call in the background, and returns a taskId. We use an in-memory Map to store task state (sufficient for single-server deployment).

```ts
// app/api/notebooks/[id]/sources/search/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import type { SearchRequest, SearchResult, SearchStatusResponse } from "@/lib/types/search";
import { searchWechatArticles } from "@/lib/services/wechat-client";

// In-memory task store (sufficient for single-server)
export const searchTasks = new Map<
  string,
  SearchStatusResponse & { notebookId: string }
>();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const body = (await req.json()) as SearchRequest;
  const { query, sourceType, domains } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  const taskId = uuidv4();
  searchTasks.set(taskId, {
    status: "searching",
    results: [],
    notebookId,
  });

  // Fire search in background
  performSearch(taskId, query, sourceType, domains).catch((err) => {
    console.error(`[Search] Task ${taskId} failed:`, err);
    const task = searchTasks.get(taskId);
    if (task) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : "Search failed";
    }
  });

  return NextResponse.json({ taskId });
}

async function performSearch(
  taskId: string,
  query: string,
  sourceType: string,
  domains?: string[],
) {
  const task = searchTasks.get(taskId);
  if (!task) return;

  try {
    let results: SearchResult[] = [];

    if (sourceType === "web") {
      // Call LangGraph agent for web search
      const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
      const response = await fetch(`${agentUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_id: "agent",
          input: {
            messages: [
              {
                role: "user",
                content: JSON.stringify({
                  action: "search",
                  query,
                  sourceType: "web",
                  domains: domains || [],
                }),
              },
            ],
          },
          config: { configurable: { search_mode: true } },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        // Extract search results from agent response
        // The exact shape depends on how the agent returns results
        // For now, parse from the last message content
        const lastMessage = data?.output?.messages?.slice(-1)?.[0];
        if (lastMessage?.content) {
          try {
            const parsed = JSON.parse(lastMessage.content);
            if (Array.isArray(parsed)) {
              results = parsed.map((r: any) => ({
                id: r.url || r.id || uuidv4(),
                title: r.title || "Untitled",
                snippet: r.content || r.snippet || "",
                meta: new URL(r.url || "").hostname + (r.published_date ? ` · ${r.published_date}` : ""),
                url: r.url,
                sourceType: "web" as const,
              }));
            }
          } catch {
            // Agent returned non-JSON, skip
          }
        }
      }
    } else if (sourceType === "publication") {
      // Search SparkFlow publications via Prisma
      const publications = await prisma.publication.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { abstract: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { instance: { include: { venue: true } } },
      });

      results = publications.map((pub) => ({
        id: pub.id,
        title: pub.title,
        snippet: pub.abstract?.slice(0, 200) || "",
        meta: [
          pub.instance?.venue?.abbreviation || pub.instance?.venue?.name,
          pub.authors?.slice(0, 3).join(", "),
        ]
          .filter(Boolean)
          .join(" · "),
        url: pub.pdfUrl || undefined,
        sourceType: "publication" as const,
      }));
    } else if (sourceType === "wechat") {
      // Search WeChat articles via external DB
      const articles = await searchWechatArticles(query, 10);

      results = articles.map((article) => ({
        id: String(article.id),
        title: article.title,
        snippet: article.content_text?.slice(0, 200) || "",
        meta: [
          "WeChat",
          article.source_name || article.author,
          article.publish_time
            ? new Date(article.publish_time).toLocaleDateString()
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
        url: article.original_url || undefined,
        sourceType: "wechat" as const,
      }));
    }

    task.results = results;
    task.status = "completed";
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Search failed";
  }
}
```

- [ ] **Step 2: Create GET status/results polling route**

```ts
// app/api/notebooks/[id]/sources/search/[taskId]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { searchTasks } from "../route";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { taskId } = await params;
  const task = searchTasks.get(taskId);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const { notebookId, ...response } = task;

  // Clean up completed/failed tasks after 5 minutes
  if (task.status === "completed" || task.status === "failed") {
    setTimeout(() => searchTasks.delete(taskId), 5 * 60 * 1000);
  }

  return NextResponse.json(response);
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors in the new route files

- [ ] **Step 4: Commit**

```bash
git add app/api/notebooks/\[id\]/sources/search/
git commit -m "feat(deepdive): add search API routes for source modal"
```

---

### Task 4: New Server Actions for Publication and WeChat Sources

**Files:**
- Modify: `lib/actions/sources.ts`

- [ ] **Step 1: Add `addPublicationSource` server action**

Add after the existing `uploadDocumentSource` function in `lib/actions/sources.ts`:

```ts
export async function addPublicationSource(
  notebookId: string,
  publicationId: string,
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });
  if (!notebook) {
    throw new Error("Notebook not found");
  }

  // Fetch publication
  const publication = await prisma.publication.findUnique({
    where: { id: publicationId },
  });
  if (!publication) {
    throw new Error("Publication not found");
  }

  if (!publication.pdfUrl) {
    throw new Error("Publication has no PDF URL");
  }

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: publication.title,
      sourceType: "DOCUMENT",
      url: publication.pdfUrl,
      status: "PROCESSING",
    },
  });

  revalidatePath(`/deepdive/${notebookId}`);

  // Download PDF and process in background
  const context: ProcessingContext = {
    sourceId: source.id,
    notebookId,
  };

  (async () => {
    try {
      const response = await fetch(publication.pdfUrl!);
      if (!response.ok) throw new Error(`Failed to download PDF: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], `${publication.title}.pdf`, {
        type: "application/pdf",
      });
      await processPdfDocument(file, context);
    } catch (err) {
      console.error("[addPublicationSource] Failed:", err);
      await prisma.source.update({
        where: { id: source.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Processing failed",
        },
      });
    } finally {
      try {
        revalidatePath(`/deepdive/${notebookId}`);
      } catch {
        // Ignore revalidation errors in background context
      }
    }
  })();

  return source;
}
```

- [ ] **Step 2: Add `addWechatSource` server action**

Add after `addPublicationSource` in the same file:

```ts
export async function addWechatSource(
  notebookId: string,
  articleId: number,
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });
  if (!notebook) {
    throw new Error("Notebook not found");
  }

  // Fetch article from WeChat DB
  const { getWechatArticleById, getWechatArticleImages } = await import(
    "@/lib/services/wechat-client"
  );

  const article = await getWechatArticleById(articleId);
  if (!article) {
    throw new Error("WeChat article not found");
  }

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: article.title,
      sourceType: "WEBPAGE",
      url: article.original_url,
      status: "PROCESSING",
    },
  });

  revalidatePath(`/deepdive/${notebookId}`);

  // Process in background: convert HTML to markdown, store images
  const context: ProcessingContext = {
    sourceId: source.id,
    notebookId,
  };

  (async () => {
    try {
      // Simple HTML to text conversion (content_text is already available)
      const markdownContent = article.content_text || article.content_html;

      // Fetch and store images
      const images = await getWechatArticleImages(articleId);
      for (const img of images) {
        if (img.data) {
          await prisma.sourceImage.create({
            data: {
              sourceId: source.id,
              mimeType: img.mime_type || "image/jpeg",
              width: 0,
              height: 0,
              data: img.data,
            },
          });
        }
      }

      // Update source with content
      await prisma.source.update({
        where: { id: source.id },
        data: {
          content: markdownContent,
          markdownContent: markdownContent,
          status: "READY",
          metadata: {
            author: article.author,
            publishDate: article.publish_time?.toISOString(),
            sourceName: article.source_name,
          },
        },
      });

      // Trigger wiki ingest
      try {
        const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
        await ingestSourceToWiki(notebookId, source.id, article.title, markdownContent);
      } catch (wikiErr) {
        console.error("[addWechatSource] Wiki ingest failed:", wikiErr);
      }
    } catch (err) {
      console.error("[addWechatSource] Failed:", err);
      await prisma.source.update({
        where: { id: source.id },
        data: {
          status: "FAILED",
          errorMessage: err instanceof Error ? err.message : "Processing failed",
        },
      });
    } finally {
      try {
        revalidatePath(`/deepdive/${notebookId}`);
      } catch {
        // Ignore revalidation errors in background context
      }
    }
  })();

  return source;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add lib/actions/sources.ts
git commit -m "feat(deepdive): add publication and WeChat source server actions"
```

---

### Task 5: Rewrite AddSourceDialog Component

**Files:**
- Create: `components/deepdive/sources/add-source-dialog.tsx`
- Modify: `components/deepdive/sources/sources-panel.tsx`

This is the main UI task. The new dialog replaces the old tab-based modal with the unified search-first layout.

- [ ] **Step 1: Create the new AddSourceDialog component**

```tsx
// components/deepdive/sources/add-source-dialog.tsx
"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import {
  Globe,
  BookOpen,
  MessageCircle,
  Search,
  ArrowRight,
  Upload,
  Link,
  Loader2,
  X,
  Check,
  ChevronDown,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  addWebpageSource,
  uploadDocumentSource,
  addPublicationSource,
  addWechatSource,
} from "@/lib/actions/sources";
import type { Source as PrismaSource } from "@prisma/client";
import type {
  SourceSearchType,
  SearchResult,
  SearchStatusResponse,
} from "@/lib/types/search";

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

export function AddSourceDialog({
  notebookId,
  open,
  onOpenChange,
}: AddSourceDialogProps) {
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
  const [url, setUrl] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
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
          const statusRes = await fetch(
            `/api/notebooks/${notebookId}/sources/search/${taskId}`,
          );
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
        // Create optimistic source
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

  // File upload handlers (preserved from existing logic)
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

  const handleUrlSubmit = () => {
    if (!url.trim()) return;

    startTransition(async () => {
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

      queryClient.setQueryData<Source[] | undefined>(
        ["notebook-sources", notebookId],
        (current) => [optimistic, ...(current || [])],
      );
      onOpenChange(false);

      try {
        await addWebpageSource(notebookId, url.trim());
      } finally {
        await queryClient.invalidateQueries({
          queryKey: ["notebook-sources", notebookId],
        });
        setUrl("");
        setShowUrlInput(false);
      }
    });
  };

  const currentSourceOption = SOURCE_TYPE_OPTIONS.find(
    (o) => o.value === sourceType,
  )!;

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
      <DialogContent className="sm:max-w-[560px] p-0 gap-0 overflow-hidden">
        {/* Search Section */}
        <div className="p-6 pb-4">
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
                      sourceType === option.value
                        ? "bg-accent/50"
                        : "hover:bg-accent/30"
                    }`}
                    onClick={() => handleSourceTypeChange(option.value)}
                  >
                    <option.icon className="h-5 w-5 shrink-0" />
                    <div>
                      <div className="text-sm font-semibold">{option.label}</div>
                      <div className="text-xs text-muted-foreground">
                        {option.description}
                      </div>
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

        {/* Content Area: Results or Drop Zone */}
        {view === "idle" && !showUrlInput ? (
          <>
            {/* Drop Zone */}
            <div
              className="mx-6 my-4 p-8 border-2 border-dashed border-border rounded-xl text-center cursor-pointer hover:border-foreground/30 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <p className="text-lg text-muted-foreground">or drop your files</p>
              <p className="text-xs text-muted-foreground mt-1">
                pdf, docx, txt, md
              </p>
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
                onClick={() => setShowUrlInput(true)}
              >
                <Link className="h-4 w-4" />
                Paste URL
              </button>
            </div>
          </>
        ) : view === "idle" && showUrlInput ? (
          /* URL Input Mode */
          <div className="px-6 py-4">
            <div className="flex items-center gap-2">
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleUrlSubmit();
                  }
                }}
                disabled={isPending}
                autoFocus
              />
              <Button
                size="sm"
                disabled={isPending || !url.trim()}
                onClick={handleUrlSubmit}
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Add"
                )}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowUrlInput(false);
                  setUrl("");
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Enter a webpage URL or document link (PDF, DOCX, TXT, MD)
            </p>
          </div>
        ) : (
          /* Search Results */
          <div className="px-6 py-4 max-h-80 overflow-y-auto">
            {isSearching && results.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Searching...
                </span>
              </div>
            )}

            {searchError && (
              <div className="text-sm text-destructive text-center py-4">
                {searchError}
              </div>
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

            {/* Add Selected Button */}
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

            {/* Back to idle link */}
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
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Update sources-panel.tsx to use new component**

In `components/deepdive/sources/sources-panel.tsx`:

1. Remove the old `AddSourceDialog` function (lines 497-956)
2. Replace the import and usage:

Add import at top:
```ts
import { AddSourceDialog } from "@/components/deepdive/sources/add-source-dialog";
```

Remove these now-unused imports: `Input`, `Tabs`, `TabsContent`, `TabsList`, `TabsTrigger`, `Upload`, `Link`

The `<AddSourceDialog>` JSX usage at line 182-186 stays the same (same props interface).

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 4: Visual check**

Run: `cd /Users/eason/Documents/HW-Project/deepsight-all/SparkFlow/apps/web && npm run dev`

Open a notebook, click the "+" button in Sources panel, verify:
- Search bar renders with source type dropdown
- Source type dropdown shows Web/Publication/WeChat options
- Domain filter appears when Web is selected
- Drop zone and bottom actions render correctly
- File upload still works
- URL paste still works

- [ ] **Step 5: Commit**

```bash
git add components/deepdive/sources/add-source-dialog.tsx components/deepdive/sources/sources-panel.tsx
git commit -m "feat(deepdive): rewrite add source dialog with unified search UI"
```

---

### Task 6: Integration Test and Polish

**Files:**
- Possibly modify: `components/deepdive/sources/add-source-dialog.tsx`

- [ ] **Step 1: Test the full search flow**

1. Start dev server: `npm run dev`
2. Open a notebook
3. Click "+" to open Add Source dialog
4. Select "Publication" from dropdown
5. Type a search query (e.g., a keyword from a known publication title)
6. Verify results appear and can be selected
7. Click "Add selected" and verify source appears in sources panel with PROCESSING status

- [ ] **Step 2: Test WeChat search flow**

1. Ensure `WECHAT_DB_*` env vars are set in `.env.local`
2. Select "WeChat Article" from dropdown
3. Search for a known article
4. Verify results render with correct metadata
5. Add a result and verify it processes correctly

- [ ] **Step 3: Test web search flow**

1. Select "Web" from dropdown
2. Add a domain filter (e.g., "arxiv.org")
3. Search for a topic
4. Verify results come from the agent (depends on agent being configured — may initially fail)
5. If agent is not yet configured, verify the error is handled gracefully

- [ ] **Step 4: Test file upload and URL paste (regression)**

1. Verify drag-and-drop file upload still works
2. Verify "Upload files" button opens file picker
3. Verify "Paste URL" opens URL input and submission works
4. Verify optimistic updates and polling work as before

- [ ] **Step 5: Fix any issues found during testing**

Address any UI glitches, TypeScript errors, or functional issues.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "fix(deepdive): polish add source modal after integration testing"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Shared types | `lib/types/search.ts` |
| 2 | WeChat DB client | `lib/services/wechat-client.ts` |
| 3 | Search API routes | `app/api/notebooks/[id]/sources/search/` |
| 4 | Server actions for Publication + WeChat | `lib/actions/sources.ts` |
| 5 | Rewrite AddSourceDialog UI | `components/deepdive/sources/add-source-dialog.tsx`, `sources-panel.tsx` |
| 6 | Integration test and polish | Various |

Tasks 1-4 are backend/infrastructure and can be parallelized. Task 5 depends on Tasks 1 and 4. Task 6 depends on all previous tasks.
