# Lightweight Notebook RAG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace RagFlow + Crawl4AI + MinIO with PageIndex + Playwright + PostgreSQL bytea for a lighter, more capable notebook RAG pipeline.

**Architecture:** Documents are parsed (MinerU for PDF, Playwright for webpages, direct for text/blogs), indexed into hierarchical trees via PageIndex, and stored as JSON in PostgreSQL. Retrieval uses LLM reasoning over these trees instead of vector similarity. Images stored as raw binary in PG, eliminating MinIO.

**Tech Stack:** PageIndex (Python lib), Playwright (Node.js), MinerU (local/cloud API), Prisma 7, LangGraph, Next.js 16

**Spec:** `docs/superpowers/specs/2026-04-02-lightweight-notebook-rag-design.md`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `apps/web/lib/services/mineru-client.ts` | Dual-mode MinerU provider (local vs cloud API) |
| `apps/web/lib/services/playwright-scraper.ts` | Playwright-based web scraper (replaces Crawl4AI) |
| `apps/web/app/api/images/[id]/route.ts` | Image serving endpoint from PG bytea |
| `apps/agent/tools/pageindex_tools.py` | PageIndex-based search, explore, read_section tools |
| `apps/agent/utils/pageindex_client.py` | Wrapper around PageIndex library for indexing + retrieval |

### Modified Files
| File | Changes |
|------|---------|
| `apps/web/prisma/schema.prisma` | Remove ragflow fields, Chunk model; update SourceImage for bytea; add indexData/markdownContent to Source |
| `apps/web/lib/services/source-processors/pdf-processor.ts` | Rewrite: use mineru-client, store images in PG, call agent for PageIndex indexing |
| `apps/web/lib/services/source-processors/webpage-processor.ts` | Rewrite: use playwright-scraper instead of Crawl4AI |
| `apps/web/lib/services/source-processors/text-processor.ts` | Simplify: remove RagFlow upload, store markdown directly |
| `apps/web/lib/services/source-service.ts` | Remove ragflowDatasetId parameter |
| `apps/web/lib/actions/notebooks.ts` | Remove ensureRagFlowDataset, RagFlow dataset cleanup |
| `apps/web/lib/actions/sources.ts` | Remove RagFlow sync, S3 cleanup; add PageIndex indexing trigger |
| `apps/web/app/api/notebooks/[id]/sources/status/route.ts` | Simplify: no RagFlow polling, just return source status |
| `apps/web/components/deepdive/sources/sources-panel.tsx` | Remove RagFlow progress display, simplify polling |
| `apps/agent/graphs/rag_agent.py` | Register PageIndex tools instead of RagFlow tools |
| `apps/agent/config/rag_agent.py` | Remove dataset_ids, update context schema |
| `apps/agent/middleware/sources_context.py` | Load from Source.indexData tree summaries |
| `apps/agent/requirements.txt` | Replace ragflow-sdk with pageindex |

### Files to Delete
| File | Reason |
|------|--------|
| `apps/web/lib/ragflow-client.ts` | RagFlow removed |
| `apps/web/lib/utils/ragflow-status.ts` | RagFlow removed |
| `apps/web/lib/s3-client.ts` | MinIO removed |

---

## Task 1: Database Schema Migration

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

This task updates the Prisma schema to remove RagFlow-specific fields, add PageIndex storage fields, and convert image storage from S3 references to bytea.

- [ ] **Step 1: Update the Source model**

In `apps/web/prisma/schema.prisma`, find the `Source` model and make these changes:
- Remove `ragflowDocumentId` field
- Add `indexData` (Json, optional) for PageIndex tree
- Add `markdownContent` (Text, optional) for full markdown preview
- Keep existing `errorMessage` field (already present)
- Add `PARTIAL` to `SourceStatus` enum

```prisma
enum SourceStatus { UPLOADING, PROCESSING, READY, PARTIAL, FAILED }

model Source {
  id              String       @id @default(cuid())
  notebookId      String
  title           String
  sourceType      SourceType
  url             String?
  fileKey         String?
  content         String?      @db.Text
  markdownContent String?      @db.Text
  indexData       Json?
  status          SourceStatus @default(UPLOADING)
  errorMessage    String?
  metadata        Json?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  notebook Notebook      @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  images   SourceImage[]

  @@map("sources")
}
```

- [ ] **Step 2: Update the Notebook model**

Remove RagFlow-specific fields from the Notebook model:

```prisma
model Notebook {
  id          String  @id @default(cuid())
  userId      String
  name        String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  sources      Source[]
  chatSessions ChatSession[]
  messages     ChatMessage[]
  notes        Note[]

  @@unique([userId, name])
  @@map("notebooks")
}
```

Fields removed: `ragflowDatasetId`, `ragflowAgentId`, `ragflowChatId`.

- [ ] **Step 3: Update the SourceImage model for bytea storage**

Replace the S3 `storageKey` reference with actual binary `data`:

```prisma
model SourceImage {
  id           String   @id @default(cuid())
  sourceId     String
  originalName String
  mimeType     String
  data         Bytes
  width        Int?
  height       Int?
  createdAt    DateTime @default(now())

  source Source @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId])
  @@map("source_images")
}
```

Fields removed: `storageKey`, `contentType`. Fields added: `mimeType` (replaces contentType), `data` (Bytes, replaces S3 reference).

- [ ] **Step 4: Remove the Chunk model**

Delete the entire `Chunk` model block and its relation from Source:

```prisma
// DELETE THIS ENTIRE BLOCK:
model Chunk {
  id             String  @id
  sourceId       String
  contentPreview String  @db.VarChar(200)
  contentSuffix  String? @db.VarChar(200)
  position       Int     @default(0)

  source Source @relation(fields: [sourceId], references: [id], onDelete: Cascade)

  @@index([sourceId])
  @@map("chunks")
}
```

Also remove `chunks Chunk[]` from the Source model relations.

- [ ] **Step 5: Generate Prisma client and create migration**

Run:
```bash
cd apps/web && npx prisma generate
```
Expected: Prisma client regenerated successfully.

Then create the migration:
```bash
cd apps/web && npx prisma migrate dev --name remove-ragflow-add-pageindex
```
Expected: Migration created. If there's existing data, Prisma will warn about dropping columns — accept this for dev.

- [ ] **Step 6: Commit**

```bash
git add apps/web/prisma/
git commit -m "feat(schema): remove ragflow fields, add pageindex storage, convert images to bytea"
```

