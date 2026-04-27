"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processWebpage } from "@/lib/services/source-processors/webpage-processor";
import { processTextDocument } from "@/lib/services/source-processors/text-processor";
import { processMineruDocument } from "@/lib/services/source-processors/mineru-processor";
import type { ProcessingContext } from "@/lib/services/source-processors/types";
import {
  MAX_SOURCES_PER_NOTEBOOK,
  formatSourceLimitError,
} from "@/lib/constants/sources";

const MINERU_EXTENSIONS = ["pdf", "docx", "doc", "pptx", "ppt"];
const TEXT_EXTENSIONS = ["txt", "md"];
const ALLOWED_EXTENSIONS = [...MINERU_EXTENSIONS, ...TEXT_EXTENSIONS];
const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
const MAX_FILE_SIZE_LABEL = "100MB";

type PrismaLike = Prisma.TransactionClient | typeof prisma;

async function assertSourceCapacity(
  tx: PrismaLike,
  notebookId: string,
  adding: number,
) {
  if (adding <= 0) return;
  const current = await tx.source.count({ where: { notebookId } });
  if (current + adding > MAX_SOURCES_PER_NOTEBOOK) {
    const remaining = Math.max(0, MAX_SOURCES_PER_NOTEBOOK - current);
    throw new Error(formatSourceLimitError(remaining, adding));
  }
}

export async function getSources(notebookId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  return prisma.source.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addWebpageSource(notebookId: string, url: string, title?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  await assertSourceCapacity(prisma, notebookId, 1);

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: title || new URL(url).hostname,
      sourceType: "WEBPAGE",
      url,
      status: "PROCESSING",
    },
  });

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background using the new processor
  const context: ProcessingContext = {
    sourceId: source.id,
    notebookId,
    userId: session.user.id,
  };

  processWebpage(url, title, context)
    .catch(console.error)
    .finally(() => {
      try {
        revalidatePath(`/deepdive/${notebookId}`);
      } catch {
        // Ignore revalidation errors in background context
      }
    });

  return source;
}

