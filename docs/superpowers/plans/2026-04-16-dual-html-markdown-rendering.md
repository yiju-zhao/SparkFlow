# Dual HTML/Markdown Source Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store rich-format sources (PDF/DOCX/PPT/Webpage/WeChat) with both HTML (for rendering) and Markdown (for agents), while keeping simple sources (TXT/MD) markdown-only.

**Architecture:** Add nullable `contentHtml` field to Source. Migrate MinerU client to async Task API (v3.0+), parse `content_list_v2.json` from ZIP, build HTML server-side. Frontend renders HTML when available, falls back to Markdown. Agents always use Markdown.

**Tech Stack:** Next.js 16, Prisma 7, PostgreSQL, MinerU 3.0+ Task API, JSZip, DOMPurify, React Query.

---

## File Structure

### New files

- `apps/web/lib/services/mineru-task-client.ts` — Async Task API wrapper (submit/poll/download)
- `apps/web/lib/services/content-list-to-html.ts` — Content list v2 → HTML converter
- `apps/web/lib/services/source-processors/mineru-processor.ts` — Unified PDF/DOCX/PPT processor (renamed/expanded from pdf-processor.ts)
- `apps/web/components/deepdive/sources/source-html-view.tsx` — HTML renderer with image path fallback
- `apps/web/app/api/admin/mineru/health/route.ts` — MinerU health proxy
- `apps/web/app/[locale]/admin/mineru/page.tsx` — Admin MinerU monitoring page

### Modified files

- `apps/web/prisma/schema.prisma` — Add `contentHtml String?` to Source
- `apps/web/lib/services/mineru-client.ts` — Refactor to use new Task API wrapper, extract `content_list_v2.json` from ZIP
- `apps/web/lib/services/source-service.ts` — `storeImagesAndRewriteMarkdown` returns URL mapping
- `apps/web/lib/services/source-processors/pdf-processor.ts` — Deleted (replaced by mineru-processor)
- `apps/web/lib/services/source-processors/fallback-processor.ts` — Remove `processDocxDocument` (MinerU handles DOCX now)
- `apps/web/lib/actions/sources.ts` — Route PDF/DOCX/PPT to MinerU, enforce allowed extensions, extend `addWechatSource` to store `contentHtml`
- `apps/web/lib/services/source-processors/webpage-processor.ts` — Store HTML alongside markdown
- `apps/web/lib/services/playwright-scraper.ts` — Return `html` field alongside `markdown`
- `apps/web/components/deepdive/sources/sources-panel.tsx` — SourceContentView tiered render
- `apps/web/components/deepdive/sources/add-source-dialog.tsx` — Update `accept` attr and client-side validation
- `apps/web/app/[locale]/admin/layout.tsx` (or sidebar component) — Add MinerU nav entry

---

## Task 1: Schema — Add `contentHtml` column

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: Add `contentHtml` field to Source model**

Open `apps/web/prisma/schema.prisma`, find the `Source` model, add after `markdownContent`:

```prisma
model Source {
  // ... existing fields above
  content         String?
  markdownContent String?
  contentHtml     String?  // Rich HTML for rendering (MinerU/WeChat/Webpage); null for plain-text sources
  // ... existing fields below
}
```

- [ ] **Step 2: Push schema to DB**

Run: `cd apps/web && npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema."

- [ ] **Step 3: Regenerate Prisma client**

Run: `cd apps/web && npx prisma generate`
Expected: "Generated Prisma Client"

- [ ] **Step 4: Verify column exists**

Run: `psql postgresql://sparkflow:sparkflow@localhost:5433/sparkflow -c "\d sources"`
Expected: Output includes `content_html` column

- [ ] **Step 5: Commit**

```bash
git add apps/web/prisma/schema.prisma
git commit -m "feat(schema): add contentHtml field to Source model"
```

---

## Task 2: MinerU Task API client (low-level wrapper)

**Files:**
- Create: `apps/web/lib/services/mineru-task-client.ts`

- [ ] **Step 1: Create the Task API client file**

Create `apps/web/lib/services/mineru-task-client.ts`:

