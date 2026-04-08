# LLM Wiki Frontend Implementation Plan (Plan B)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Wiki tab to notebook sources panel, wiki page viewer with `[[link]]` rendering, "Save to wiki" button on chat messages, and collection search in Add Source modal.

**Architecture:** Wiki tab sits alongside Sources tab in the existing sources panel. Wiki pages fetched via React Query from `/api/notebooks/[id]/wiki`. Wiki page viewer reuses existing Markdown component with custom `[[slug]]` link rendering. Chat messages get a "Save to wiki" action button.

**Tech Stack:** React 19, Next.js 16, React Query, shadcn/ui, existing Markdown component

**Spec:** `docs/superpowers/specs/2026-04-07-llm-wiki-notebook-design.md`
**Depends on:** Plan A (wiki backend) — completed

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/web/components/deepdive/wiki/wiki-panel.tsx` | Wiki tab content: page list + page viewer |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/components/deepdive/sources/sources-panel.tsx` | Add tab bar switching between Sources and Wiki |
| `apps/web/components/ui/markdown.tsx` | Add `[[slug]]` wiki link rendering alongside existing `[ref:id]` citations |
| `apps/web/components/deepdive/chat/chat-panel.tsx` | Add "Save to wiki" button on AI messages |
| `apps/web/app/[locale]/deepdive/[id]/page.tsx` | Fetch wiki pages in initial data load |
| `apps/web/components/deepdive/notebook-layout.tsx` | Pass wiki pages to sources panel |

---

## Task 1: Wiki Panel Component

**Files:**
- Create: `apps/web/components/deepdive/wiki/wiki-panel.tsx`

- [ ] **Step 1: Create the wiki panel**

Create `apps/web/components/deepdive/wiki/wiki-panel.tsx`:

```tsx
"use client";

import { useState, useMemo, useCallback, useTransition, memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, FileText, GitCompare, Lightbulb, Users, ScrollText } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";

interface WikiPage {
  id: string;
  slug: string;
  title: string;
  content?: string;
  pageType: string;
  sourceRefs: string[];
  updatedAt: string;
}

interface WikiPanelProps {
  notebookId: string;
  initialPages?: WikiPage[];
}

const PAGE_TYPE_ICONS: Record<string, typeof FileText> = {
  ENTITY: Users,
  CONCEPT: Lightbulb,
  SUMMARY: FileText,
  COMPARISON: GitCompare,
  INDEX: BookOpen,
  LOG: ScrollText,
};

const PAGE_TYPE_LABELS: Record<string, string> = {
  ENTITY: "Entities",
  CONCEPT: "Concepts",
  SUMMARY: "Summaries",
  COMPARISON: "Comparisons",
};

export function WikiPanel({ notebookId, initialPages = [] }: WikiPanelProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { data: pages = initialPages } = useQuery<WikiPage[]>({
    queryKey: ["wiki-pages", notebookId],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki`);
      if (!res.ok) throw new Error("Failed to fetch wiki pages");
      const json = await res.json();
      return json.pages || [];
    },
    initialData: initialPages,
    refetchInterval: false,
  });

  // Group pages by type (exclude INDEX and LOG from main list)
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

  if (selectedSlug) {
    return (
      <WikiPageView
        notebookId={notebookId}
        slug={selectedSlug}
        onBack={() => setSelectedSlug(null)}
        onNavigate={(slug) => setSelectedSlug(slug)}
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
            WIKI
          </h2>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {pages.filter((p) => p.pageType !== "INDEX" && p.pageType !== "LOG").length} pages
        </span>
      </div>

      {/* Index link */}
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

      {/* Pages grouped by type */}
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
  onBack,
  onNavigate,
}: {
  notebookId: string;
  slug: string;
  onBack: () => void;
  onNavigate: (slug: string) => void;
}) {
  const { data: page, isLoading } = useQuery<WikiPage & { content: string }>({
    queryKey: ["wiki-page", notebookId, slug],
    queryFn: async () => {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`);
      if (!res.ok) throw new Error("Failed to fetch wiki page");
      return res.json();
    },
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="px-6 pt-3 pb-3 flex items-center gap-2">
        <button
          onClick={onBack}
          className="h-7 w-7 flex items-center justify-center rounded-[4px] hover:bg-accent/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-[13px] font-semibold truncate">
          {page?.title || slug}
        </h2>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        ) : page?.content ? (
          <WikiMarkdown
            content={page.content}
            onNavigate={onNavigate}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No content</p>
        )}
      </div>
    </div>
  );
}

function WikiMarkdown({
  content,
  onNavigate,
}: {
  content: string;
  onNavigate: (slug: string) => void;
}) {
  // Replace [[slug]] with clickable links before passing to Markdown
  const processed = content.replace(
    /\[\[([a-zA-Z0-9_-]+)\]\]/g,
    (_, slug) => `<wiki-link data-slug="${slug}">${slug.replace(/-/g, " ")}</wiki-link>`
  );

  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none"
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.tagName === "WIKI-LINK" || target.closest("wiki-link")) {
          const el = target.tagName === "WIKI-LINK" ? target : target.closest("wiki-link")!;
          const slug = el.getAttribute("data-slug");
          if (slug) {
            e.preventDefault();
            onNavigate(slug);
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
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/deepdive/wiki/
git commit -m "feat(ui): add WikiPanel component with page list and viewer"
```

---

## Task 2: Add Tab Bar to Sources Panel

**Files:**
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx`

- [ ] **Step 1: Add tab state and WikiPanel import**

At the top of the file, add:
```typescript
import { WikiPanel } from "@/components/deepdive/wiki/wiki-panel";
```

In the `SourcesPanel` component, add tab state:
```typescript
const [activeTab, setActiveTab] = useState<"sources" | "wiki">("sources");
```

- [ ] **Step 2: Add tab bar to the JSX**

In the SourcesPanel component, when NOT showing a selected source (the list view), wrap the existing content with a tab bar. Replace the header section with:

```tsx
{/* Tab Bar */}
<div className="px-6 pt-3 pb-1 flex items-center gap-1">
  <button
    className={`px-3 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
      activeTab === "sources"
        ? "text-foreground bg-accent/20"
        : "text-muted-foreground hover:text-foreground"
    }`}
    onClick={() => setActiveTab("sources")}
  >
    Sources
  </button>
  <button
    className={`px-3 py-1 text-[11px] font-semibold tracking-[2px] uppercase font-mono rounded-[4px] transition-colors ${
      activeTab === "wiki"
        ? "text-foreground bg-accent/20"
        : "text-muted-foreground hover:text-foreground"
    }`}
    onClick={() => setActiveTab("wiki")}
  >
    Wiki
  </button>
</div>
```

Then conditionally render based on activeTab:
- If `activeTab === "sources"`: render existing sources list + add button
- If `activeTab === "wiki"`: render `<WikiPanel notebookId={notebookId} />`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deepdive/sources/sources-panel.tsx
git commit -m "feat(ui): add Sources/Wiki tab bar to sources panel"
```

---

## Task 3: "Save to Wiki" Button on Chat Messages

**Files:**
- Modify: `apps/web/components/deepdive/chat/chat-panel.tsx`

- [ ] **Step 1: Add "Save to Wiki" button next to existing "Save to Studio" button**

In the AI message action buttons section (around line 645-681), there are already "SAVE TO STUDIO" and "COPY" buttons on hover. Add a "SAVE TO WIKI" button between them.

Find the existing action buttons pattern and add:

```tsx
<button
  className="flex items-center gap-1 text-[10px] font-mono tracking-wider text-muted-foreground hover:text-foreground transition-colors"
  onClick={() => handleSaveToWiki(getMessageContent(msg))}
>
  <BookOpen className="h-3 w-3" />
  SAVE TO WIKI
</button>
```

Add the handler function:
```typescript
const handleSaveToWiki = async (content: string) => {
  try {
    const slug = `synthesis-${Date.now()}`;
    await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: content.slice(0, 60).replace(/[#*\n]/g, "").trim() + "...",
        content,
        pageType: "COMPARISON",
        sourceRefs: [],
      }),
    });
    // Trigger wiki index update in background
    fetch(`/api/notebooks/${notebookId}/wiki/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry: `saved | Chat synthesis saved as [[${slug}]]` }),
    }).catch(() => {});
  } catch (error) {
    console.error("Failed to save to wiki:", error);
  }
};
```

Add `BookOpen` to the lucide-react imports.

- [ ] **Step 2: Commit**

```bash
git add apps/web/components/deepdive/chat/chat-panel.tsx
git commit -m "feat(chat): add Save to Wiki button on AI messages"
```

---

## Task 4: Fetch Wiki Pages in Notebook Page

**Files:**
- Modify: `apps/web/app/[locale]/deepdive/[id]/page.tsx`
- Modify: `apps/web/components/deepdive/notebook-layout.tsx`

- [ ] **Step 1: Fetch wiki pages in page.tsx**

In the `Promise.all` data fetching block, add a wiki pages query:

```typescript
prisma.wikiPage.findMany({
  where: { notebookId: id },
  select: {
    id: true,
    slug: true,
    title: true,
    pageType: true,
    sourceRefs: true,
    updatedAt: true,
  },
  orderBy: { updatedAt: "desc" },
})
```

Pass the result as `wikiPages` prop to NotebookLayout.

- [ ] **Step 2: Update NotebookLayout to accept and pass wikiPages**

Add `wikiPages` to NotebookLayoutProps and pass it through to SourcesPanel as a prop. SourcesPanel then passes it to WikiPanel as `initialPages`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/[locale]/deepdive/[id]/page.tsx apps/web/components/deepdive/notebook-layout.tsx
git commit -m "feat: pass initial wiki pages from server to notebook layout"
```

---

## Task 5: Verification

- [ ] **Step 1: TypeScript check**
```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 2: Push**
```bash
git push origin feature/global-knowledge-base
```