---

## Task 2: Image Serving API Route

**Files:**
- Create: `apps/web/app/api/images/[id]/route.ts`

This task creates the API endpoint that serves images stored as bytea in PostgreSQL, replacing MinIO/S3 URLs.

- [ ] **Step 1: Create the image serving route**

Create `apps/web/app/api/images/[id]/route.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const image = await prisma.sourceImage.findUnique({
    where: { id },
    select: { data: true, mimeType: true },
  });

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  return new NextResponse(image.data, {
    headers: {
      "Content-Type": image.mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
```

- [ ] **Step 2: Verify the route works**

Run the dev server and test:
```bash
cd apps/web && npm run dev
```

After inserting a test image via Prisma Studio or a seed script, verify:
```bash
curl -I http://localhost:3001/api/images/<test-id>
```
Expected: HTTP 200 with correct Content-Type header, or HTTP 404 if no test image.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/api/images/
git commit -m "feat(api): add image serving route from PostgreSQL bytea"
```

---

## Task 3: MinerU Dual-Mode Client

**Files:**
- Create: `apps/web/lib/services/mineru-client.ts`

This task creates a MinerU client that supports both local (self-hosted) and cloud API modes. The cloud API uses `mineru.net/api/v4` with Bearer token auth, async submit+poll pattern.

- [ ] **Step 1: Create the MinerU client**

Create `apps/web/lib/services/mineru-client.ts`:

```typescript
import { readFile } from "fs/promises";

interface MineruResult {
  markdown: string;
  images: { name: string; data: Buffer; mimeType: string }[];
}

const MINERU_MODE = process.env.MINERU_MODE || "local";
const MINERU_LOCAL_URL = process.env.MINERU_LOCAL_URL || "http://localhost:8000";
const MINERU_API_TOKEN = process.env.MINERU_API_TOKEN || "";

/**
 * Parse a PDF file using MinerU (local instance or cloud API).
 * Returns extracted markdown and images.
 */
export async function parsePdf(
  filePathOrUrl: string,
  options?: { modelVersion?: string }
): Promise<MineruResult> {
  if (MINERU_MODE === "api") {
    return parsePdfViaApi(filePathOrUrl, options);
  }
  return parsePdfLocal(filePathOrUrl);
}

// --- Local Mode (self-hosted MinerU at MINERU_LOCAL_URL) ---

async function parsePdfLocal(filePath: string): Promise<MineruResult> {
  const fileBuffer = await readFile(filePath);
  const formData = new FormData();
  formData.append("file", new Blob([fileBuffer]), filePath.split("/").pop()!);
  formData.append("parse_method", "auto");

  const response = await fetch(`${MINERU_LOCAL_URL}/api/v1/extract`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`MinerU local parse failed: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return extractFromLocalResult(result);
}

function extractFromLocalResult(result: Record<string, unknown>): MineruResult {
  // Local MinerU returns markdown content and image paths directly
  const markdown = (result.markdown as string) || "";
  const images: MineruResult["images"] = [];

  if (result.images && Array.isArray(result.images)) {
    for (const img of result.images) {
      images.push({
        name: img.name || "image.png",
        data: Buffer.from(img.data, "base64"),
        mimeType: img.content_type || "image/png",
      });
    }
  }

  return { markdown, images };
}

// --- API Mode (mineru.net cloud API) ---

async function parsePdfViaApi(
  fileUrl: string,
  options?: { modelVersion?: string }
): Promise<MineruResult> {
  if (!MINERU_API_TOKEN) {
    throw new Error("MINERU_API_TOKEN is required when MINERU_MODE=api");
  }

  const modelVersion = options?.modelVersion || "vlm";
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${MINERU_API_TOKEN}`,
  };

  // Step 1: Submit extraction task
  const submitRes = await fetch("https://mineru.net/api/v4/extract/task", {
    method: "POST",
    headers,
    body: JSON.stringify({ url: fileUrl, model_version: modelVersion }),
  });

  if (!submitRes.ok) {
    throw new Error(`MinerU API submit failed: ${submitRes.status}`);
  }

  const submitData = await submitRes.json();
  if (submitData.code !== 0) {
    throw new Error(`MinerU API submit error: ${submitData.msg}`);
  }

  const taskId = submitData.data.task_id;

  // Step 2: Poll for completion
  const result = await pollMineruTask(taskId, headers);

  // Step 3: Download and extract zip
  return downloadAndExtractZip(result.full_zip_url);
}

async function pollMineruTask(
  taskId: string,
  headers: Record<string, string>,
  maxAttempts = 120,
  intervalMs = 3000
): Promise<{ full_zip_url: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, intervalMs));

    const res = await fetch(`https://mineru.net/api/v4/extract/task/${taskId}`, {
      headers,
    });

    if (!res.ok) continue;

    const data = await res.json();
    const state = data.data?.state;

    if (state === "done") {
      return { full_zip_url: data.data.full_zip_url };
    }
    if (state === "failed") {
      throw new Error(`MinerU extraction failed: ${data.data.err_msg || "unknown error"}`);
    }
    // "pending", "running", "converting" — keep polling
  }

  throw new Error(`MinerU extraction timed out after ${maxAttempts * intervalMs / 1000}s`);
}