```typescript
/**
 * Low-level wrapper around MinerU 3.0+ async Task API.
 * Endpoints:
 *   POST   /tasks                    → { task_id, status_url, result_url }
 *   GET    /tasks/{id}               → { status: "pending" | "processing" | "completed" | "failed", error? }
 *   GET    /tasks/{id}/result        → ZIP binary
 *   GET    /health                   → { status, version, queued_tasks, ... }
 */

const MINERU_LOCAL_URL = process.env.MINERU_LOCAL_URL || "http://localhost:8000";

export interface MineruTaskSubmitOptions {
  backend?: string;
  parseMethod?: string;
  returnMd?: boolean;
  returnContentList?: boolean;
  returnImages?: boolean;
  responseFormatZip?: boolean;
  formulaEnable?: boolean;
  tableEnable?: boolean;
  langList?: string[];
}

export interface MineruTaskSubmitResponse {
  task_id: string;
  status: string;
  status_url: string;
  result_url: string;
}

export interface MineruTaskStatus {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed";
  error: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface MineruHealth {
  status: string;
  version: string;
  protocol_version: number;
  queued_tasks: number;
  processing_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  max_concurrent_requests: number;
  processing_window_size: number;
  task_retention_seconds: number;
}

export async function submitMineruTask(
  filePath: string,
  options: MineruTaskSubmitOptions = {},
): Promise<MineruTaskSubmitResponse> {
  const { readFile } = await import("fs/promises");
  const buffer = await readFile(filePath);
  const fileName = filePath.split("/").pop()!;

  const form = new FormData();
  form.append("files", new Blob([buffer], { type: "application/pdf" }), fileName);
  form.append("backend", options.backend ?? "hybrid-auto-engine");
  form.append("parse_method", options.parseMethod ?? "auto");
  form.append("return_md", String(options.returnMd ?? true));
  form.append("return_content_list", String(options.returnContentList ?? true));
  form.append("return_images", String(options.returnImages ?? true));
  form.append("response_format_zip", String(options.responseFormatZip ?? true));
  form.append("formula_enable", String(options.formulaEnable ?? true));
  form.append("table_enable", String(options.tableEnable ?? true));
  if (options.langList) {
    for (const lang of options.langList) form.append("lang_list", lang);
  }

  const res = await fetch(`${MINERU_LOCAL_URL}/tasks`, { method: "POST", body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`MinerU task submission failed: ${res.status} ${res.statusText} ${body}`);
  }
  return res.json();
}

export async function getMineruTaskStatus(taskId: string): Promise<MineruTaskStatus> {
  const res = await fetch(`${MINERU_LOCAL_URL}/tasks/${taskId}`);
  if (!res.ok) {
    throw new Error(`MinerU status check failed: ${res.status}`);
  }
  return res.json();
}

export async function pollMineruTask(
  taskId: string,
  options: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<void> {
  const interval = options.intervalMs ?? 2000;
  const maxAttempts = options.maxAttempts ?? 300; // 10 min default

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));
    const status = await getMineruTaskStatus(taskId).catch(() => null);
    if (!status) continue;
    if (status.status === "completed") return;
    if (status.status === "failed") {
      throw new Error(`MinerU task failed: ${status.error || "unknown error"}`);
    }
  }
  throw new Error(`MinerU task ${taskId} timed out after ${(maxAttempts * interval) / 1000}s`);
}

export async function downloadMineruResult(taskId: string): Promise<ArrayBuffer> {
  const res = await fetch(`${MINERU_LOCAL_URL}/tasks/${taskId}/result`);
  if (!res.ok) {
    throw new Error(`MinerU result download failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

