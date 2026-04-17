"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processWebpage } from "@/lib/services/source-processors/webpage-processor";
import { processTextDocument } from "@/lib/services/source-processors/text-processor";
import { processMineruDocument } from "@/lib/services/source-processors/mineru-processor";
import type { ProcessingContext } from "@/lib/services/source-processors/types";

const MINERU_EXTENSIONS = ["pdf", "docx", "doc", "pptx", "ppt"];
const TEXT_EXTENSIONS = ["txt", "md"];
const ALLOWED_EXTENSIONS = [...MINERU_EXTENSIONS, ...TEXT_EXTENSIONS];

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

export async function uploadDocumentSource(notebookId: string, formData: FormData) {
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

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

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

      const htmlContent = article.content_html;
      const markdownContent = htmlContent ? td.turndown(htmlContent) : article.content_text || "";

      // Extract TOC from markdown headings
      const { extractTocFromMarkdown } = await import("@/lib/utils/toc-extractor");
      const toc = extractTocFromMarkdown(markdownContent);

      // Update source with content
      await prisma.source.update({
        where: { id: source.id },
        data: {
          content: markdownContent,
          markdownContent: markdownContent,
          contentHtml,
          status: "READY",
          metadata: {
            author: article.author,
            publishDate: article.publish_time?.toISOString(),
            sourceName: article.source_name,
            markdownLength: markdownContent.length,
            imageCount: images.filter((i) => i.data).length,
            hasHtml: !!contentHtml,
            toc,
          },
        },
      });

      // Trigger wiki ingest
      try {
        const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
        await ingestSourceToWiki(notebookId, source.id, session.user.id);
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

  // Remove source contributions from wiki in background (non-blocking)
  import("@/lib/services/wiki-ingest")
    .then(({ removeSourceFromWiki }) => removeSourceFromWiki(notebookId, sourceId, sourceTitle))
    .then((result) =>
      console.log(
        `Wiki cleanup: deleted ${result.pagesDeleted} pages, updated ${result.pagesUpdated} pages`,
      ),
    )
    .catch((err) => console.error("Wiki source removal failed:", err));
}