async function downloadAndExtractZip(zipUrl: string): Promise<MineruResult> {
  const { default: JSZip } = await import("jszip");

  const response = await fetch(zipUrl);
  if (!response.ok) {
    throw new Error(`Failed to download MinerU result zip: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let markdown = "";
  const images: MineruResult["images"] = [];

  for (const [path, file] of Object.entries(zip.files)) {
    if (file.dir) continue;

    if (path.endsWith(".md") && path.includes("full")) {
      markdown = await file.async("string");
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
        data: Buffer.from(data),
        mimeType: mimeMap[ext] || "image/png",
      });
    }
  }

  return { markdown, images };
}
```

- [ ] **Step 2: Add jszip dependency**

```bash
cd apps/web && npm install jszip
```

- [ ] **Step 3: Add environment variables to .env.example**

In `apps/web/.env.example`, add:
```bash
# MinerU Configuration
MINERU_MODE=local          # "local" or "api"
MINERU_LOCAL_URL=http://localhost:8000
MINERU_API_TOKEN=          # Required when MINERU_MODE=api
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/services/mineru-client.ts apps/web/.env.example apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add dual-mode MinerU client (local + cloud API)"
```

---

## Task 4: Playwright Web Scraper

**Files:**
- Create: `apps/web/lib/services/playwright-scraper.ts`

Replaces Crawl4AI with a Playwright-based scraper that works for WeChat articles, Medium, Substack, and general blog pages.

- [ ] **Step 1: Install Playwright**

```bash
cd apps/web && npm install playwright
npx playwright install chromium
```

- [ ] **Step 2: Create the Playwright scraper**

Create `apps/web/lib/services/playwright-scraper.ts`:

```typescript
import { chromium, type Page } from "playwright";

interface ScrapeResult {
  markdown: string;
  images: { name: string; data: Buffer; mimeType: string }[];
  metadata: { title: string; author?: string; date?: string };
}

/**
 * Scrape a webpage and extract content as markdown + images.
 * Handles WeChat articles, Medium, Substack, and general blog pages.
 */
export async function scrapeWebpage(url: string): Promise<ScrapeResult> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Handle WeChat lazy-loaded images
    if (url.includes("mp.weixin.qq.com")) {
      await handleWeChatImages(page);
    }

    // Scroll to trigger lazy loading on any page
    await autoScroll(page);

    const metadata = await extractMetadata(page, url);
    const { markdown, imageUrls } = await extractContent(page, url);
    const images = await downloadImages(imageUrls, page);

    return { markdown, images, metadata };
  } finally {
    await browser.close();
  }
}

async function handleWeChatImages(page: Page): Promise<void> {
  // WeChat uses data-src for lazy loading instead of src
  await page.evaluate(() => {
    document.querySelectorAll("img[data-src]").forEach((img) => {
      const dataSrc = img.getAttribute("data-src");
      if (dataSrc) {
        img.setAttribute("src", dataSrc);
      }
    });
  });
  // Wait for images to start loading
  await page.waitForTimeout(2000);
}

async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
      // Safety timeout
      setTimeout(() => {
        clearInterval(timer);
        resolve();
      }, 10000);
    });
  });
}

async function extractMetadata(
  page: Page,
  url: string
): Promise<ScrapeResult["metadata"]> {
  return page.evaluate((pageUrl) => {
    const title =
      document.querySelector("h1")?.textContent?.trim() ||
      document.querySelector('meta[property="og:title"]')?.getAttribute("content") ||
      document.title ||
      "Untitled";

    let author: string | undefined;
    // WeChat
    if (pageUrl.includes("mp.weixin.qq.com")) {
      author =
        document.querySelector("#js_name")?.textContent?.trim() ||
        document.querySelector(".rich_media_meta_nickname")?.textContent?.trim();
    } else {
      author =
        document.querySelector('meta[name="author"]')?.getAttribute("content") ||
        document.querySelector('[rel="author"]')?.textContent?.trim() ||
        undefined;
    }

    const date =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute("content") ||
      document.querySelector("time")?.getAttribute("datetime") ||
      undefined;

    return { title, author, date: date || undefined };
  }, url);
}

async function extractContent(
  page: Page,
  url: string
): Promise<{ markdown: string; imageUrls: string[] }> {
  return page.evaluate((pageUrl) => {
    // Find the article content container
    let container: Element | null = null;

    if (pageUrl.includes("mp.weixin.qq.com")) {
      container = document.querySelector("#js_content");
    } else {
      container =
        document.querySelector("article") ||
        document.querySelector('[role="main"]') ||
        document.querySelector(".post-content") ||
        document.querySelector(".entry-content") ||
        document.querySelector(".article-content") ||
        document.querySelector("main");
    }

    if (!container) {
      container = document.body;
    }

    const imageUrls: string[] = [];
    let imgIndex = 0;

    // Convert DOM to markdown
    function nodeToMarkdown(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        return node.textContent?.trim() || "";
      }

      if (node.nodeType !== Node.ELEMENT_NODE) return "";

      const el = node as Element;
      const tag = el.tagName.toLowerCase();

      // Skip non-content elements
      if (["script", "style", "nav", "footer", "aside", "iframe"].includes(tag)) {
        return "";
      }

      // WeChat: skip share/follow CTAs
      if (
        el.id === "js_pc_qr_code" ||
        el.classList.contains("qr_code_pc") ||
        el.classList.contains("rich_media_tool")
      ) {
        return "";
      }

      const children = Array.from(node.childNodes)
        .map(nodeToMarkdown)
        .join("");

      switch (tag) {
        case "h1":
          return `\n# ${children}\n`;
        case "h2":
          return `\n## ${children}\n`;
        case "h3":
          return `\n### ${children}\n`;
        case "h4":
          return `\n#### ${children}\n`;
        case "h5":
          return `\n##### ${children}\n`;
        case "h6":
          return `\n###### ${children}\n`;
        case "p":
          return `\n${children}\n`;
        case "br":
          return "\n";
        case "strong":
        case "b":
          return `**${children}**`;
        case "em":
        case "i":
          return `*${children}*`;
        case "code":
          return `\`${children}\``;
        case "pre":
          return `\n\`\`\`\n${el.textContent}\n\`\`\`\n`;
        case "a": {
          const href = el.getAttribute("href");
          return href ? `[${children}](${href})` : children;
        }
        case "img": {
          const src =
            el.getAttribute("data-src") || el.getAttribute("src") || "";
          if (src && !src.startsWith("data:")) {
            const name = `image_${imgIndex++}`;
            imageUrls.push(src);
            return `\n![${el.getAttribute("alt") || name}](${name})\n`;
          }
          return "";
        }
        case "ul":
          return `\n${Array.from(el.children)
            .map((li) => `- ${nodeToMarkdown(li)}`)
            .join("\n")}\n`;
        case "ol":
          return `\n${Array.from(el.children)
            .map((li, i) => `${i + 1}. ${nodeToMarkdown(li)}`)
            .join("\n")}\n`;
        case "blockquote":
          return `\n> ${children}\n`;
        case "table":
          return convertTable(el);
        case "div":
        case "section":
        case "span":
        case "li":
          return children;
        default:
          return children;
      }
    }

    function convertTable(table: Element): string {
      const rows = Array.from(table.querySelectorAll("tr"));
      if (rows.length === 0) return "";

      const mdRows = rows.map((row) =>
        Array.from(row.querySelectorAll("th, td"))
          .map((cell) => cell.textContent?.trim() || "")
          .join(" | ")
      );

      if (mdRows.length >= 1) {
        const header = mdRows[0];
        const colCount = header.split(" | ").length;
        const separator = Array(colCount).fill("---").join(" | ");
        return `\n| ${header} |\n| ${separator} |\n${mdRows
          .slice(1)
          .map((r) => `| ${r} |`)
          .join("\n")}\n`;
      }
      return "";
    }

    const markdown = nodeToMarkdown(container!)
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return { markdown, imageUrls };
  }, url);
}