export async function addPublicationSource(notebookId: string, publicationId: string) {
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

  await assertSourceCapacity(prisma, notebookId, 1);

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
    userId: session.user.id,
  };

  (async () => {
    try {
      const response = await fetch(publication.pdfUrl!);
      if (!response.ok) throw new Error(`Failed to download PDF: ${response.status}`);
      const blob = await response.blob();
      const file = new File([blob], `${publication.title}.pdf`, {
        type: "application/pdf",
      });
      await processMineruDocument(file, context);
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

export async function addWechatSource(notebookId: string, articleId: number) {
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
  const { getWechatArticleById, getWechatArticleImages } =
    await import("@/lib/services/wechat-client");

  const article = await getWechatArticleById(articleId);
  if (!article) {
    throw new Error("WeChat article not found");
  }

  await assertSourceCapacity(prisma, notebookId, 1);

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
  (async () => {
    try {
      // Fetch and store images, building URL mappings for content rewriting
      const images = await getWechatArticleImages(articleId);
      // Maps: wechat DB image id → local /api/images/{sourceImageId}
      const wechatIdToLocal = new Map<number, string>();
      // Maps: original CDN URL → local /api/images/{sourceImageId}
      const originalUrlToLocal = new Map<string, string>();

      for (const img of images) {
        if (img.data) {
          const savedImage = await prisma.sourceImage.create({
            data: {
              sourceId: source.id,
              originalName: img.original_url.split("/").pop() || "image",
              mimeType: img.mime_type || "image/jpeg",
              width: 0,
              height: 0,
              data: Buffer.from(img.data) as unknown as Uint8Array<ArrayBuffer>,
            },
          });
          const localUrl = `/api/images/${savedImage.id}`;
          wechatIdToLocal.set(img.id, localUrl);
          if (img.original_url) {
            originalUrlToLocal.set(img.original_url, localUrl);
          }
        }
      }

      // Rewrite HTML image URLs to point to local /api/images/{id}
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

      // Convert HTML to markdown using TurndownService with image URL rewriting
      const TurndownService = (await import("turndown")).default;
      const td = new TurndownService({ headingStyle: "atx" });

      td.addRule("wechatImages", {
        filter: "img",
        replacement: (_content, node) => {
          const el = node as HTMLElement;
          const src = el.getAttribute("data-src") || el.getAttribute("src") || "";
          const alt = el.getAttribute("alt") || "";
          if (!src) return "";

          // Case 1: Scraper-rewritten paths like /api/images/{wechatDbId}
          const scraperMatch = src.match(/^\/api\/images\/(\d+)$/);
          if (scraperMatch) {
            const wechatDbId = parseInt(scraperMatch[1], 10);
            const localUrl = wechatIdToLocal.get(wechatDbId);
            if (localUrl) return `\n\n![${alt}](${localUrl})\n\n`;
          }

          // Case 2: Match by original WeChat CDN URL
          const localUrl = originalUrlToLocal.get(src);
          if (localUrl) return `\n\n![${alt}](${localUrl})\n\n`;

          // Case 3: Keep original URL as fallback (external images)
          return `\n\n![${alt}](${src})\n\n`;
        },
      });

      const sourceHtml = article.content_html;
      const markdown = sourceHtml ? td.turndown(sourceHtml) : article.content_text || "";

      // Extract TOC from markdown headings
      const { extractTocFromMarkdown } = await import("@/lib/utils/toc-extractor");
      const toc = extractTocFromMarkdown(markdown);

      // Update source with content
      await prisma.source.update({
        where: { id: source.id },
        data: {
          markdown,
          html: contentHtml,
          status: "READY",
          metadata: {
            author: article.author,
            publishDate: article.publish_time?.toISOString(),
            sourceName: article.source_name,
            markdownLength: markdown.length,
            imageCount: images.filter((i) => i.data).length,
            hasHtml: !!contentHtml,
            toc,
          },
        },
      });

      // Enqueue wiki ingest — drained out-of-process by ingest-worker.
      try {
        const { enqueueWikiIngest } = await import("@/lib/queue/ingest-queue");
        const { jobId } = await enqueueWikiIngest({
          notebookId,
          sourceId: source.id,
          userId: session.user.id,
        });
        console.log(`[addWechatSource] wiki ingest enqueued: ${jobId}`);
      } catch (wikiErr) {
        console.error("[addWechatSource] Failed to enqueue wiki ingest:", wikiErr);
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

export async function uploadDocumentsBatch(notebookId: string, formData: FormData) {
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

  const allFiles = formData.getAll("file").filter((v): v is File => v instanceof File);
  if (allFiles.length === 0) {
    throw new Error("No files provided");
  }

  const oversize = allFiles.filter((f) => f.size > MAX_FILE_SIZE_BYTES);
  if (oversize.length > 0) {
    throw new Error(
      `File too large (max ${MAX_FILE_SIZE_LABEL}): ${oversize.map((f) => f.name).join(", ")}`,
    );
  }

  const accepted: { file: File; extension: string }[] = [];
  const skipped: string[] = [];
  for (const file of allFiles) {
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (ALLOWED_EXTENSIONS.includes(ext)) {
      accepted.push({ file, extension: ext });
    } else {
      skipped.push(file.name);
    }
  }

  if (accepted.length === 0) {
    throw new Error(
      `No supported files. Allowed: ${ALLOWED_EXTENSIONS.map((e) => "." + e).join(", ")}`,
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertSourceCapacity(tx, notebookId, accepted.length);
    return tx.source.createManyAndReturn({
      data: accepted.map(({ file }) => ({
        notebookId,
        title: file.name,
        sourceType: "DOCUMENT" as const,
        status: "PROCESSING" as const,
      })),
    });
  });

  revalidatePath(`/deepdive/${notebookId}`);

  const userId = session.user.id;
  for (let i = 0; i < created.length; i++) {
    const source = created[i];
    const { file, extension } = accepted[i];
    const context: ProcessingContext = {
      sourceId: source.id,
      notebookId,
      userId,
    };
    const processDocument = async () => {
      if (TEXT_EXTENSIONS.includes(extension)) {
        return processTextDocument(file, context);
      }
      return processMineruDocument(file, context);
    };
    processDocument()
      .catch(console.error)
      .finally(() => {
        try {
          revalidatePath(`/deepdive/${notebookId}`);
        } catch {
          // Ignore revalidation errors in background context
        }
      });
  }

  return { sources: created, skipped };
}

export async function addWebpageSourcesBatch(notebookId: string, urls: string[]) {
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

  const seen = new Set<string>();
  const accepted: string[] = [];
  const skipped: string[] = [];
  for (const raw of urls) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    if (!/^https?:\/\//i.test(trimmed)) {
      skipped.push(trimmed);
      continue;
    }
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    accepted.push(trimmed);
  }

  if (accepted.length === 0) {
    throw new Error("No valid URLs provided");
  }

  const created = await prisma.$transaction(async (tx) => {
    await assertSourceCapacity(tx, notebookId, accepted.length);
    return tx.source.createManyAndReturn({
      data: accepted.map((url) => {
        let hostname = url;
        try {
          hostname = new URL(url).hostname;
        } catch {
          // fall back to raw url
        }
        return {
          notebookId,
          title: hostname,
          sourceType: "WEBPAGE" as const,
          url,
          status: "PROCESSING" as const,
        };
      }),
    });
  });

  revalidatePath(`/deepdive/${notebookId}`);

  const userId = session.user.id;
  for (const source of created) {
    if (!source.url) continue;
    const context: ProcessingContext = {
      sourceId: source.id,
      notebookId,
      userId,
    };
    processWebpage(source.url, undefined, context)
      .catch(console.error)
      .finally(() => {
        try {
          revalidatePath(`/deepdive/${notebookId}`);
        } catch {
          // Ignore revalidation errors in background context
        }
      });
  }

  return { sources: created, skipped };
}

export async function deleteSource(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true, id: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Source not found");
  }

  const notebookId = source.notebook.id;
  const sourceTitle = source.title;

  // Delete the source record first
  await prisma.source.delete({ where: { id: sourceId } });
  revalidatePath(`/deepdive/${notebookId}`);

  // Remove source contributions from wiki/graph and await completion so the
  // client can invalidate its queries with the updated data in one shot.
  try {
    const { removeSourceFromWiki } = await import("@/lib/services/wiki-ingest");
    const result = await removeSourceFromWiki(
      notebookId,
      sourceId,
      sourceTitle,
      session.user.id,
    );
    console.log(
      `Wiki cleanup: deleted ${result.pagesDeleted} pages, updated ${result.pagesUpdated} pages`,
    );
  } catch (err) {
    console.error("Wiki source removal failed:", err);
  }
}
