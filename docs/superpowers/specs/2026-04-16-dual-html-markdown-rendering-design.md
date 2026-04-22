# Dual HTML/Markdown Source Rendering — Design Spec

**Date**: 2026-04-16
**Scope**: Refactor source content storage and rendering so "rich-format" sources store both HTML (for rendering) and Markdown (for agent consumption), while simple sources continue with Markdown-only.

## Problem

Current source rendering pipeline has fragile LaTeX/math handling:
- MinerU returns markdown with LaTeX delimiters that our `preprocessLatex` function breaks in edge cases (nested `\begin{array}`, equations inside `$$` blocks).
- Native HTML tables from MinerU (`content_list_v2.json` `table_body` field) are converted lossily through markdown round-trip.
- Formula images pre-rendered by MinerU are ignored; we try to re-render LaTeX in the browser and fail.
- WeChat articles already have a proven dual-content pattern (`content_html` + `content_text`) that works well.

The goal: adopt WeChat's dual-content pattern across all "rich-format" source types — PDF, DOCX, PPT, Webpage, WeChat.

## Non-Goals

- No changes to agent pipelines (RAG / wiki ingest / chat context). They continue consuming markdown.
- No migration of existing sources. New imports get HTML; old sources gracefully fall back to markdown rendering.
- No support for file types outside the allowed list. Anything else is rejected at upload.

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│ Source Input                                              │
│  PDF / DOCX / PPT → MinerU                                │
│  Webpage URL     → Playwright                             │
│  WeChat Article  → External DB                            │
│  TXT / MD        → Read as-is                             │
└──────────────────────────────────────────────────────────┘
                             ↓
┌──────────────────────────────────────────────────────────┐
│ Source Storage (Prisma Source model)                      │
│   contentHtml      (new, nullable) — for rendering        │
│   markdownContent  (existing)      — for agent pipelines  │
│   content          (existing)      — same as markdown     │
└──────────────────────────────────────────────────────────┘
                             ↓
              ┌──────────────┴──────────────┐
              ↓                              ↓
  ┌────────────────────┐         ┌──────────────────────┐
  │ Frontend Render    │         │ Agent Pipelines      │
  │  contentHtml ?     │         │  - Wiki ingest       │
  │   → SourceHtmlView │         │  - RAG chunks        │
  │  else              │         │  - Chat context      │
  │   → Markdown       │         │ Always use markdown  │
  └────────────────────┘         └──────────────────────┘