async function downloadImages(
  imageUrls: string[],
  page: Page
): Promise<ScrapeResult["images"]> {
  const images: ScrapeResult["images"] = [];

  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const url = imageUrls[i];
      // Use page context to download (handles cookies/auth)
      const response = await page.context().request.get(url);
      if (response.ok()) {
        const data = await response.body();
        const contentType = response.headers()["content-type"] || "image/png";
        const ext = contentType.includes("jpeg") || contentType.includes("jpg")
          ? "jpg"
          : contentType.includes("gif")
            ? "gif"
            : contentType.includes("webp")
              ? "webp"
              : "png";
        images.push({
          name: `image_${i}.${ext}`,
          data: Buffer.from(data),
          mimeType: contentType.split(";")[0],
        });
      }
    } catch {
      // Skip failed image downloads — non-critical
      continue;
    }
  }

  return images;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/services/playwright-scraper.ts apps/web/package.json apps/web/package-lock.json
git commit -m "feat: add Playwright web scraper replacing Crawl4AI"
```

---

## Task 5: PageIndex Python Integration

**Files:**
- Create: `apps/agent/utils/pageindex_client.py`
- Create: `apps/agent/tools/pageindex_tools.py`
- Modify: `apps/agent/requirements.txt`

This task integrates PageIndex into the Python agent for document indexing and retrieval.

- [ ] **Step 1: Add PageIndex to requirements**

In `apps/agent/requirements.txt`, replace `ragflow-sdk` with:
```
# PageIndex for document indexing
pageindex
```

Keep all other dependencies. Run:
```bash
cd apps/agent && pip install -r requirements.txt
```

- [ ] **Step 2: Create the PageIndex client wrapper**

Create `apps/agent/utils/pageindex_client.py`:

```python
"""
Wrapper around PageIndex library for document indexing and retrieval.
Supports both PDF files (native) and markdown content (via md_to_tree).
"""

import json
import os
from pathlib import Path

from pageindex import page_index, md_to_tree

PAGEINDEX_MODEL = os.getenv("PAGEINDEX_MODEL", "gpt-4o-2024-11-20")


def index_pdf(pdf_path: str) -> dict:
    """Index a PDF file into a hierarchical tree structure.

    Args:
        pdf_path: Path to the PDF file on disk.

    Returns:
        Tree structure dict with title, nodes, summaries, page ranges.
    """
    result = page_index(
        pdf_path=pdf_path,
        model=PAGEINDEX_MODEL,
        toc_check_pages=20,
        max_pages_per_node=10,
        max_tokens_per_node=20000,
        if_add_node_id=True,
        if_add_node_summary=True,
        if_add_doc_description=True,
    )
    return result


def index_markdown(markdown_content: str, title: str = "Document") -> dict:
    """Index markdown content into a hierarchical tree structure.

    Args:
        markdown_content: The markdown text to index.
        title: Document title for the tree root.

    Returns:
        Tree structure dict with title, nodes, summaries.
    """
    result = md_to_tree(
        markdown_content=markdown_content,
        model=PAGEINDEX_MODEL,
        if_add_node_id=True,
        if_add_node_summary=True,
    )
    return result


def retrieve(query: str, index_data: dict, model: str | None = None) -> list[dict]:
    """Retrieve relevant sections from an indexed document tree.

    Uses LLM reasoning to navigate the tree and find relevant sections.

    Args:
        query: The search query.
        index_data: The tree index (from index_pdf or index_markdown).
        model: Override model for retrieval (defaults to PAGEINDEX_MODEL).

    Returns:
        List of dicts with: title, summary, content, start_index, end_index, node_id
    """
    from pageindex import PageIndexClient

    client = PageIndexClient(
        model=model or PAGEINDEX_MODEL,
        retrieve_model=model or PAGEINDEX_MODEL,
    )

    # Use the tree structure for reasoning-based retrieval
    response = client.chat_completions(
        messages=[{"role": "user", "content": query}],
        tree=index_data,
    )

    # Extract referenced sections from the response
    sections = []
    if response and "choices" in response:
        content = response["choices"][0]["message"]["content"]
        # Parse section references from the response
        sections.append({
            "content": content,
            "tree": index_data,
        })

    return sections


def get_tree_summary(index_data: dict) -> str:
    """Get a human-readable summary of the document tree structure.

    Args:
        index_data: The tree index.

    Returns:
        Formatted string showing the tree hierarchy.
    """
    lines = []

    def walk(node: dict, depth: int = 0):
        indent = "  " * depth
        title = node.get("title", "Untitled")
        summary = node.get("summary", "")
        start = node.get("start_index", "?")
        end = node.get("end_index", "?")

        line = f"{indent}- {title} (pages {start}-{end})"
        if summary:
            line += f": {summary[:100]}"
        lines.append(line)

        for child in node.get("nodes", []):
            walk(child, depth + 1)

    structure = index_data.get("structure", index_data)
    walk(structure)
    return "\n".join(lines)


def find_section(index_data: dict, section_path: str) -> dict | None:
    """Find a specific section in the tree by node_id or title path.

    Args:
        index_data: The tree index.
        section_path: Node ID (e.g., "n2.1") or section title to find.

    Returns:
        The matching node dict, or None if not found.
    """
    structure = index_data.get("structure", index_data)

    def search(node: dict) -> dict | None:
        if node.get("node_id") == section_path:
            return node
        if node.get("title", "").lower() == section_path.lower():
            return node
        for child in node.get("nodes", []):
            result = search(child)
            if result:
                return result
        return None

    return search(structure)
```

- [ ] **Step 3: Create PageIndex agent tools**

Create `apps/agent/tools/pageindex_tools.py`:

```python
"""
LangChain tools for PageIndex-based document retrieval.
Replaces the RagFlow tools (explore, search, probe, get_first_chunk).
"""

import json
import os

import httpx
from langchain_core.tools import tool
from langgraph.types import ToolRuntime

