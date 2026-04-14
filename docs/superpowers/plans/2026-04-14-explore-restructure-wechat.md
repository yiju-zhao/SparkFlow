# Explore Restructure + WeChat Articles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Research Hub navigation to group Publications and Sessions under Conferences with dropdown menus, and add a Social Media section with a WeChat Articles page that reads from an external database.

**Architecture:** The nav in `components/explore/explore-shell.tsx` changes from a flat link array to grouped items with dropdown support, rendered through `LandingHeader`. Route files for publications/sessions physically move under `conferences/`. A new `lib/wechat-db.ts` singleton connects to an external Postgres, with 4 API routes serving articles/sources/images, and 2 new frontend pages (list + detail).

**Tech Stack:** Next.js 16 App Router, `pg` (raw SQL for external DB), next-intl, shadcn/ui, Tailwind 4, DOMPurify (HTML sanitization)

---

## File Map

### Modified files
| File | Change |
|------|--------|
| `components/explore/explore-shell.tsx` | Refactor `useExploreNavLinks()` to grouped structure |
| `components/landing/landing-header.tsx` | Add dropdown rendering for grouped nav items |
| `messages/en.json` | Add Social Media / WeChat translation keys |
| `messages/zh.json` | Add Social Media / WeChat translation keys |
| `apps/web/.env.example` | Add `WECHAT_DATABASE_URL` |

### Moved files (route restructure)
| From | To |
|------|-----|
| `app/[locale]/explore/publications/` | `app/[locale]/explore/conferences/publications/` |
| `app/[locale]/explore/sessions/` | `app/[locale]/explore/conferences/sessions/` |

### New files
| File | Purpose |
|------|---------|
| `lib/wechat-db.ts` | pg Pool singleton for external WeChat DB |
| `lib/wechat/queries.ts` | SQL queries for articles, sources, images |
| `lib/wechat/filters.ts` | Zod schema + parser for WeChat article filters |
| `app/api/wechat/articles/route.ts` | GET list with pagination/filters |
| `app/api/wechat/articles/[id]/route.ts` | GET single article with images |
| `app/api/wechat/sources/route.ts` | GET all sources (for filter dropdown) |
| `app/api/wechat/images/[id]/route.ts` | GET serve image bytea |
| `app/[locale]/explore/social-media/wechat/page.tsx` | Article list page (card grid) |
| `app/[locale]/explore/social-media/wechat/[id]/page.tsx` | Article detail page |
| `app/[locale]/explore/social-media/wechat/loading.tsx` | Loading skeleton |
| `app/[locale]/explore/social-media/wechat/[id]/loading.tsx` | Detail loading skeleton |
| `components/explore/social-media/wechat-article-grid.tsx` | Card grid component |
| `components/explore/social-media/wechat-article-card.tsx` | Individual card |
| `components/explore/social-media/wechat-article-content.tsx` | Sanitized HTML renderer |

---

### Task 1: Move publication and session routes under conferences

**Files:**
- Move: `app/[locale]/explore/publications/` → `app/[locale]/explore/conferences/publications/`
- Move: `app/[locale]/explore/sessions/` → `app/[locale]/explore/conferences/sessions/`

- [ ] **Step 1: Move publication route files**

```bash
cd apps/web
mv app/\[locale\]/explore/publications app/\[locale\]/explore/conferences/publications
```

- [ ] **Step 2: Move session route files**

```bash
cd apps/web
mv app/\[locale\]/explore/sessions app/\[locale\]/explore/conferences/sessions
```

- [ ] **Step 3: Update breadcrumb translations in en.json**

In `messages/en.json`, update these keys under `"explore"`:

```json
"publications": {
  "title": "Publications",
  "subtitle": "Search and discover research publications",
  "breadcrumb": "~/research-hub/conferences/publications",
  "found": "{count} publications found"
},
"sessions": {
  "title": "Sessions",
  "subtitle": "Explore conference sessions and presentations",
  "breadcrumb": "~/research-hub/conferences/sessions"
}
```