```

## Data Model

### Prisma Source changes

```prisma
model Source {
  // ... existing fields
  content         String?   // Markdown (existing, for agent)
  markdownContent String?   // Markdown preview (existing)
  contentHtml     String?   // NEW — rich HTML for rendering
  // ...
}
```

Migration: Add a nullable `contentHtml TEXT` column. No backfill — existing rows keep `contentHtml = NULL` and render via markdown fallback.

## Source Type Matrix

| Source Type | Processor | contentHtml | markdownContent | Rendering |
|---|---|---|---|---|
| `.pdf` | MinerU | ✅ built from `content_list_v2.json` | ✅ from `*.md` | HTML |
| `.docx` / `.doc` | MinerU | ✅ same | ✅ same | HTML |
| `.pptx` / `.ppt` | MinerU | ✅ same | ✅ same | HTML |
| `.txt` / `.md` | Text | ❌ | ✅ file content | Markdown |
| Webpage URL | Playwright | ✅ cleaned HTML | ✅ markdown | HTML |
| WeChat Article | WeChat DB | ✅ original `content_html` | ✅ markdown | HTML |
| Other extensions | — | — | — | **Upload rejected** |

## MinerU Integration

### Migration: sync `/file_parse` → async Task API

MinerU 3.0+ exposes an async Task API that's more reliable than the synchronous endpoint:

```
POST /tasks                    → returns { task_id, status_url, result_url }
GET  /tasks/{task_id}          → poll until status == "completed" | "failed"
GET  /tasks/{task_id}/result   → download ZIP
```

Replace `parsePdfLocal` sync logic with:

```typescript
async function parseDocumentViaMineru(filePath: string): Promise<MineruResult> {
  const { task_id } = await submitMineruTask(filePath, {
    return_md: true,
    return_content_list: true,   // produces content_list_v2.json
    return_images: true,
    response_format_zip: true,
    backend: "hybrid-auto-engine",
    formula_enable: true,
    table_enable: true,
  });

  await pollMineruTask(task_id, { interval: 2000, maxAttempts: 300 }); // 10 min

  const zipBuffer = await downloadMineruResult(task_id);
  return extractFromZipBuffer(zipBuffer);
}
```

### ZIP extraction — new return shape

```typescript
interface MineruResult {
  markdown: string;
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[];
  contentList?: ContentListV2Item[];  // NEW — parsed from content_list_v2.json
}
```

`extractFromZipBuffer` additionally looks for `*_content_list_v2.json` and parses it.

### API mode stays the same

Cloud `mineru.net/api/v4` already returns ZIP via `full_zip_url`. Pass the same `return_content_list=true` flag and the ZIP will include `content_list_v2.json`.

## Content List → HTML Builder

New file: `lib/services/content-list-to-html.ts`

```typescript
export function buildHtmlFromContentList(
  contentList: ContentListV2Item[],
  imagePathToApiUrl: Map<string, string>
): string
```

### Type → HTML mapping

| `type` | Output |
|---|---|
| `title` (level 1-6) | `<h1>` ~ `<h6>` with `text` content |
| `paragraph` | `<p>` with inline text/equation spans |
| `equation_interline` | `<div class="math-block"><img src="{api-url}" alt="{latex}"></div>` |
| `image` | `<figure><img src="{api-url}"><figcaption>{caption}</figcaption></figure>` |
| `table` | `table_body` HTML passed through (MinerU's native `<table>`) |
| `chart` | `<figure><img src="{api-url}"><figcaption>{caption}</figcaption></figure>` |
| `code` | `<pre><code class="lang-{language}">{body}</code></pre>` |
| `algorithm` | `<pre class="algorithm"><code>{body}</code></pre>` |
| `list` | `<ul>` / `<ol>` from `list_items` |
| `page_header`, `page_footer`, etc. | **Skipped** (noise) |

### Image URL resolution

The builder takes `imagePathToApiUrl: Map<string, string>` — built during `storeImagesAndRewriteMarkdown`. For each image reference (by full path or filename), it substitutes `/api/images/{sourceImageId}`.

### Sanitization

After building, `DOMPurify.sanitize` with an allowlist:
- Tags: default + `figure`, `figcaption`, `table`, `thead`, `tbody`, `tr`, `th`, `td`
- Attrs: default + `colspan`, `rowspan`, `data-src`

## Processor Changes

### MinerU unified processor

Rename `pdf-processor.ts` → `mineru-processor.ts`. Handle PDF/DOCX/PPT:

```typescript
// lib/services/source-processors/mineru-processor.ts
export async function processMineruDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const tempPath = `/tmp/${context.sourceId}-${file.name}`;
  await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

  try {
    const result = await parseDocumentViaMineru(tempPath);

    const { markdown, imagePathToApiUrl } = await storeImagesAndRewriteMarkdown(
      context.sourceId, result.markdown, result.images
    );

    const contentHtml = result.contentList
      ? buildHtmlFromContentList(result.contentList, imagePathToApiUrl)
      : null;

    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: context.sourceId },
      data: {
        markdownContent: markdown,
        content: markdown,
        contentHtml,
        status: "READY",
        metadata: {
          fileType: file.name.split(".").pop()?.toLowerCase(),
          markdownLength: markdown.length,
          imageCount: result.images.length,
          hasHtml: !!contentHtml,
          toc,
        },
      },
    });

    await triggerWikiIngest(context);
    return { success: true };
  } finally {
    await unlink(tempPath).catch(() => {});
  }
}
```

### `storeImagesAndRewriteMarkdown` return shape

Currently returns `string` (rewritten markdown). Update to also return the mapping:

```typescript
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: ImageInput[],
): Promise<{ markdown: string; imagePathToApiUrl: Map<string, string> }>
```

The map's keys include all known aliases for each image (full path, filename, basename). The HTML builder uses it to resolve `img_path` references from `content_list_v2.json`.

### Webpage processor changes

`playwright-scraper.ts` currently returns `{ markdown, images, metadata }`. Add `html` field:

```typescript
interface ScrapeResult {
  html: string;      // NEW — cleaned/sanitized HTML
  markdown: string;  // existing — turndown conversion
  images: ImageInput[];
  metadata: { title, author, date };
}
```

In `webpage-processor.ts`, after storing images and rewriting markdown, rewrite image URLs in the HTML the same way (use the mapping) and store as `contentHtml`.

### WeChat processor changes

`addWechatSource` already builds image URL mappings when storing `SourceImage` records. Extend:

```typescript
// Build contentHtml by rewriting img src in the original article.content_html
const contentHtml = rewriteWechatImageUrls(article.content_html, {
  wechatIdToLocal,    // existing
  originalUrlToLocal, // existing
});

// Existing: build markdown via TurndownService
const markdownContent = td.turndown(article.content_html);

await prisma.source.update({
  data: { contentHtml, markdownContent, content: markdownContent, ... }
});
```

### Text/DOCX fallback processors

- `text-processor.ts` — no change. `contentHtml = null`.
- `fallback-processor.ts` — `processDocxDocument` removed (now handled by MinerU). Only truly unknown types go to `processFallbackDocument`.

## Upload Validation

### Client-side

`AddSourceDialog` file input:
```html
<input type="file"
  accept=".pdf,.docx,.doc,.pptx,.ppt,.txt,.md" />