export async function getMineruHealth(): Promise<MineruHealth | null> {
  try {
    const res = await fetch(`${MINERU_LOCAL_URL}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors in the new file.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/services/mineru-task-client.ts
git commit -m "feat(mineru): add async Task API client wrapper"
```

---

## Task 3: Extend ZIP extractor to parse content_list_v2.json

**Files:**
- Modify: `apps/web/lib/services/mineru-client.ts`

- [ ] **Step 1: Update `MineruResult` interface**

In `apps/web/lib/services/mineru-client.ts`, replace the interface at top:

```typescript
export interface ContentListItem {
  type: string;
  content?: any;
  bbox?: number[];
  // For legacy content_list.json format
  text?: string;
  text_level?: number;
  img_path?: string;
  image_caption?: string[];
  table_body?: string;
  table_caption?: string[];
  table_footnote?: string[];
  sub_type?: string;
  [key: string]: any;
}

export interface MineruResult {
  markdown: string;
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[];
  contentList?: ContentListItem[];
}
```

- [ ] **Step 2: Update `extractFromZipBuffer` to parse content_list**

Find `extractFromZipBuffer` and replace its body:

```typescript
async function extractFromZipBuffer(buffer: ArrayBuffer): Promise<MineruResult> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buffer);

  let markdown = "";
  let contentList: ContentListItem[] | undefined;
  const images: MineruResult["images"] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (path.endsWith(".md")) {
      const content = await file.async("string");
      if (!markdown || path.includes("full")) markdown = content;
    } else if (path.endsWith("_content_list_v2.json") || path.endsWith("_content_list.json")) {
      // Prefer v2 (3.0+) — overwrites legacy if both present
      const json = await file.async("string");
      try {
        const parsed = JSON.parse(json);
        // v2 is page-grouped: [[items], [items], ...] — flatten
        // legacy is flat: [items...]
        if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0])) {
          contentList = parsed.flat() as ContentListItem[];
        } else {
          contentList = parsed as ContentListItem[];
        }
      } catch (err) {
        console.warn(`[MinerU] Failed to parse ${path}:`, err);
      }
    } else if (/\.(png|jpg|jpeg|gif|webp|svg)$/i.test(path)) {
      const data = await file.async("nodebuffer");
      const ext = path.split(".").pop()!.toLowerCase();
      const mimeMap: Record<string, string> = {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      };
      images.push({
        name: path.split("/").pop()!,
        fullPath: path,
        data: Buffer.from(data),
        mimeType: mimeMap[ext] || "image/png",
      });
    }
  }

  if (!markdown) {
    throw new Error(
      `MinerU zip contained no markdown file. Entries: ${Object.keys(zip.files).join(", ")}`,
    );
  }

  return { markdown, images, contentList };
}
```

- [ ] **Step 3: Export `extractFromZipBuffer`**

Add `export` keyword: `export async function extractFromZipBuffer(...)` so `mineru-processor.ts` can use it.

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/mineru-client.ts
git commit -m "feat(mineru): parse content_list_v2.json from ZIP"
```

---

## Task 4: Migrate `parsePdfLocal` to use async Task API

**Files:**
- Modify: `apps/web/lib/services/mineru-client.ts`

- [ ] **Step 1: Rewrite `parsePdfLocal` to use Task API**

Replace the existing `parsePdfLocal` function:

```typescript
async function parsePdfLocal(filePath: string): Promise<MineruResult> {
  const {
    submitMineruTask,
    pollMineruTask,
    downloadMineruResult,
  } = await import("./mineru-task-client");

  const { task_id } = await submitMineruTask(filePath, {
    backend: "hybrid-auto-engine",
    returnMd: true,
    returnContentList: true,
    returnImages: true,
    responseFormatZip: true,
    formulaEnable: true,
    tableEnable: true,
  });

  await pollMineruTask(task_id, { intervalMs: 2000, maxAttempts: 300 });

  const zipBuffer = await downloadMineruResult(task_id);
  return extractFromZipBuffer(zipBuffer);
}
```

- [ ] **Step 2: Delete the unused `extractFromLocalResult` function**

Remove the entire `function extractFromLocalResult(...)` block — it was the synchronous JSON parse path that's no longer needed.

- [ ] **Step 3: Rename `parsePdf` to clearer name (optional, keep alias for compat)**

Add at the bottom of the file:

```typescript
// Alias — MinerU handles PDF/DOCX/PPT uniformly
export const parseDocumentViaMineru = parsePdf;
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/mineru-client.ts
git commit -m "feat(mineru): migrate parsePdfLocal to async Task API"
```

---

## Task 5: `storeImagesAndRewriteMarkdown` returns URL mapping

**Files:**
- Modify: `apps/web/lib/services/source-service.ts`

- [ ] **Step 1: Update function signature and return shape**

In `apps/web/lib/services/source-service.ts`, replace the function:

```typescript
/**
 * Store extracted images in PostgreSQL and rewrite markdown image references.
 * Returns rewritten markdown AND a mapping of all image path aliases to their
 * final /api/images/{id} URL, so callers can reuse the map (e.g., for HTML rewriting).
 */
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[],
): Promise<{ markdown: string; imagePathToApiUrl: Map<string, string> }> {
  let rewrittenMarkdown = markdown;
  const imagePathToApiUrl = new Map<string, string>();

  for (const image of images) {
    const imageData = new Uint8Array(image.data);
    console.log(
      `[storeImage] Saving "${image.name}" (${image.mimeType}), ${imageData.byteLength} bytes`,
    );

    const savedImage = await prisma.sourceImage.create({
      data: {
        sourceId,
        originalName: image.name,
        mimeType: image.mimeType,
        data: imageData,
      },
    });

    const apiUrl = `/api/images/${savedImage.id}`;

    // Record every known alias for this image so later consumers (HTML builder)
    // can resolve references by any of them.
    imagePathToApiUrl.set(image.name, apiUrl);
    if (image.fullPath) {
      imagePathToApiUrl.set(image.fullPath, apiUrl);
      // Path suffixes too (e.g., "images/hash.jpg" from "prefix/images/hash.jpg")
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        imagePathToApiUrl.set(parts.slice(i).join("/"), apiUrl);
      }
    }

    // Rewrite markdown
    if (image.fullPath) {
      rewrittenMarkdown = rewrittenMarkdown.replaceAll(image.fullPath, apiUrl);
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join("/");
        if (rewrittenMarkdown.includes(suffix)) {
          rewrittenMarkdown = rewrittenMarkdown.replaceAll(suffix, apiUrl);
          break;
        }
      }
    }

    const escaped = image.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewrittenMarkdown = rewrittenMarkdown.replace(
      new RegExp(`(!\\[[^\\]]*\\]\\()[^)]*?${escaped}(\\))`, "g"),
      `$1${apiUrl}$2`,
    );
  }

  return { markdown: rewrittenMarkdown, imagePathToApiUrl };
}
```

- [ ] **Step 2: Update all callers**

Find callers (webpage-processor.ts, pdf-processor.ts) and update. For webpage-processor.ts:

```typescript
// OLD:
const markdown = await storeImagesAndRewriteMarkdown(sourceId, result.markdown, result.images);

// NEW:
const { markdown } = await storeImagesAndRewriteMarkdown(sourceId, result.markdown, result.images);
```

Same change in pdf-processor.ts (will be replaced entirely in Task 6 anyway, but do it here to keep the build green between tasks).

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services/source-service.ts apps/web/lib/services/source-processors/
git commit -m "refactor(sources): storeImagesAndRewriteMarkdown returns URL mapping"
```

---

## Task 6: Content list → HTML builder

**Files:**
- Create: `apps/web/lib/services/content-list-to-html.ts`

- [ ] **Step 1: Create the HTML builder file**

Create `apps/web/lib/services/content-list-to-html.ts`:

```typescript
import type { ContentListItem } from "./mineru-client";

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function resolveImage(
  imgPath: string | undefined,
  map: Map<string, string>,
): string | null {
  if (!imgPath) return null;
  // Try exact, then suffixes
  if (map.has(imgPath)) return map.get(imgPath)!;
  const parts = imgPath.split("/");
  for (let i = 1; i < parts.length; i++) {
    const suffix = parts.slice(i).join("/");
    if (map.has(suffix)) return map.get(suffix)!;
  }
  return null;
}

/**
 * Extract plain text from a title_content or paragraph_content value.
 * v2 format: [{type: "text", content: "..."}, {type: "equation", content: "..."}, ...]
 * legacy:    plain string
 */
function extractInlineText(value: any): string {
  if (typeof value === "string") return escapeHtml(value);
  if (!Array.isArray(value)) return "";
  return value
    .map((item: any) => {
      if (typeof item === "string") return escapeHtml(item);
      if (item?.type === "equation") {
        return `<code class="inline-equation">${escapeHtml(item.content || "")}</code>`;
      }
      return escapeHtml(item?.content || "");
    })
    .join("");
}

function renderItem(item: ContentListItem, imageMap: Map<string, string>): string {
  const type = item.type;

  // Title (v2 + legacy)
  if (type === "title" || (type === "text" && item.text_level)) {
    const level = Math.min(item.content?.level ?? item.text_level ?? 1, 6);
    const text = extractInlineText(item.content?.title_content ?? item.text ?? "");
    return `<h${level}>${text}</h${level}>`;
  }

  // Paragraph / plain text
  if (type === "paragraph" || type === "text") {
    const text = extractInlineText(item.content?.paragraph_content ?? item.text ?? "");
    return text ? `<p>${text}</p>` : "";
  }

  // Equation block
  if (type === "equation_interline" || type === "equation") {
    const latex = item.content?.math_content ?? item.text ?? "";
    const imgSrc = resolveImage(item.img_path, imageMap);
    if (imgSrc) {
      return `<div class="math-block"><img src="${imgSrc}" alt="${escapeHtml(latex)}" /></div>`;
    }
    // Fallback: raw LaTeX in code tag
    return `<div class="math-block"><code>${escapeHtml(latex)}</code></div>`;
  }

  // Image
  if (type === "image") {
    const imgSrc = resolveImage(item.img_path ?? item.content?.img_path, imageMap);
    if (!imgSrc) return "";
    const captionList = item.image_caption ?? item.content?.image_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return `<figure><img src="${imgSrc}" alt="${escapeHtml(caption)}" />${
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
    }</figure>`;
  }

  // Table — MinerU gives us ready-to-use HTML
  if (type === "table") {
    const body = item.table_body ?? item.content?.table_body ?? "";
    const captionList = item.table_caption ?? item.content?.table_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    const captionHtml = caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : "";
    // Wrap in figure for consistent styling
    return `<figure class="source-table">${captionHtml}${body}</figure>`;
  }

  // Chart — treat like image
  if (type === "chart") {
    const imgSrc = resolveImage(item.img_path ?? item.content?.img_path, imageMap);
    if (!imgSrc) return "";
    const captionList = item.chart_caption ?? [];
    const caption = Array.isArray(captionList) ? captionList.join(" ") : "";
    return `<figure><img src="${imgSrc}" alt="${escapeHtml(caption)}" />${
      caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""
    }</figure>`;
  }

  // Code block
  if (type === "code") {
    const body = item.code_body ?? item.content?.code_body ?? "";
    const lang = item.content?.code_language ?? "";
    const langClass = lang ? ` class="lang-${escapeHtml(lang)}"` : "";
    return `<pre><code${langClass}>${escapeHtml(body)}</code></pre>`;
  }

  // Algorithm
  if (type === "algorithm") {
    const body = item.content?.algorithm_content ?? "";
    return `<pre class="algorithm"><code>${escapeHtml(body)}</code></pre>`;
  }

  // Lists
  if (type === "list" || type === "index") {
    const items = item.list_items ?? item.content?.list_items ?? [];
    if (!Array.isArray(items) || items.length === 0) return "";
    const tag = type === "index" ? "ol" : "ul";
    const lis = items.map((li: string) => `<li>${escapeHtml(li)}</li>`).join("");
    return `<${tag}>${lis}</${tag}>`;
  }

  // Skip: page_header, page_footer, page_number, aside_text, page_footnote
  return "";
}

export function buildHtmlFromContentList(
  contentList: ContentListItem[],
  imagePathToApiUrl: Map<string, string>,
): string {
  const parts = contentList
    .map((item) => renderItem(item, imagePathToApiUrl))
    .filter(Boolean);
  return parts.join("\n");
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/services/content-list-to-html.ts
git commit -m "feat(sources): add content_list_v2 to HTML builder"
```

---

## Task 7: Unified MinerU document processor

**Files:**
- Create: `apps/web/lib/services/source-processors/mineru-processor.ts`
- Modify: `apps/web/lib/services/source-processors/pdf-processor.ts` (delete at end)

- [ ] **Step 1: Create the new processor**

Create `apps/web/lib/services/source-processors/mineru-processor.ts`:

```typescript
import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import { buildHtmlFromContentList } from "@/lib/services/content-list-to-html";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Handles PDF / DOCX / PPT / PPTX via MinerU.
 * MinerU auto-detects the file type based on extension.
 */
export async function processMineruDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const tempPath = `/tmp/${sourceId}-${file.name}`;
    const { writeFile, unlink } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    let mineruResult;
    try {
      const { parsePdf } = await import("@/lib/services/mineru-client");
      mineruResult = await parsePdf(tempPath);
    } finally {
      await unlink(tempPath).catch(() => {});
    }

    console.log(
      `[MinerU] ${file.name}: ${mineruResult.images.length} images, ` +
        `${mineruResult.markdown.length} markdown chars, ` +
        `contentList=${mineruResult.contentList?.length ?? "none"}`,
    );

    const { markdown, imagePathToApiUrl } = await storeImagesAndRewriteMarkdown(
      sourceId,
      mineruResult.markdown,
      mineruResult.images,
    );

    let contentHtml: string | null = null;
    if (mineruResult.contentList && mineruResult.contentList.length > 0) {
      try {
        contentHtml = buildHtmlFromContentList(mineruResult.contentList, imagePathToApiUrl);
      } catch (err) {
        console.warn("[MinerU] HTML build failed, will fall back to markdown:", err);
      }
    }

    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdownContent: markdown,
        content: markdown,
        contentHtml,
        status: "READY",
        metadata: {
          fileType: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
          markdownLength: markdown.length,
          imageCount: mineruResult.images.length,
          hasHtml: !!contentHtml,
          toc,
        },
      },
    });

    try {
      const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
      const result = await ingestSourceToWiki(context.notebookId, sourceId, context.userId);
      console.log(`Wiki ingest complete: ${result.pagesWritten} pages written`);
    } catch (err) {
      console.error("Wiki ingest failed:", err);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "FAILED", errorMessage },
    });
    return { success: false, errorMessage };
  }
}
```

- [ ] **Step 2: Delete `pdf-processor.ts`**

Run: `rm apps/web/lib/services/source-processors/pdf-processor.ts`

- [ ] **Step 3: Remove DOCX handler from fallback-processor**

Open `apps/web/lib/services/source-processors/fallback-processor.ts`, delete the `processDocxDocument` export (keep `processFallbackDocument`).

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: Errors in `source-service.ts` (imports `processPdfDocument`) and `sources.ts` — will fix in next task.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/services/source-processors/
git commit -m "feat(sources): unified MinerU processor for PDF/DOCX/PPT"
```

---

## Task 8: Route uploads through MinerU + enforce allowed extensions

**Files:**
- Modify: `apps/web/lib/actions/sources.ts`
- Modify: `apps/web/lib/services/source-service.ts`

- [ ] **Step 1: Update `sources.ts` action**

In `apps/web/lib/actions/sources.ts`, replace the imports and `uploadDocumentSource` function:

```typescript
// At top of file, replace imports:
import { processWebpage } from "@/lib/services/source-processors/webpage-processor";
import { processTextDocument } from "@/lib/services/source-processors/text-processor";
import { processMineruDocument } from "@/lib/services/source-processors/mineru-processor";
import { processFallbackDocument } from "@/lib/services/source-processors/fallback-processor";
import type { ProcessingContext } from "@/lib/services/source-processors/types";

const MINERU_EXTENSIONS = ["pdf", "docx", "doc", "pptx", "ppt"];
const TEXT_EXTENSIONS = ["txt", "md"];
const ALLOWED_EXTENSIONS = [...MINERU_EXTENSIONS, ...TEXT_EXTENSIONS];
```

Then update `uploadDocumentSource`:

```typescript
export async function uploadDocumentSource(
  notebookId: string,
  formData: FormData,
) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });
  if (!notebook) throw new Error("Notebook not found");

  const file = formData.get("file") as File;
  if (!file) throw new Error("No file provided");

  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
  if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
    throw new Error(
      `Unsupported file type ".${fileExtension}". Allowed: ${ALLOWED_EXTENSIONS.map((e) => "." + e).join(", ")}`,
    );
  }

  const source = await prisma.source.create({
    data: {
      notebookId,
      title: file.name,
      sourceType: "DOCUMENT",
      status: "PROCESSING",
    },
  });

  revalidatePath(`/deepdive/${notebookId}`);

  const context: ProcessingContext = {
    sourceId: source.id,
    notebookId,
    userId: session.user.id,
  };

  const processDocument = async () => {
    if (TEXT_EXTENSIONS.includes(fileExtension)) {
      return processTextDocument(file, context);
    }
    if (MINERU_EXTENSIONS.includes(fileExtension)) {
      return processMineruDocument(file, context);
    }
    return processFallbackDocument(file, context);
  };

  processDocument()
    .catch(console.error)
    .finally(() => {
      try {
        revalidatePath(`/deepdive/${notebookId}`);
      } catch {}
    });

  return source;
}
```

- [ ] **Step 2: Update `addPublicationSource` to use MinerU**

In the same file, change `processPdfDocument` → `processMineruDocument`:

```typescript
// Find:
await processPdfDocument(file, context);
// Replace with:
await processMineruDocument(file, context);
```

- [ ] **Step 3: Update `source-service.ts` imports**

In `apps/web/lib/services/source-service.ts`, replace:

```typescript
import { processPdfDocument } from "./source-processors/pdf-processor";
import { processDocxDocument, processFallbackDocument } from "./source-processors/fallback-processor";
```

With:

```typescript
import { processMineruDocument } from "./source-processors/mineru-processor";
import { processFallbackDocument } from "./source-processors/fallback-processor";
```

And update the `processDocument` method inside `SourceService`:

```typescript
private async processDocument(file: File, fileExtension: string, context: ProcessingContext) {
  if (fileExtension === "txt" || fileExtension === "md") {
    return processTextDocument(file, context);
  }
  if (["pdf", "docx", "doc", "pptx", "ppt"].includes(fileExtension)) {
    return processMineruDocument(file, context);
  }
  return processFallbackDocument(file, context);
}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/actions/sources.ts apps/web/lib/services/source-service.ts
git commit -m "feat(sources): route PDF/DOCX/PPT through MinerU, enforce allowed types"
```

---

## Task 9: Update upload dialog `accept` + client validation

**Files:**
- Modify: `apps/web/components/deepdive/sources/add-source-dialog.tsx`

- [ ] **Step 1: Find the file input**

Open `apps/web/components/deepdive/sources/add-source-dialog.tsx`. Find the `<input type="file">` element.

- [ ] **Step 2: Update `accept` attr**

```tsx
<input
  type="file"
  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md"
  // ... existing attrs