- [ ] **Step 4: Update breadcrumb translations in zh.json**

In `messages/zh.json`, update these keys under `"explore"`:

```json
"publications": {
  "title": "论文",
  "subtitle": "搜索和发现研究论文",
  "breadcrumb": "~/研究中心/会议/论文",
  "found": "找到 {count} 篇论文"
},
"sessions": {
  "title": "会议场次",
  "subtitle": "浏览会议场次和演讲",
  "breadcrumb": "~/研究中心/会议/会议场次"
}
```

- [ ] **Step 5: Verify the pages still render**

```bash
cd apps/web && npx tsc --noEmit
```

All imports in the publication/session pages use `@/` aliases, so no import paths need updating after the move.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "refactor(explore): move publications and sessions routes under conferences"
```

---

### Task 2: Refactor header nav to support dropdown groups

**Files:**
- Modify: `apps/web/components/explore/explore-shell.tsx` (rewrite `useExploreNavLinks`)
- Modify: `apps/web/components/landing/landing-header.tsx` (add dropdown rendering)

- [ ] **Step 1: Update nav link data structure in explore-shell.tsx**

Replace the `useExploreNavLinks` hook and update the `LandingHeader` usage. In `components/explore/explore-shell.tsx`, replace lines 22-33:

```typescript
const useExploreNavLinks = () => {
  const t = useTranslations("explore");
  const locale = useLocale();

  return [
    { label: t("overview"), href: `/${locale}/explore` },
    { label: t("conferences.title"), href: `/${locale}/explore/conferences` },
    { label: t("publications.title"), href: `/${locale}/explore/publications` },
    { label: t("sessions.title"), href: `/${locale}/explore/sessions` },
    { label: t("toolbox.title"), href: `/${locale}/explore/toolbox` },
  ];
};
```

with:

```typescript
export interface NavLinkItem {
  label: string;
  href: string;
}

export interface NavLinkGroup {
  label: string;
  href: string;
  children: NavLinkItem[];
}

export type NavLink = NavLinkItem | NavLinkGroup;

function isNavGroup(link: NavLink): link is NavLinkGroup {
  return "children" in link;
}