```

### Server-side validation

`uploadDocumentSource` in `lib/actions/sources.ts`:

```typescript
const ALLOWED_EXTENSIONS = ["pdf", "docx", "doc", "pptx", "ppt", "txt", "md"];
const ext = file.name.split(".").pop()?.toLowerCase();
if (!ext || !ALLOWED_EXTENSIONS.includes(ext)) {
  throw new Error(
    `Unsupported file type "${ext}". Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`
  );
}
```

## Frontend Rendering

### SourceContentView tiered render

```tsx
function SourceContentView({ source, onBack }) {
  const rawHtml = source.contentHtml;
  const rawMd = source.markdownContent || source.content;

  if (rawHtml) {
    return <SourceHtmlView html={rawHtml} sourceId={source.id} />;
  }
  if (rawMd) {
    return <Markdown>{preprocessedMd}</Markdown>;
  }
  return <pre className="whitespace-pre-wrap">{source.content || "No content"}</pre>;
}
```

### New component `SourceHtmlView`

Location: `components/deepdive/sources/source-html-view.tsx`

Mirrors `WechatArticleContent` patterns:
- `dangerouslySetInnerHTML` with DOMPurify
- `useEffect` post-processing: intercept `<img>` with relative `src`, rewrite to fallback resolver `/api/images/by-source/{sourceId}/{path}`
- Images with `onerror` fallback to hide if both primary and resolver 404

### TOC

Continue using `source.metadata.toc` (from markdown). HTML view also uses same TOC — scrolling to `<h1>`-`<h3>` elements by text match (same logic as current implementation).

## Admin: MinerU Monitoring

New page: `app/[locale]/admin/mineru/page.tsx`

### Data sources
- `GET http://mineru-local/health` — MinerU status, version, queue counts, concurrency
- Prisma: recent 10 sources where `sourceType = "DOCUMENT"`, include status and errorMessage

### UI sections
1. **Status card** — healthy/unhealthy + version + protocol version
2. **Queue stats** — queued / processing / completed / failed counts, max concurrent
3. **Recent Processing** — table of last 10 document sources: title, status, duration, error message

### API endpoint
`GET /api/admin/mineru/health` — proxies MinerU `/health`, requires admin session.

### Navigation
Add "MinerU" entry to admin sidebar, same level as Users / Venues / Sessions.

## Error Handling & Fallbacks

| Scenario | Behavior |
|---|---|
| MinerU task submission fails | Source → FAILED, errorMessage recorded |
| MinerU task polling times out (>10 min) | Source → FAILED, errorMessage = "MinerU timeout" |
| ZIP has no `content_list_v2.json` | `contentHtml = null`; markdown still stored; UI falls back to Markdown renderer |
| HTML builder throws on unknown block type | Skip block, log warning, continue |
| DOMPurify strips all content | Fallback to Markdown renderer client-side |
| `contentHtml` field is null | SourceContentView uses Markdown path |

## Testing Strategy

### Manual verification
- Upload a PDF with complex math (Fourier Position paper) — equations render via MinerU images, not LaTeX
- Upload a DOCX — formatting preserved
- Upload a PPTX — slides' structure preserved
- Upload a .md — plain markdown render
- Add a webpage URL — HTML render
- Add a WeChat article — HTML render (existing pattern, confirm unchanged)
- Try to upload `.xlsx` — rejected with clear error

### Regression checks
- Wiki ingest still works (uses `markdownContent`)
- Chat RAG still cites correctly
- Existing sources (without `contentHtml`) still render via Markdown

## Rollout

1. **Phase 1** — Schema: add `contentHtml` column. Deploy. No code changes yet, existing app keeps working.
2. **Phase 2** — MinerU client migration + content list parser + HTML builder. Turn on for PDF uploads only.
3. **Phase 3** — Extend to DOCX/PPT (same MinerU processor). Update upload validation.
4. **Phase 4** — Extend to Webpage (Playwright HTML) and WeChat (original HTML).
5. **Phase 5** — Admin MinerU monitoring page.

Each phase is independently deployable and rollback-safe because `contentHtml` is nullable and rendering falls back to Markdown.

## Open Questions (Resolved)

- ~~Should we also store HTML for .txt/.md files?~~ → No. No rich structure to preserve.
- ~~Should unsupported types be silently ignored or rejected?~~ → Rejected at upload with clear error.
- ~~Use WeChat-style `content_html` or new field name?~~ → `contentHtml` (camelCase, Prisma convention).
- ~~Path for MinerU admin page?~~ → `/admin/mineru`, same level as existing admin pages.