/>
```

- [ ] **Step 3: Add client-side validation**

Find the file select handler (e.g., `onChange`), add before upload:

```typescript
const ALLOWED = ["pdf", "docx", "doc", "pptx", "ppt", "txt", "md"];
const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
if (!ALLOWED.includes(ext)) {
  alert(`Unsupported file type ".${ext}". Allowed: .pdf .docx .doc .pptx .ppt .txt .md`);
  return;
}
```

(Or use the existing toast/error UI if available — check surrounding code for the pattern.)

- [ ] **Step 4: Type-check and format**

Run: `cd apps/web && npx tsc --noEmit && npx prettier --write components/deepdive/sources/add-source-dialog.tsx`

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/deepdive/sources/add-source-dialog.tsx
git commit -m "feat(sources): restrict upload to allowed file types"
```

---

## Task 10: WeChat processor stores contentHtml

**Files:**
- Modify: `apps/web/lib/actions/sources.ts` (`addWechatSource`)

- [ ] **Step 1: Add HTML image rewriter helper**

In `apps/web/lib/actions/sources.ts`, inside `addWechatSource`'s async IIFE, after building `originalUrlToLocal` and `wechatIdToLocal` maps, add:

```typescript
function rewriteWechatHtmlImages(html: string): string {
  // Match <img ...> tags and rewrite src/data-src to local /api/images/{id}
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const dataSrcMatch = tag.match(/data-src=["']([^"']+)["']/);
    const srcMatch = tag.match(/src=["']([^"']+)["']/);
    const src = dataSrcMatch?.[1] || srcMatch?.[1] || "";

    // Case 1: Scraper-rewritten /api/images/{wechatDbId}
    const scraperMatch = src.match(/^\/api\/images\/(\d+)$/);
    if (scraperMatch) {
      const localUrl = wechatIdToLocal.get(parseInt(scraperMatch[1], 10));
      if (localUrl) return tag.replace(/(?:data-)?src=["'][^"']+["']/g, `src="${localUrl}"`);
    }

    // Case 2: Match by original WeChat CDN URL
    const localUrl = originalUrlToLocal.get(src);
    if (localUrl) return tag.replace(/(?:data-)?src=["'][^"']+["']/g, `src="${localUrl}"`);

    // Case 3: Leave external URL as-is
    return tag;
  });
}

const contentHtml = rewriteWechatHtmlImages(article.content_html || "");
```

- [ ] **Step 2: Add `contentHtml` to the Prisma update**

Find the `prisma.source.update` call in the same function. Add `contentHtml` to the `data`:

```typescript
await prisma.source.update({
  where: { id: source.id },
  data: {
    content: markdownContent,
    markdownContent: markdownContent,
    contentHtml,                    // NEW
    status: "READY",
    metadata: {
      author: article.author,
      publishDate: article.publish_time?.toISOString(),
      sourceName: article.source_name,
      markdownLength: markdownContent.length,
      imageCount: images.filter((i) => i.data).length,
      hasHtml: !!contentHtml,       // NEW
      toc,
    },
  },
});
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/actions/sources.ts
git commit -m "feat(wechat): store contentHtml alongside markdown"
```

---

## Task 11: Webpage processor stores contentHtml

**Files:**
- Modify: `apps/web/lib/services/playwright-scraper.ts`
- Modify: `apps/web/lib/services/source-processors/webpage-processor.ts`

- [ ] **Step 1: Update scraper to return HTML**

Open `apps/web/lib/services/playwright-scraper.ts`. Find the return shape (search for `return {`). Add an `html` field alongside `markdown`:

```typescript
// Assuming the function currently returns { markdown, images, metadata }
// capture the inner HTML of the main content area before turndown conversion
const html = await page.evaluate(() => {
  const main = document.querySelector("article, main, [role='main']") || document.body;
  return main.innerHTML;
});

// ... existing turndown logic
return { html, markdown, images, metadata };
```

If the file is structured differently (e.g., already returns HTML from a specific selector), adapt accordingly — the goal is to include the sanitize-ready HTML in the return value.

- [ ] **Step 2: Update webpage processor to store contentHtml**

Open `apps/web/lib/services/source-processors/webpage-processor.ts`. Replace the body:

```typescript
import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

function rewriteImgTags(html: string, imageMap: Map<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return tag;
    const src = srcMatch[1];
    // Direct hit
    const local = imageMap.get(src);
    if (local) return tag.replace(/src=["'][^"']+["']/, `src="${local}"`);
    // Try filename
    const filename = src.split("/").pop() ?? "";
    const byFilename = imageMap.get(filename);
    if (byFilename) return tag.replace(/src=["'][^"']+["']/, `src="${byFilename}"`);
    return tag;
  });
}

export async function processWebpage(
  url: string,
  title: string | undefined,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const { scrapeWebpage } = await import("@/lib/services/playwright-scraper");
    const result = await scrapeWebpage(url);

    const { markdown, imagePathToApiUrl } = await storeImagesAndRewriteMarkdown(
      sourceId,
      result.markdown,
      result.images,
    );

    const contentHtml = result.html ? rewriteImgTags(result.html, imagePathToApiUrl) : null;

    const finalTitle = title || result.metadata.title;
    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: finalTitle,
        markdownContent: markdown,
        content: markdown,
        contentHtml,
        status: "READY",
        metadata: {
          author: result.metadata.author,
          publishDate: result.metadata.date,
          markdownLength: markdown.length,
          imageCount: result.images.length,
          hasHtml: !!contentHtml,
          toc,
        },
      },
    });

    try {
      const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
      const r = await ingestSourceToWiki(context.notebookId, sourceId, context.userId);
      console.log(`Wiki ingest complete: ${r.pagesWritten} pages written`);
    } catch (err) {
      console.error("Wiki ingest failed:", err);
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "FAILED", errorMessage },
    });
    return { success: false, errorMessage };
  }
}
```

- [ ] **Step 3: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services/playwright-scraper.ts apps/web/lib/services/source-processors/webpage-processor.ts
git commit -m "feat(webpage): store contentHtml alongside markdown"
```

---

## Task 12: `SourceHtmlView` component

**Files:**
- Create: `apps/web/components/deepdive/sources/source-html-view.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/deepdive/sources/source-html-view.tsx`:

```tsx
"use client";

import DOMPurify from "dompurify";
import { useEffect, useRef, useMemo } from "react";

interface SourceHtmlViewProps {
  html: string;
  sourceId: string;
  className?: string;
}

/**
 * Renders rich HTML content (from MinerU/Webpage/WeChat) with:
 * - DOMPurify sanitization
 * - Fallback image resolver for unresolved relative paths
 */
export function SourceHtmlView({ html, sourceId, className }: SourceHtmlViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        ADD_TAGS: ["figure", "figcaption", "section"],
        ADD_ATTR: ["colspan", "rowspan", "data-src"],
      }),
    [html],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.querySelectorAll("img").forEach((img) => {
      const src = img.getAttribute("src") || "";
      if (!src) return;

      // Absolute URL or already resolved? leave it
      if (src.startsWith("/api/") || /^https?:\/\//.test(src)) {
        img.onerror = () => {
          img.style.display = "none";
        };
        return;
      }

      // Relative path — route through fallback resolver
      const fallbackUrl = `/api/images/by-source/${sourceId}/${src.replace(/^\//, "")}`;
      img.src = fallbackUrl;
      img.onerror = () => {
        img.style.display = "none";
      };
    });
  }, [clean, sourceId]);

  return (
    <div
      ref={containerRef}
      className={`source-html-content prose prose-sm max-w-none
        prose-headings:text-foreground prose-p:text-foreground/90
        prose-a:text-accent-red prose-img:rounded-lg prose-img:mx-auto
        prose-table:border-collapse prose-table:w-full
        prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-2
        prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-2
        prose-blockquote:border-accent-red/30 prose-blockquote:text-muted-foreground
        ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/deepdive/sources/source-html-view.tsx
git commit -m "feat(sources): add SourceHtmlView with sanitization and image fallback"
```

---

## Task 13: Tiered render in SourceContentView

**Files:**
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx`

- [ ] **Step 1: Import SourceHtmlView**

Near the top of `apps/web/components/deepdive/sources/sources-panel.tsx`, add:

```typescript
import { SourceHtmlView } from "./source-html-view";
```

- [ ] **Step 2: Update Source type to include contentHtml**

Find the local `Source` type (line ~16) and extend:

```typescript
type Source = PrismaSource & {
  content?: string | null;
  contentHtml?: string | null;
};
```

- [ ] **Step 3: Replace Markdown render with tiered logic**

Find the `Markdown` usage in `SourceContentView` (around line 405 area), replace:

```tsx
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
  // ... existing skeleton
)}
```

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test — start dev server**

Run: `cd apps/web && npm run dev`
Open http://localhost:3001, upload a PDF with equations/tables, open it in notebook.
Expected: Tables render natively; equations render as images (from MinerU), not broken red LaTeX.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/deepdive/sources/sources-panel.tsx
git commit -m "feat(sources): tiered HTML/Markdown render in SourceContentView"
```

---

## Task 14: Admin MinerU health API route

**Files:**
- Create: `apps/web/app/api/admin/mineru/health/route.ts`

- [ ] **Step 1: Create the route handler**

Create `apps/web/app/api/admin/mineru/health/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import { getMineruHealth } from "@/lib/services/mineru-task-client";

export async function GET() {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());
  if (!session?.user?.email || !adminEmails.includes(session.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const health = await getMineruHealth();
  if (!health) {
    return NextResponse.json({ healthy: false, error: "MinerU unreachable" }, { status: 503 });
  }

  return NextResponse.json({ healthy: true, ...health });
}
```

- [ ] **Step 2: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/admin/mineru/health/route.ts
git commit -m "feat(admin): add MinerU health check API"
```

---

## Task 15: Admin MinerU monitoring page

**Files:**
- Create: `apps/web/app/[locale]/admin/mineru/page.tsx`

- [ ] **Step 1: Check admin nav structure**

Run: `ls apps/web/app/\[locale\]/admin/`
Look at an existing admin page (e.g., `users/page.tsx`) to match layout conventions.

- [ ] **Step 2: Create the page**

Create `apps/web/app/[locale]/admin/mineru/page.tsx`:

```tsx
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import prisma from "@/lib/prisma";
import { getMineruHealth } from "@/lib/services/mineru-task-client";