from utils.pageindex_client import (
    retrieve,
    get_tree_summary,
    find_section,
)

# SparkFlow web app base URL for fetching source data
SPARKFLOW_API_URL = os.getenv("SPARKFLOW_API_URL", "http://localhost:3001")


def _get_sources_context(runtime: ToolRuntime) -> list[dict]:
    """Get sources context from runtime."""
    ctx = runtime.context if runtime else None
    if not ctx:
        return []
    return getattr(ctx, "sources_context", []) or []


@tool
def explore(runtime: ToolRuntime = None) -> str:
    """List all available documents in this notebook with their structure overview.

    Returns a summary of each document's hierarchical structure so you can
    understand what content is available before searching.
    """
    sources = _get_sources_context(runtime)

    if not sources:
        return "No documents available in this notebook."

    lines = []
    for source in sources:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        lines.append(f"## {title} [source:{source_id}]")

        if index_data:
            summary = get_tree_summary(index_data)
            lines.append(summary)
        else:
            lines.append("  (not indexed — content available for preview only)")

        lines.append("")

    return "\n".join(lines)


@tool
def search(query: str, runtime: ToolRuntime = None) -> str:
    """Search across all notebook documents using reasoning-based retrieval.

    This searches through document tree structures using LLM reasoning,
    not keyword matching. Ask natural questions.

    Args:
        query: Natural language question or search query.

    Returns:
        Relevant sections from documents with source references for citations.
    """
    sources = _get_sources_context(runtime)

    if not sources:
        return "No documents available to search."

    results = []
    for source in sources:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        if not index_data:
            continue

        try:
            sections = retrieve(query, index_data)
            for section in sections:
                results.append(
                    f"[source:{source_id} | {title}]\n{section.get('content', '')}"
                )
        except Exception as e:
            results.append(f"[source:{source_id} | {title}] Search error: {e}")

    if not results:
        return "No relevant content found for your query."

    return "\n\n---\n\n".join(results)


@tool
def read_section(
    source_id: str,
    section_path: str,
    runtime: ToolRuntime = None,
) -> str:
    """Read the full content of a specific section in a document.

    Use this for traceability — to read the actual text of a section
    referenced in search results.

    Args:
        source_id: The source ID from search results (e.g., "clxxx...").
        section_path: The node_id (e.g., "n2.1") or section title to read.

    Returns:
        The full content of the requested section.
    """
    sources = _get_sources_context(runtime)

    source = next((s for s in sources if s.get("id") == source_id), None)
    if not source:
        return f"Source {source_id} not found in this notebook."

    index_data = source.get("index_data")
    if not index_data:
        return f"Source {source_id} has no index data."

    node = find_section(index_data, section_path)
    if not node:
        return f"Section '{section_path}' not found in source {source_id}."

    title = node.get("title", "Untitled")
    summary = node.get("summary", "No summary available")
    start = node.get("start_index", "?")
    end = node.get("end_index", "?")
    node_id = node.get("node_id", "?")

    # Build section content from children if available
    children_info = ""
    for child in node.get("nodes", []):
        child_title = child.get("title", "")
        child_summary = child.get("summary", "")
        if child_title:
            children_info += f"\n  - {child_title}: {child_summary[:200]}"

    return (
        f"## {title} (node: {node_id}, pages {start}-{end})\n\n"
        f"{summary}\n"
        f"{children_info}"
    )


# Export tools list for agent registration
pageindex_tools = [explore, search, read_section]
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/utils/pageindex_client.py apps/agent/tools/pageindex_tools.py apps/agent/requirements.txt
git commit -m "feat(agent): add PageIndex tools replacing RagFlow retrieval"
```

---

## Task 6: Update RAG Agent Graph and Config

**Files:**
- Modify: `apps/agent/graphs/rag_agent.py` (lines 34-44 — tool registration)
- Modify: `apps/agent/config/rag_agent.py` (lines 17-28 — context schema)
- Modify: `apps/agent/middleware/sources_context.py`

This task wires the new PageIndex tools into the LangGraph agent, replacing the RagFlow tools.

- [ ] **Step 1: Update AgentContext config**

In `apps/agent/config/rag_agent.py`, update `AgentContext` to remove `dataset_ids` and update `sources_context` to carry index data:

```python
from dataclasses import dataclass, field
from typing import Any
import os


@dataclass
class RAGAgentConfig:
    model_provider: str = os.getenv("DEFAULT_MODEL_PROVIDER", "openai")
    model_name: str = os.getenv("DEFAULT_MODEL_NAME", "gpt-4o")


@dataclass
class AgentContext:
    sources_context: list[dict[str, Any]] = field(default_factory=list)
    model_provider: str = ""
    model_name: str = ""


RAG_AGENT_CONFIG = RAGAgentConfig()
```

Fields removed: `dataset_ids`. The `sources_context` now carries `id`, `title`, `index_data`, and `markdown_content` per source.

- [ ] **Step 2: Update agent graph to use PageIndex tools**

In `apps/agent/graphs/rag_agent.py`, replace the RagFlow tool imports at line 34-44:

Change the import from:
```python
from tools.ragflow import explore, search, probe, get_first_chunk
```
to:
```python
from tools.pageindex_tools import pageindex_tools
```

And update `_build_agent(model)` to use the new tools:
```python
def _build_agent(model):
    agent = create_react_agent(
        model,
        tools=pageindex_tools,
        checkpointer=MemorySaver(),
        state_schema=MessagesState,
        context_schema=AgentContext,
    )
    return agent
```

Remove any middleware registrations for `inject_sources_context` and `optimize_query` if they reference RagFlow-specific behavior. Keep the middleware if it still applies.

- [ ] **Step 3: Update sources_context middleware**

In `apps/agent/middleware/sources_context.py`, update `format_sources_context` to use PageIndex tree summaries instead of TOC headings:

```python
from utils.pageindex_client import get_tree_summary


def format_sources_context(sources_context: list) -> str:
    """Format sources as a knowledge base overview for the system prompt."""
    if not sources_context:
        return ""

    lines = ["## Knowledge Base Overview\n"]
    for source in sources_context:
        title = source.get("title", "Untitled")
        source_id = source.get("id", "unknown")
        index_data = source.get("index_data")

        lines.append(f"### {title} [source:{source_id}]")

        if index_data:
            summary = get_tree_summary(index_data)
            lines.append(summary)
        else:
            lines.append("(content available but not indexed)")

        lines.append("")

    return "\n".join(lines)