const useExploreNavLinks = (): NavLink[] => {
  const t = useTranslations("explore");
  const locale = useLocale();

  return [
    { label: t("overview"), href: `/${locale}/explore` },
    {
      label: t("conferences.title"),
      href: `/${locale}/explore/conferences`,
      children: [
        { label: t("overview"), href: `/${locale}/explore/conferences` },
        { label: t("publications.title"), href: `/${locale}/explore/conferences/publications` },
        { label: t("sessions.title"), href: `/${locale}/explore/conferences/sessions` },
      ],
    },
    {
      label: t("socialMedia.title"),
      href: `/${locale}/explore/social-media/wechat`,
      children: [
        { label: t("socialMedia.wechat.title"), href: `/${locale}/explore/social-media/wechat` },
      ],
    },
    { label: t("toolbox.title"), href: `/${locale}/explore/toolbox` },
  ];
};
```

Also export `isNavGroup` for use in `LandingHeader`.

- [ ] **Step 2: Update LandingHeader navLinks type and rendering**

In `components/landing/landing-header.tsx`:

First, update the import and interface. Add at the top after existing imports:

```typescript
import { type NavLink, type NavLinkGroup, isNavGroup } from "@/components/explore/explore-shell";
```

Update the `LandingHeaderProps` interface — change the `navLinks` type:

```typescript
interface LandingHeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  } | null;
  navLinks?: NavLink[];
  isScrolled?: boolean;
  onScrollContainer?: boolean;
  variant?: "landing" | "explore";
}
```

Update the `defaultNavLinks` (line 54-58) to use the flat `NavLink` type (no change needed since flat items are compatible).

Replace the desktop nav rendering (lines 118-136) with:

```tsx
<nav className={cn("hidden items-center justify-center gap-1 md:flex", islandClasses)}>
  {links.map((link) => {
    if (isNavGroup(link)) {
      const group = link as NavLinkGroup;
      const isGroupActive = pathname.startsWith(group.href);
      return (
        <DropdownMenu key={group.href}>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground inline-flex items-center gap-1",
                isGroupActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {group.label}
              <svg width="10" height="10" viewBox="0 0 10 10" className="opacity-50">
                <path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            {group.children.map((child) => {
              const isChildActive = pathname === child.href;
              return (
                <DropdownMenuItem key={child.href} asChild>
                  <Link
                    href={child.href}
                    className={cn(isChildActive && "font-medium")}
                  >
                    {child.label}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    const isActive = pathname === link.href;
    return (
      <Link
        key={link.href}
        href={link.href}
        className={cn(
          "rounded-md px-3 py-2 text-sm transition-colors hover:text-foreground",
          isActive
            ? "text-foreground font-medium"
            : "text-muted-foreground"
        )}
      >
        {link.label}
      </Link>
    );
  })}
</nav>
```

Replace the mobile menu rendering (lines 216-232) with:

```tsx
{links.map((link) => {
  if (isNavGroup(link)) {
    const group = link as NavLinkGroup;
    return (
      <div key={group.href} className="flex flex-col">
        <span className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {group.label}
        </span>
        {group.children.map((child) => {
          const isChildActive = pathname === child.href;
          return (
            <Link
              key={child.href}
              href={child.href}
              className={cn(
                "rounded-md px-6 py-2 text-left text-sm transition-colors hover:text-foreground",
                isChildActive
                  ? "text-foreground font-medium"
                  : "text-muted-foreground"
              )}
            >
              {child.label}
            </Link>
          );
        })}
      </div>
    );
  }
  const isActive = pathname === link.href;
  return (
    <Link
      key={link.href}
      href={link.href}
      className={cn(
        "rounded-md px-3 py-2 text-left text-sm transition-colors hover:text-foreground",
        isActive
          ? "text-foreground font-medium"
          : "text-muted-foreground"
      )}
    >
      {link.label}
    </Link>
  );
})}
```

- [ ] **Step 3: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(explore): add dropdown nav groups for conferences and social media"
```

---

### Task 3: Add i18n keys for Social Media / WeChat

**Files:**
- Modify: `apps/web/messages/en.json`
- Modify: `apps/web/messages/zh.json`

- [ ] **Step 1: Add English translation keys**

In `messages/en.json`, inside the `"explore"` object, add these new keys:

```json
"socialMedia": {
  "title": "Social Media",
  "wechat": {
    "title": "WeChat Articles",
    "subtitle": "Browse articles from WeChat public accounts",
    "breadcrumb": "~/research-hub/social-media/wechat",
    "found": "{count} articles found",
    "source": "Source",
    "dateRange": "Date Range",
    "searchPlaceholder": "Search title or author...",
    "openOriginal": "Original URL",
    "addToNotebook": "Add to Notebook",
    "allSources": "All Sources",
    "noArticles": "No articles found",
    "noArticlesDesc": "Try adjusting your filters or check back later"
  }
}
```

- [ ] **Step 2: Add Chinese translation keys**

In `messages/zh.json`, inside the `"explore"` object, add these new keys:

```json
"socialMedia": {
  "title": "社交媒体",
  "wechat": {
    "title": "微信文章",
    "subtitle": "浏览微信公众号文章",
    "breadcrumb": "~/研究中心/社交媒体/微信文章",
    "found": "找到 {count} 篇文章",
    "source": "公众号",
    "dateRange": "日期范围",
    "searchPlaceholder": "搜索标题或作者...",
    "openOriginal": "查看原文",
    "addToNotebook": "添加到笔记本",
    "allSources": "全部公众号",
    "noArticles": "未找到文章",
    "noArticlesDesc": "请尝试调整筛选条件或稍后再试"
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/messages/en.json apps/web/messages/zh.json && git commit -m "i18n: add social media and wechat article translation keys"
```

---

### Task 4: WeChat database connection and query layer

**Files:**
- Create: `apps/web/lib/wechat-db.ts`
- Create: `apps/web/lib/wechat/queries.ts`
- Create: `apps/web/lib/wechat/filters.ts`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: Add env var to .env.example**

Add this line to `apps/web/.env.example`:

```
# WeChat Articles (external database)
WECHAT_DATABASE_URL=postgresql://user:pass@host:5432/wechat_db
```

- [ ] **Step 2: Create wechat-db.ts connection singleton**

Create `apps/web/lib/wechat-db.ts`:

```typescript
import { Pool } from "pg";

const globalForWechat = globalThis as unknown as {
  wechatPool: Pool | undefined;
};

function createPool() {
  const connectionString = process.env.WECHAT_DATABASE_URL;
  if (!connectionString) {
    throw new Error("WECHAT_DATABASE_URL is not set");
  }
  return new Pool({
    connectionString,
    max: 5,
  });
}

export const wechatPool =
  globalForWechat.wechatPool ?? createPool();

if (process.env.NODE_ENV !== "production") {
  globalForWechat.wechatPool = wechatPool;
}
```

- [ ] **Step 3: Create filters.ts with Zod schema**

Create `apps/web/lib/wechat/filters.ts`:

```typescript
import { z } from "zod";

export const WECHAT_PAGE_SIZE = 24;

export const wechatArticleFiltersSchema = z.object({
  source: z.coerce.number().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().default(0),
});

export type WechatArticleFilters = z.infer<typeof wechatArticleFiltersSchema>;

export function parseWechatArticleFilters(
  searchParams: Record<string, string | string[] | undefined>,
): WechatArticleFilters {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") params[key] = value;
    else if (Array.isArray(value) && value.length > 0) params[key] = value[0];
  }
  return wechatArticleFiltersSchema.parse(params);
}
```

- [ ] **Step 4: Create queries.ts with SQL queries**

Create `apps/web/lib/wechat/queries.ts`:

```typescript
import { wechatPool } from "@/lib/wechat-db";
import { type WechatArticleFilters, WECHAT_PAGE_SIZE } from "./filters";

export interface WechatSource {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export interface WechatArticleSummary {
  id: number;
  title: string;
  author: string;
  publish_time: string | null;
  cover_url: string;
  source_name: string;
  source_id: number;
}

export interface WechatArticleDetail {
  id: number;
  title: string;
  author: string;
  publish_time: string | null;
  original_url: string;
  cover_url: string;
  content_html: string;
  content_text: string;
  source_name: string;
  source_id: number;
  source_slug: string;
  images: { id: number; image_type: string; image_index: number }[];
}

export async function getWechatSources(): Promise<WechatSource[]> {
  const result = await wechatPool.query(
    `SELECT id, slug, name, description
     FROM wechat_articles.sources
     ORDER BY name`
  );
  return result.rows;
}

export async function getWechatArticles(
  filters: WechatArticleFilters
): Promise<{ articles: WechatArticleSummary[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.source) {
    conditions.push(`a.source_id = $${paramIndex++}`);
    values.push(filters.source);
  }
  if (filters.dateFrom) {
    conditions.push(`a.publish_time >= $${paramIndex++}`);
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`a.publish_time <= $${paramIndex++}`);
    values.push(filters.dateTo + " 23:59:59");
  }
  if (filters.search) {
    conditions.push(`(a.title ILIKE $${paramIndex} OR a.author ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await wechatPool.query(
    `SELECT COUNT(*)::int as total FROM wechat_articles.articles a ${whereClause}`,
    values
  );
  const total = countResult.rows[0].total;

  const offset = filters.page * WECHAT_PAGE_SIZE;
  const dataResult = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.cover_url,
            s.name as source_name, a.source_id
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON s.id = a.source_id
     ${whereClause}
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, WECHAT_PAGE_SIZE, offset]
  );

  return { articles: dataResult.rows, total };
}

export async function getWechatArticle(
  id: number
): Promise<WechatArticleDetail | null> {
  const articleResult = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text,
            s.name as source_name, s.id as source_id, s.slug as source_slug
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON s.id = a.source_id
     WHERE a.id = $1`,
    [id]
  );

  if (articleResult.rows.length === 0) return null;

  const imageResult = await wechatPool.query(
    `SELECT id, image_type, image_index
     FROM wechat_articles.images
     WHERE article_id = $1
     ORDER BY image_index`,
    [id]
  );

  return {
    ...articleResult.rows[0],
    images: imageResult.rows,
  };
}

export async function getWechatImage(
  id: number
): Promise<{ data: Buffer; mime_type: string } | null> {
  const result = await wechatPool.query(
    `SELECT data, mime_type FROM wechat_articles.images WHERE id = $1`,
    [id]
  );
  if (result.rows.length === 0 || !result.rows[0].data) return null;
  return result.rows[0];
}
```

- [ ] **Step 5: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(wechat): add database connection, query layer, and filter schema"
```

---

### Task 5: WeChat API routes

**Files:**
- Create: `apps/web/app/api/wechat/articles/route.ts`
- Create: `apps/web/app/api/wechat/articles/[id]/route.ts`
- Create: `apps/web/app/api/wechat/sources/route.ts`
- Create: `apps/web/app/api/wechat/images/[id]/route.ts`

- [ ] **Step 1: Create articles list route**

Create `apps/web/app/api/wechat/articles/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatArticles } from "@/lib/wechat/queries";
import { parseWechatArticleFilters } from "@/lib/wechat/filters";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const filters = parseWechatArticleFilters(searchParams);
  const result = await getWechatArticles(filters);

  return NextResponse.json(result);
}
```

- [ ] **Step 2: Create single article route**

Create `apps/web/app/api/wechat/articles/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatArticle } from "@/lib/wechat/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const article = await getWechatArticle(articleId);
  if (!article) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  return NextResponse.json(article);
}
```

- [ ] **Step 3: Create sources route**

Create `apps/web/app/api/wechat/sources/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getWechatSources } from "@/lib/wechat/queries";

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await getWechatSources();
  return NextResponse.json(sources);
}
```

- [ ] **Step 4: Create image serving route**

Create `apps/web/app/api/wechat/images/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getWechatImage } from "@/lib/wechat/queries";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const imageId = parseInt(id, 10);
  if (isNaN(imageId)) {
    return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  }

  const image = await getWechatImage(imageId);
  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mime_type,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 5: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(wechat): add API routes for articles, sources, and images"
