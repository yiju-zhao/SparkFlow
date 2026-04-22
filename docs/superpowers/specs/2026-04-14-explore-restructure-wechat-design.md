# Explore Restructure + WeChat Articles

**Date:** 2026-04-14
**Status:** Approved

## Overview

Restructure the Research Hub navigation to group Publications and Sessions under Conferences, add a new Social Media section with a WeChat Articles page that reads from an external database.

## 1. Navigation Restructure

### Header Nav — Dropdown Menus

Current flat nav (`Conferences | Publications | Sessions | Toolbox`) becomes grouped dropdowns:

| Top-level item | Dropdown sub-items | Routes |
|---|---|---|
| **Conferences** ▾ | Overview, Publications, Sessions | `/explore/conferences`, `/explore/conferences/publications`, `/explore/conferences/sessions` |
| **Social Media** ▾ | WeChat Articles | `/explore/social-media/wechat` |
| **Toolbox** | _(flat, no dropdown)_ | `/explore/toolbox/matcher` |

- Dropdown appears on hover/click, closes on mouse leave or outside click
- Active sub-item highlighted with green indicator (matching current pattern)
- `nav-links.tsx` refactored from flat array to grouped structure with optional `children`

### Route Migration

| Old Path | New Path |
|---|---|
| `/explore/publications` | `/explore/conferences/publications` |
| `/explore/publications/[id]` | `/explore/conferences/publications/[id]` |
| `/explore/sessions` | `/explore/conferences/sessions` |
| `/explore/sessions/[id]` | `/explore/conferences/sessions/[id]` |

No redirects needed (internal app, no public SEO concern).

## 2. WeChat Articles — Data Layer

### External Database Connection

- New env var: `WECHAT_DATABASE_URL`
- Separate `pg` client instance (not Prisma — read-only external schema, raw SQL is simpler)
- Connection singleton at `lib/wechat-db.ts`, same pattern as `lib/prisma.ts`

### External DB Schema (read-only)

From `wechat_articles` schema in external Postgres:

- **`sources`** — WeChat public accounts: `id`, `slug`, `name`, `platform`, `description`
- **`articles`** — Published articles: `id`, `source_id`, `title`, `author`, `publish_time`, `original_url`, `cover_url`, `content_html`, `content_text`
- **`images`** — Extracted images: `id`, `article_id`, `image_type` (cover/content), `image_index`, `original_url`, `filename`, `mime_type`, `data` (bytea), `file_size`
- **`scrape_progress`** / **`scrape_queue`** — Internal crawler state (not exposed to frontend)

### API Routes

| Route | Method | Purpose |
|---|---|---|
| `/api/wechat/articles` | GET | List articles with pagination, source filter, date range, search |
| `/api/wechat/articles/[id]` | GET | Single article with content + images |
| `/api/wechat/sources` | GET | List all sources (for filter dropdown) |
| `/api/wechat/images/[id]` | GET | Serve image bytea data with correct mime type |

### Query Patterns

- **List:** `SELECT FROM wechat_articles.articles JOIN sources`, with `WHERE` clauses for `source_id`, `publish_time` range, `title/author ILIKE` search. `ORDER BY publish_time DESC`, `LIMIT/OFFSET` pagination.
- **Detail:** `SELECT article + JOIN images WHERE article_id = ?`
- **Images:** `SELECT data, mime_type FROM wechat_articles.images WHERE id = ?` → stream as response with `Content-Type` header.

## 3. WeChat Articles — Frontend

### List Page (`/explore/social-media/wechat/page.tsx`)

- Breadcrumb: `~/research-hub/social-media/wechat`
- Title: "WeChat Articles" with total count
- Filter bar: Source dropdown, Date Range picker, Search input (title/author)
- **Card grid** layout: 3 columns responsive
  - Each card: cover image, title (2-line clamp), source badge, date
  - Click → navigate to detail page
- Pagination at bottom (reuse `shared/pagination.tsx`)
- Server component with URL search params for filters (same pattern as publications page)

### Detail Page (`/explore/social-media/wechat/[id]/page.tsx`)

- Light theme (white background, dark text — matches app Huawei design system)
- Page header: breadcrumb, title, source badge, author, publish date
- Action buttons: "Original URL" (opens `original_url` in new tab), "Add to Notebook"
- Cover image from `cover_url`
- Article body: `content_html` rendered via sanitized `dangerouslySetInnerHTML` with scoped styles; fallback to `content_text` if no HTML
- Inline images: replace WeChat image URLs in HTML with `/api/wechat/images/[id]` proxy URLs
- Content max-width 720px for readability

### New Components

| Component | Purpose |
|---|---|
| `components/explore/social-media/wechat-article-grid.tsx` | Card grid for list page |
| `components/explore/social-media/wechat-article-card.tsx` | Individual article card |
| `components/explore/social-media/wechat-article-content.tsx` | HTML content renderer with sanitization |

### Reused Shared Components

`filter-bar.tsx`, `pagination.tsx`, `empty-state.tsx`

## 4. i18n

Translation keys added to `messages/en.json` and `messages/zh.json` under `explore`:

- `socialMedia.title` — "Social Media" / "社交媒体"
- `socialMedia.wechat.title` — "WeChat Articles" / "微信文章"
- `socialMedia.wechat.subtitle`, filter labels, empty state, pagination — following existing patterns

## 5. Environment

- Add `WECHAT_DATABASE_URL` to `apps/web/.env.example`
- Update CLAUDE.md Environment section

## Out of Scope

- No Prisma schema changes (all data from external DB via raw SQL)
- No "Add to Notebook" implementation (button present, wiring deferred)
- No scrape_progress/scrape_queue exposure (internal crawler state)
- No redirects from old publication/session URLs