```

Keep the `inject_sources_context` middleware function structure the same — it still prepends a SystemMessage.

- [ ] **Step 4: Delete the old RagFlow tools file**

```bash
rm apps/agent/tools/ragflow.py
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/graphs/rag_agent.py apps/agent/config/rag_agent.py apps/agent/middleware/sources_context.py
git add -u  # picks up ragflow.py deletion
git commit -m "feat(agent): wire PageIndex tools into RAG agent graph"
```

---

## Task 7: Rewrite Source Processors

**Files:**
- Modify: `apps/web/lib/services/source-processors/pdf-processor.ts`
- Modify: `apps/web/lib/services/source-processors/webpage-processor.ts`
- Modify: `apps/web/lib/services/source-processors/text-processor.ts`
- Modify: `apps/web/lib/services/source-service.ts`

This task rewrites the three source processors to use the new MinerU client, Playwright scraper, and store images in PostgreSQL.

- [ ] **Step 1: Create a shared helper for image storage and markdown rewriting**

Add a utility function at the top of the source service or create a small helper. Add to `apps/web/lib/services/source-service.ts`:

```typescript
import { prisma } from "@/lib/prisma";

/**
 * Store extracted images in PostgreSQL and rewrite markdown image references.
 */
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: { name: string; data: Buffer; mimeType: string }[]
): Promise<string> {
  let rewrittenMarkdown = markdown;

  for (const image of images) {
    const savedImage = await prisma.sourceImage.create({
      data: {
        sourceId,
        originalName: image.name,
        mimeType: image.mimeType,
        data: image.data,
      },
    });

    // Rewrite markdown references from local names to API URLs
    rewrittenMarkdown = rewrittenMarkdown.replaceAll(
      image.name,
      `/api/images/${savedImage.id}`
    );
  }

  return rewrittenMarkdown;
}
```

- [ ] **Step 2: Rewrite PDF processor**

Replace the contents of `apps/web/lib/services/source-processors/pdf-processor.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { parsePdf } from "@/lib/services/mineru-client";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/markdown";

interface ProcessingContext {
  sourceId: string;
  notebookId: string;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
}

export async function processPdfDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    // Update status
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    // Parse PDF via MinerU (local or API mode)
    // For API mode, we need a URL. For local mode, we write to temp file.
    const tempPath = `/tmp/${sourceId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const { writeFile } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(arrayBuffer));

    const mineruResult = await parsePdf(tempPath);

    // Clean up temp file
    const { unlink } = await import("fs/promises");
    await unlink(tempPath).catch(() => {});

    // Store images in PG and rewrite markdown references
    const markdown = await storeImagesAndRewriteMarkdown(
      sourceId,
      mineruResult.markdown,
      mineruResult.images
    );

    // Extract TOC for metadata
    const toc = extractTocFromMarkdown(markdown);

    // Update source with markdown content
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdownContent: markdown,
        content: markdown,
        status: "READY",
        metadata: {
          fileType: "pdf",
          markdownLength: markdown.length,
          imageCount: mineruResult.images.length,
          toc,
        },
      },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });
    return { success: false, error: errorMessage };
  }
}
```

- [ ] **Step 3: Rewrite webpage processor**

Replace the contents of `apps/web/lib/services/source-processors/webpage-processor.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { scrapeWebpage } from "@/lib/services/playwright-scraper";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/markdown";

interface ProcessingContext {
  sourceId: string;
  notebookId: string;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
}

export async function processWebpage(
  url: string,
  title: string | undefined,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    // Scrape webpage using Playwright
    const result = await scrapeWebpage(url);

    // Store images in PG and rewrite markdown references
    const markdown = await storeImagesAndRewriteMarkdown(
      sourceId,
      result.markdown,
      result.images
    );

    // Use scraped title if none provided
    const finalTitle = title || result.metadata.title;

    // Extract TOC for metadata
    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: finalTitle,
        markdownContent: markdown,
        content: markdown,
        status: "READY",
        metadata: {
          author: result.metadata.author,
          publishDate: result.metadata.date,
          markdownLength: markdown.length,
          imageCount: result.images.length,
          toc,
        },
      },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });
    return { success: false, error: errorMessage };
  }
}
```

- [ ] **Step 4: Rewrite text processor**

Replace the contents of `apps/web/lib/services/source-processors/text-processor.ts`:

```typescript
import { prisma } from "@/lib/prisma";
import { extractTocFromMarkdown } from "@/lib/utils/markdown";

interface ProcessingContext {
  sourceId: string;
  notebookId: string;
}

interface ProcessingResult {
  success: boolean;
  error?: string;
}

export async function processTextDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const content = await file.text();
    const toc = extractTocFromMarkdown(content);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdownContent: content,
        content,
        status: "READY",
        metadata: {
          fileType: file.name.split(".").pop() || "txt",
          contentLength: content.length,
          toc,
        },
      },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });
    return { success: false, error: errorMessage };
  }
}
```

- [ ] **Step 5: Update source-service.ts**

In `apps/web/lib/services/source-service.ts`, remove the `ragflowDatasetId` parameter from `addWebpageSource` and `uploadDocumentSource`. Update the method signatures:

Change `addWebpageSource(notebookId, ragflowDatasetId, url, title?)` to `addWebpageSource(notebookId, url, title?)`.

Change `uploadDocumentSource(notebookId, ragflowDatasetId, file)` to `uploadDocumentSource(notebookId, file)`.