```

---

### Task 6: WeChat article list page (card grid)

**Files:**
- Create: `apps/web/components/explore/social-media/wechat-article-card.tsx`
- Create: `apps/web/components/explore/social-media/wechat-article-grid.tsx`
- Create: `apps/web/app/[locale]/explore/social-media/wechat/page.tsx`
- Create: `apps/web/app/[locale]/explore/social-media/wechat/loading.tsx`

- [ ] **Step 1: Create the article card component**

Create `apps/web/components/explore/social-media/wechat-article-card.tsx`:

```tsx
import Link from "next/link";
import Image from "next/image";
import { useLocale } from "next-intl";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface WechatArticleCardProps {
  article: WechatArticleSummary;
}

export function WechatArticleCard({ article }: WechatArticleCardProps) {
  const locale = useLocale();
  const publishDate = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <Link
      href={`/${locale}/explore/social-media/wechat/${article.id}`}
      className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-md"
    >
      {/* Cover image */}
      <div className="relative h-40 w-full bg-muted overflow-hidden">
        {article.cover_url ? (
          <img
            src={article.cover_url}
            alt=""
            className="h-full w-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No Cover
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-1 flex-col p-4">
        <h3 className="text-sm font-medium leading-snug line-clamp-2 group-hover:text-foreground">
          {article.title}
        </h3>
        <div className="mt-auto flex items-center justify-between pt-3">
          <span className="rounded bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
            {article.source_name}
          </span>
          {publishDate && (
            <span className="text-xs text-muted-foreground">{publishDate}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: Create the grid component**

Create `apps/web/components/explore/social-media/wechat-article-grid.tsx`:

```tsx
"use client";

import { WechatArticleCard } from "./wechat-article-card";
import type { WechatArticleSummary } from "@/lib/wechat/queries";

interface WechatArticleGridProps {
  articles: WechatArticleSummary[];
}

export function WechatArticleGrid({ articles }: WechatArticleGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {articles.map((article) => (
        <WechatArticleCard key={article.id} article={article} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create the list page**

Create `apps/web/app/[locale]/explore/social-media/wechat/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getWechatArticles, getWechatSources } from "@/lib/wechat/queries";
import { parseWechatArticleFilters, WECHAT_PAGE_SIZE } from "@/lib/wechat/filters";
import { WechatArticleGrid } from "@/components/explore/social-media/wechat-article-grid";
import { Pagination, EmptyState } from "@/components/explore/shared";
import { WechatFilterBar } from "./wechat-filter-bar";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WechatArticlesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parseWechatArticleFilters(searchParamsResolved);
  const t = await getTranslations("explore");

  const [{ articles, total }, sources] = await Promise.all([
    getWechatArticles(filters),
    getWechatSources(),
  ]);

  const totalPages = Math.ceil(total / WECHAT_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          {t("socialMedia.wechat.breadcrumb")}
        </p>
        <h1 className="text-4xl font-bold tracking-tight">
          {t("socialMedia.wechat.title")}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("socialMedia.wechat.found", { count: total.toLocaleString() })}
        </p>
      </div>

      {/* Filters */}
      <WechatFilterBar sources={sources} />

      {/* Articles */}
      {articles.length === 0 ? (
        <EmptyState
          title={t("socialMedia.wechat.noArticles")}
          description={t("socialMedia.wechat.noArticlesDesc")}
          icon="inbox"
        />
      ) : (
        <>
          <WechatArticleGrid articles={articles} />
          {totalPages > 1 && (
            <Pagination
              currentPage={filters.page}
              totalPages={totalPages}
              totalItems={total}
              pageSize={WECHAT_PAGE_SIZE}
            />
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create the custom filter bar for WeChat**

The existing `FilterBar` uses shadcn Select dropdowns, but we also need a text search input and a date range. Create a colocated client component at `apps/web/app/[locale]/explore/social-media/wechat/wechat-filter-bar.tsx`:

```tsx
"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { X, Search } from "lucide-react";
import type { WechatSource } from "@/lib/wechat/queries";

interface WechatFilterBarProps {
  sources: WechatSource[];
}

export function WechatFilterBar({ sources }: WechatFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const t = useTranslations("explore.socialMedia.wechat");

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("page", "0");
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.push(pathname);
    });
  };

  const hasFilters = searchParams.has("source") || searchParams.has("dateFrom") || searchParams.has("dateTo") || searchParams.has("search");

  return (
    <div className={`flex flex-wrap items-center gap-3 ${isPending ? "opacity-70" : ""}`}>
      {/* Source filter */}
      <Select
        value={searchParams.get("source") || "all"}
        onValueChange={(v) => updateParam("source", v === "all" ? null : v)}
      >
        <SelectTrigger className="w-45">
          <SelectValue placeholder={t("source")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("allSources")}</SelectItem>
          {sources.map((s) => (
            <SelectItem key={s.id} value={s.id.toString()}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Date from */}
      <Input
        type="date"
        value={searchParams.get("dateFrom") || ""}
        onChange={(e) => updateParam("dateFrom", e.target.value || null)}
        className="w-40"
      />

      {/* Date to */}
      <Input
        type="date"
        value={searchParams.get("dateTo") || ""}
        onChange={(e) => updateParam("dateTo", e.target.value || null)}
        className="w-40"
      />

      {/* Search */}
      <div className="relative flex-1 min-w-48">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("searchPlaceholder")}
          defaultValue={searchParams.get("search") || ""}
          className="pl-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              updateParam("search", (e.target as HTMLInputElement).value || null);
            }
          }}
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearAll} className="h-10">
          <X className="h-4 w-4 mr-1" />
          {t("source") === "Source" ? "Clear" : "清除"}
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create loading skeleton**

Create `apps/web/app/[locale]/explore/social-media/wechat/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function WechatLoading() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <Skeleton className="h-4 w-60 mb-2" />
        <Skeleton className="h-10 w-80" />
        <Skeleton className="h-4 w-40 mt-2" />
      </div>
      <div className="flex gap-3">
        <Skeleton className="h-10 w-45" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-10 flex-1" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border overflow-hidden">
            <Skeleton className="h-40 w-full" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-5 w-20" />
                <Skeleton className="h-4 w-16" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(wechat): add article list page with card grid and filters"
```

---

### Task 7: WeChat article detail page

**Files:**
- Create: `apps/web/components/explore/social-media/wechat-article-content.tsx`
- Create: `apps/web/app/[locale]/explore/social-media/wechat/[id]/page.tsx`
- Create: `apps/web/app/[locale]/explore/social-media/wechat/[id]/loading.tsx`
- Create: `apps/web/app/[locale]/explore/social-media/wechat/[id]/not-found.tsx`

- [ ] **Step 1: Install DOMPurify for HTML sanitization**

```bash
cd apps/web && npm install dompurify && npm install -D @types/dompurify
```

- [ ] **Step 2: Create the HTML content renderer**

Create `apps/web/components/explore/social-media/wechat-article-content.tsx`:

```tsx
"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef } from "react";

interface WechatArticleContentProps {
  html: string;
  fallbackText: string;
}

export function WechatArticleContent({ html, fallbackText }: WechatArticleContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    // Rewrite WeChat image URLs to use our proxy
    const images = containerRef.current.querySelectorAll("img");
    images.forEach((img) => {
      const src = img.getAttribute("src") || img.getAttribute("data-src") || "";
      if (src.includes("mmbiz.qpic.cn") || src.includes("mmbiz.qlogo.cn")) {
        // These are WeChat CDN images — they'll be blocked by CORS/referrer policy
        // The content_html from the scraper should already have local image references
        // but if not, hide broken images gracefully
        img.onerror = () => {
          img.style.display = "none";
        };
      }
    });
  }, [html]);

  if (!html) {
    return (
      <div className="whitespace-pre-wrap text-foreground leading-relaxed">
        {fallbackText}
      </div>
    );
  }

  const clean = DOMPurify.sanitize(html, {
    ADD_TAGS: ["section"],
    ADD_ATTR: ["data-src"],
  });

  return (
    <div
      ref={containerRef}
      className="wechat-article-content prose prose-sm max-w-none
        prose-headings:text-foreground prose-p:text-foreground/90
        prose-a:text-accent-red prose-img:rounded-lg prose-img:mx-auto
        prose-blockquote:border-accent-red/30 prose-blockquote:text-muted-foreground"
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
```

- [ ] **Step 3: Create the detail page**

Create `apps/web/app/[locale]/explore/social-media/wechat/[id]/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getWechatArticle } from "@/lib/wechat/queries";
import { WechatArticleContent } from "@/components/explore/social-media/wechat-article-content";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WechatArticleDetailPage({ params }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const articleId = parseInt(id, 10);
  if (isNaN(articleId)) notFound();

  const article = await getWechatArticle(articleId);
  if (!article) notFound();

  const t = await getTranslations("explore.socialMedia.wechat");

  const publishDate = article.publish_time
    ? new Date(article.publish_time).toLocaleDateString(locale === "zh" ? "zh-CN" : "en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Breadcrumb */}
      <p className="text-sm text-muted-foreground">
        {t("breadcrumb")}/{article.source_name}
      </p>

      {/* Title */}
      <h1 className="text-3xl font-bold tracking-tight leading-tight">
        {article.title}
      </h1>

      {/* Meta row */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge variant="secondary">{article.source_name}</Badge>
        {article.author && (
          <span className="text-sm text-muted-foreground">{article.author}</span>
        )}
        {publishDate && (
          <>
            <span className="text-muted-foreground">·</span>
            <span className="text-sm text-muted-foreground">{publishDate}</span>
          </>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        {article.original_url && (
          <Button variant="outline" size="sm" asChild>
            <a href={article.original_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              {t("openOriginal")}
            </a>
          </Button>
        )}
      </div>

      {/* Article content card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {/* Cover image */}
        {article.cover_url && (
          <img
            src={article.cover_url}
            alt=""
            className="w-full max-h-80 object-cover"
          />
        )}

        {/* Article body */}
        <div className="p-6 md:p-10">
          <WechatArticleContent
            html={article.content_html}
            fallbackText={article.content_text}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create detail loading skeleton**

Create `apps/web/app/[locale]/explore/social-media/wechat/[id]/loading.tsx`:

```tsx
import { Skeleton } from "@/components/ui/skeleton";

export default function WechatDetailLoading() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-9 w-full max-w-xl" />
      <div className="flex gap-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-8 w-32" />
      <div className="rounded-xl border border-border overflow-hidden">
        <Skeleton className="h-60 w-full" />
        <div className="p-10 space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create not-found page**

Create `apps/web/app/[locale]/explore/social-media/wechat/[id]/not-found.tsx`:

```tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function WechatArticleNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <h2 className="text-2xl font-bold mb-2">Article Not Found</h2>
      <p className="text-muted-foreground mb-6">
        This article may have been removed or the link is incorrect.
      </p>
      <Button variant="outline" asChild>
        <Link href="/explore/social-media/wechat">Back to Articles</Link>
      </Button>
    </div>
  );
}
```

- [ ] **Step 6: Type check**

```bash
cd apps/web && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat(wechat): add article detail page with HTML content rendering"
```

---

### Task 8: Update environment docs and CLAUDE.md

**Files:**
- Modify: `apps/web/.claude/CLAUDE.md` (root)

- [ ] **Step 1: Update CLAUDE.md route listing**

In `.claude/CLAUDE.md`, update the frontend routing section to reflect the new structure — conferences now has publications/sessions nested, and social-media/wechat is added. Also add `WECHAT_DATABASE_URL` to the Environment section under Frontend.

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "docs: update CLAUDE.md with new route structure and wechat env var"
```

---

### Task 9: Manual verification

- [ ] **Step 1: Start the dev server and verify navigation**

```bash
cd apps/web && npm run dev
```

Open `http://localhost:3001/en/explore` and verify:
- Header shows dropdown menus for "Conferences" (with Overview, Publications, Sessions) and "Social Media" (with WeChat Articles)
- "Toolbox" is still a flat link
- Clicking dropdown items navigates to correct routes
- `/en/explore/conferences/publications` renders the publications list
- `/en/explore/conferences/sessions` renders the sessions list

- [ ] **Step 2: Verify WeChat Articles page**

Navigate to `/en/explore/social-media/wechat` and verify:
- Page renders with title, filters, and card grid (or empty state if no DB connection)
- Source dropdown populates from external DB
- Date range inputs work
- Search submits on Enter
- Cards link to detail pages
- Pagination works

- [ ] **Step 3: Verify article detail page**

Click an article card and verify:
- Breadcrumb, title, source badge, author, date all render
- "Original URL" button opens in new tab
- Cover image displays
- Article HTML content renders safely
- Fallback to plain text if no HTML

- [ ] **Step 4: Commit any fixes**

```bash
git add -A && git commit -m "fix(explore): address issues found during manual verification"
```