export default async function MineruAdminPage() {
  const session = await auth();
  const adminEmails = (process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim());
  if (!session?.user?.email || !adminEmails.includes(session.user.email)) {
    redirect("/access-denied");
  }

  const [health, recentSources] = await Promise.all([
    getMineruHealth(),
    prisma.source.findMany({
      where: { sourceType: "DOCUMENT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        title: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        notebookId: true,
      },
    }),
  ]);

  return (
    <div className="max-w-4xl mx-auto py-8 px-6 space-y-8">
      <h1 className="text-2xl font-semibold">MinerU Monitoring</h1>

      <section className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium mb-4">Service Status</h2>
        {health ? (
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">Status</div>
              <div className="font-mono">{health.status}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Version</div>
              <div className="font-mono">{health.version}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Queued</div>
              <div className="font-mono">{health.queued_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Processing</div>
              <div className="font-mono">{health.processing_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Completed</div>
              <div className="font-mono">{health.completed_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Failed</div>
              <div className="font-mono">{health.failed_tasks}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Max Concurrent</div>
              <div className="font-mono">{health.max_concurrent_requests}</div>
            </div>
          </div>
        ) : (
          <div className="text-red-500">MinerU is unreachable</div>
        )}
      </section>

      <section className="rounded-lg border border-border p-6">
        <h2 className="text-lg font-medium mb-4">Recent Document Processing</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="py-2">Title</th>
              <th className="py-2">Status</th>
              <th className="py-2">Error</th>
              <th className="py-2">Created</th>
            </tr>
          </thead>
          <tbody>
            {recentSources.map((s) => (
              <tr key={s.id} className="border-b border-border/50">
                <td className="py-2 truncate max-w-xs" title={s.title}>{s.title}</td>
                <td className="py-2 font-mono">{s.status}</td>
                <td className="py-2 text-red-500 text-xs truncate max-w-xs" title={s.errorMessage ?? ""}>
                  {s.errorMessage ?? "—"}
                </td>
                <td className="py-2 text-xs text-muted-foreground">
                  {new Date(s.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add MinerU entry to admin nav**

Find the admin layout or nav component (e.g., `apps/web/app/[locale]/admin/layout.tsx`). Add a nav link:

```tsx
<Link href="/admin/mineru">MinerU</Link>
```

Match the styling of existing entries (users, venues, etc.).

- [ ] **Step 4: Type-check**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Manual test**

Start dev server, log in as admin, visit `/admin/mineru`.
Expected: Page shows MinerU health stats and recent document processing.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/[locale]/admin/mineru apps/web/app/[locale]/admin/layout.tsx
git commit -m "feat(admin): add MinerU monitoring page"
```

---

## Task 16: End-to-end verification

- [ ] **Step 1: Type-check everything**

Run: `cd apps/web && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 2: Prettier format**

Run: `cd apps/web && npm run format:check`
If fails: `npm run format` then re-check.

- [ ] **Step 3: Lint**

Run: `cd apps/web && npm run lint`
Expected: No new errors (existing `no-explicit-any` warnings are pre-existing).

- [ ] **Step 4: Start dev server and manual smoke test**

Run: `cd apps/web && npm run dev`

Verify each:
- [ ] Upload `.pdf` with tables + equations → renders as HTML with native tables and formula images
- [ ] Upload `.docx` → processes through MinerU, renders as HTML
- [ ] Upload `.pptx` → processes through MinerU, renders as HTML
- [ ] Upload `.md` → renders via Markdown (fallback path)
- [ ] Upload `.txt` → renders as plain text
- [ ] Try `.xlsx` → rejected with clear error message (both client and server)
- [ ] Add a Webpage URL → renders as HTML
- [ ] Add a WeChat article → renders as HTML (with images)
- [ ] Visit `/admin/mineru` as admin → see health + recent sources
- [ ] Wiki ingest still works on new sources (check wiki panel updates)
- [ ] Chat with notebook → citations still work

- [ ] **Step 5: Push**

```bash
git push
```

---

## Self-Review Notes

### Spec coverage

| Spec section | Task(s) |
|---|---|
| Data Model — Prisma changes | Task 1 |
| MinerU async Task API | Tasks 2, 4 |
| ZIP extraction + content_list_v2 | Task 3 |
| storeImagesAndRewriteMarkdown return shape | Task 5 |
| Content list → HTML builder | Task 6 |
| Unified MinerU processor (PDF/DOCX/PPT) | Task 7 |
| Upload validation + routing | Tasks 8, 9 |
| WeChat contentHtml | Task 10 |
| Webpage contentHtml | Task 11 |
| SourceHtmlView component | Task 12 |
| Tiered render in SourceContentView | Task 13 |
| Admin MinerU health API | Task 14 |
| Admin MinerU page | Task 15 |
| Verification | Task 16 |

All spec sections covered.

### Type consistency
- `MineruResult` shape stable across Tasks 3, 4, 7
- `storeImagesAndRewriteMarkdown` return `{ markdown, imagePathToApiUrl }` consistent in Tasks 5, 7, 11
- `SourceHtmlView` props (`html`, `sourceId`, `className`) consistent between Tasks 12, 13

### No placeholders
- All code blocks complete, no TBD/TODO
- All file paths absolute
- All commands have expected output