Remove all RagFlow references in method bodies. The `processInBackground` pattern stays the same.

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/services/
git commit -m "feat: rewrite source processors for MinerU + Playwright + PG storage"
```

---

## Task 8: Update Notebook and Source Actions

**Files:**
- Modify: `apps/web/lib/actions/notebooks.ts`
- Modify: `apps/web/lib/actions/sources.ts`
- Modify: `apps/web/app/api/notebooks/[id]/sources/status/route.ts`

This task removes all RagFlow and S3/MinIO references from server actions.

- [ ] **Step 1: Update notebooks.ts**

In `apps/web/lib/actions/notebooks.ts`:

Remove the `ensureRagFlowDataset()` function entirely (lines 131-165).

In `createNotebook()` (lines 26-55): remove the call to `ensureRagFlowDataset()` at line 43 and the cleanup logic. Simplify to just create the notebook:

```typescript
export async function createNotebook(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const notebook = await prisma.notebook.create({
    data: {
      userId: session.user.id,
      name,
      description,
    },
  });

  revalidatePath("/[locale]/deepdive", "page");
  return notebook;
}
```

In `deleteNotebook()` (lines 57-98): remove the RagFlow dataset deletion (lines 87-93) and S3 image deletion (lines 74-85). Image deletion is now handled by Prisma cascade (SourceImage belongs to Source belongs to Notebook):

```typescript
export async function deleteNotebook(id: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  await prisma.notebook.delete({
    where: { id, userId: session.user.id },
  });

  revalidatePath("/[locale]/deepdive", "page");
}
```

Remove the `ragflowClient` import.

- [ ] **Step 2: Update sources.ts**

In `apps/web/lib/actions/sources.ts`:

Remove the `syncSourceStatus()` function (lines 212-263) — no more RagFlow status sync.

In `deleteSource()` (lines 162-207): remove RagFlow document deletion (lines 179-189) and S3 file deletion (lines 191-202). Prisma cascade handles SourceImage cleanup:

```typescript
export async function deleteSource(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Unauthorized");
  }

  await prisma.source.delete({ where: { id: sourceId } });
  revalidatePath(`/[locale]/deepdive/${source.notebookId}`, "page");
}
```

In `addWebpageSource()` and `uploadDocumentSource()`: remove the `ragflowDatasetId` parameter passed to source service. Update calls to match the new signatures from Task 7 Step 5.

Remove imports: `ragflowClient`, `s3StorageClient`.

- [ ] **Step 3: Simplify the sources status route**

Rewrite `apps/web/app/api/notebooks/[id]/sources/status/route.ts` to simply return source statuses from the database (no RagFlow polling):

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  const notebook = await prisma.notebook.findUnique({
    where: { id: notebookId, userId: session.user.id },
    include: {
      sources: {
        orderBy: { createdAt: "desc" },
        include: {
          _count: { select: { images: true } },
        },
      },
    },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  return NextResponse.json({ sources: notebook.sources });
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/actions/notebooks.ts apps/web/lib/actions/sources.ts apps/web/app/api/notebooks/
git commit -m "feat: remove RagFlow/S3 from server actions, simplify status route"
```

---

## Task 9: Update Frontend Sources Panel

**Files:**
- Modify: `apps/web/components/deepdive/sources/sources-panel.tsx`

This task simplifies the sources panel by removing RagFlow-specific progress display and chunk-based navigation.

- [ ] **Step 1: Simplify status polling**

In `sources-panel.tsx`, the `useQuery` hook (lines 79-101) that polls `/api/notebooks/{id}/sources/status` can be simplified. The refetch logic stays but no longer needs to parse RagFlow progress:

Update the polling interval logic — poll every 5s if any source is PROCESSING or UPLOADING, otherwise don't poll:

```typescript
const { data: statusData } = useQuery({
  queryKey: ["sources-status", notebookId],
  queryFn: async () => {
    const res = await fetch(`/api/notebooks/${notebookId}/sources/status`);
    if (!res.ok) throw new Error("Failed to fetch status");
    return res.json();
  },
  refetchInterval: sources.some((s) =>
    ["PROCESSING", "UPLOADING"].includes(s.status)
  )
    ? 5000
    : false,
});
```

- [ ] **Step 2: Remove RagFlow progress display from SourceItem**

In `SourceItem` (lines 174-256), remove the RagFlow indexing progress indicator (lines 237-248). Replace with a simple status badge:

```tsx
{source.status === "PROCESSING" && (
  <span className="text-xs text-muted-foreground">Processing...</span>
)}
{source.status === "PARTIAL" && (
  <span className="text-xs text-yellow-500">Partial (preview only)</span>
)}
{source.status === "FAILED" && (
  <span className="text-xs text-red-500" title={source.errorMessage || undefined}>
    Failed
  </span>
)}
```

- [ ] **Step 3: Update SourceContentView to not use chunk highlighting**

In `SourceContentView` (lines 259-410+), remove the chunk-based scroll/highlight logic (lines 352-407). The component should just render `source.markdownContent` (or `source.content`) as markdown. Remove the `targetChunkId`, `targetContentPreview`, `targetContentSuffix`, and `onChunkNavigated` props since chunks no longer exist.

Update the parent `SourcesPanel` props to remove chunk-related props:

```typescript
interface SourcesPanelProps {
  notebookId: string;
  sources: Source[];
  selectedSource: Source | null;
  onSelectSource: (source: Source | null) => void;
}
```

Removed: `datasetId`, `targetChunkId`, `targetContentPreview`, `targetContentSuffix`, `navigationTrigger`, `onChunkNavigated`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/deepdive/sources/sources-panel.tsx
git commit -m "feat(ui): simplify sources panel, remove RagFlow progress and chunk navigation"
```

---

## Task 10: Delete Removed Files and Clean Up

**Files:**
- Delete: `apps/web/lib/ragflow-client.ts`
- Delete: `apps/web/lib/utils/ragflow-status.ts`
- Delete: `apps/web/lib/s3-client.ts`
- Modify: `apps/web/.env.example` (remove RAGFLOW_* and S3_* vars)
- Modify: `apps/agent/.env.example` (remove RAGFLOW_* vars, add PAGEINDEX_MODEL)

- [ ] **Step 1: Delete RagFlow and S3 client files**

```bash
rm apps/web/lib/ragflow-client.ts
rm apps/web/lib/utils/ragflow-status.ts
rm apps/web/lib/s3-client.ts
```

- [ ] **Step 2: Search for and fix any remaining imports**

Run:
```bash
cd apps/web && grep -r "ragflow" --include="*.ts" --include="*.tsx" -l
cd apps/web && grep -r "s3-client\|s3StorageClient\|S3StorageClient" --include="*.ts" --include="*.tsx" -l
cd apps/web && grep -r "crawl4ai\|crawl4aiClient" --include="*.ts" --include="*.tsx" -l
```

For each file found, remove the import and any code that references the deleted modules. Common patterns:
- Dynamic imports of `s3-client` in processors — already removed in Task 7
- `ragflowClient` imports in actions — already removed in Task 8
- Any remaining `crawl4aiClient` references

- [ ] **Step 3: Update .env.example files**

In `apps/web/.env.example`, remove:
```bash
RAGFLOW_BASE_URL=...
RAGFLOW_API_KEY=...
RAGFLOW_EMBEDDING_MODEL=...
RAGFLOW_CHUNK_SIZE=...
RAGFLOW_AUTO_KEYWORDS=...
RAGFLOW_AUTO_QUESTIONS=...
RAGFLOW_TOC_ENHANCE=...
S3_ENDPOINT=...
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_BUCKET=...
```

Add:
```bash
# MinerU Configuration
MINERU_MODE=local
MINERU_LOCAL_URL=http://localhost:8000
MINERU_API_TOKEN=

# PageIndex
PAGEINDEX_MODEL=gpt-4o-2024-11-20
```

In `apps/agent/.env.example`, remove:
```bash
RAGFLOW_API_KEY=...
RAGFLOW_BASE_URL=...
```

Add:
```bash
PAGEINDEX_MODEL=gpt-4o-2024-11-20
SPARKFLOW_API_URL=http://localhost:3001
```

- [ ] **Step 4: Update docker-compose if it references Crawl4AI or MinIO**

Check `apps/web/docker-compose.yml` (or wherever the compose file lives). Remove or comment out:
- `crawl4ai` service
- `minio` service

Keep `postgres` and any other services.

- [ ] **Step 5: Verify the project builds**

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
```

Expected: No TypeScript errors. Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add -u  # picks up deletions
git add apps/web/.env.example apps/agent/.env.example
git commit -m "chore: remove RagFlow, Crawl4AI, MinIO references and update env configs"
```

---

## Task 11: PageIndex Indexing Integration (Backend API)

**Files:**
- Create: `apps/web/app/api/notebooks/[id]/sources/[sourceId]/index/route.ts`

This task adds a backend API endpoint that triggers PageIndex indexing for a source. The source processors (Task 7) set status to READY with markdown content; this endpoint runs PageIndex indexing asynchronously to populate `indexData`.

- [ ] **Step 1: Create the indexing API route**

Create `apps/web/app/api/notebooks/[id]/sources/[sourceId]/index/route.ts`:

```typescript
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST: Trigger PageIndex indexing for a source.
 * Called after source processing is complete (status = READY).
 * Calls the Python agent's indexing endpoint.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!source.markdownContent && !source.content) {
    return NextResponse.json(
      { error: "Source has no content to index" },
      { status: 400 }
    );
  }

  try {
    // Call the Python agent to run PageIndex indexing
    const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
    const content = source.markdownContent || source.content || "";

    const res = await fetch(`${agentUrl}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: sourceId,
        content,
        title: source.title,
        source_type: source.sourceType,
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent indexing failed: ${res.status}`);
    }

    const indexData = await res.json();

    // Store the tree index in the source
    await prisma.source.update({
      where: { id: sourceId },
      data: { indexData },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Indexing failed";

    // Mark as PARTIAL — viewable but not searchable
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "PARTIAL",
        errorMessage: `Indexing failed: ${errorMessage}`,
      },
    });

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Add indexing endpoint to Python agent**

Create a simple indexing endpoint in the agent. Add to `apps/agent/api/index_endpoint.py` (or wherever your custom API routes live):

```python
"""
Indexing endpoint for PageIndex tree generation.
Called by the Next.js frontend after source processing completes.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from utils.pageindex_client import index_markdown, index_pdf

router = APIRouter()


class IndexRequest(BaseModel):
    source_id: str
    content: str
    title: str
    source_type: str  # "DOCUMENT" or "WEBPAGE"


@router.post("/index")
async def index_source(request: IndexRequest):
    """Generate a PageIndex tree for a source document."""
    try:
        # For all source types, use markdown indexing
        # (PDFs have already been converted to markdown by MinerU)
        tree = index_markdown(
            markdown_content=request.content,
            title=request.title,
        )
        return tree
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

Register this router in your agent's main app (check how routes are registered in the LangGraph agent setup — this may need to be added to `langgraph.json` or a FastAPI app).

- [ ] **Step 3: Wire indexing into source processors**

In each source processor (pdf-processor.ts, webpage-processor.ts, text-processor.ts), after setting status to READY, trigger indexing as a fire-and-forget call. Add this at the end of each processor's success path:

```typescript
// Trigger PageIndex indexing in background (non-blocking)
fetch(`/api/notebooks/${context.notebookId}/sources/${context.sourceId}/index`, {
  method: "POST",
}).catch((err) => console.error("PageIndex indexing trigger failed:", err));
```

Note: Since processors run server-side, use the full URL:
```typescript
const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
fetch(`${baseUrl}/api/notebooks/${context.notebookId}/sources/${sourceId}/index`, {
  method: "POST",
  headers: { /* pass auth headers if needed */ },
}).catch((err) => console.error("PageIndex indexing trigger failed:", err));
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/api/notebooks/ apps/agent/api/ apps/web/lib/services/source-processors/
git commit -m "feat: add PageIndex indexing endpoint and wire into source processors"
```

---

## Task 12: End-to-End Verification

**Files:** None (testing only)

- [ ] **Step 1: Start all services**

```bash
# Start PostgreSQL
cd apps/web && docker compose up -d postgres

# Generate Prisma client and push schema
cd apps/web && npx prisma generate && npx prisma db push

# Start frontend
cd apps/web && npm run dev

# Start agent (in another terminal)
cd apps/agent && langgraph dev --host 0.0.0.0 --port 2024
```

- [ ] **Step 2: Test text source upload**

1. Create a notebook in the UI
2. Add a text source with some markdown content
3. Verify: source appears with READY status
4. Verify: source preview shows the markdown content
5. Verify: no RagFlow errors in console

- [ ] **Step 3: Test webpage source (if Playwright is installed)**

1. Add a webpage URL (a simple blog post)
2. Verify: source processes and shows READY
3. Verify: images appear inline in the markdown preview
4. Verify: images load from `/api/images/[id]`

- [ ] **Step 4: Test PDF source (if MinerU is available)**

1. Upload a PDF research paper
2. Verify: processing completes (READY status)
3. Verify: markdown + images extracted correctly
4. Verify: PageIndex indexing runs (check agent logs)

- [ ] **Step 5: Test chat retrieval**

1. In a notebook with indexed sources, ask a question
2. Verify: agent uses PageIndex search tool
3. Verify: response includes source citations
4. Verify: no RagFlow errors

- [ ] **Step 6: Verify TypeScript build**

```bash
cd apps/web && npx tsc --noEmit && npm run build
```

Expected: Clean build with no errors.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: end-to-end verification complete"
```
