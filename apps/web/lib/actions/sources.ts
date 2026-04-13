"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { processWebpage } from "@/lib/services/source-processors/webpage-processor";
import { processTextDocument } from "@/lib/services/source-processors/text-processor";
import { processPdfDocument } from "@/lib/services/source-processors/pdf-processor";
import {
  processDocxDocument,
  processFallbackDocument,
} from "@/lib/services/source-processors/fallback-processor";
import type { ProcessingContext } from "@/lib/services/source-processors/types";

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

export async function addWebpageSource(
  notebookId: string,
  url: string,
  title?: string,
) {
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

export async function uploadDocumentSource(
  notebookId: string,
  formData: FormData,
) {
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

  // Detect file type
  const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: file.name,
      sourceType: "DOCUMENT",
      status: "PROCESSING",
    },
  });

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background using the new processors
  const context: ProcessingContext = {
    sourceId: source.id,
    notebookId,
  };

  const processDocument = async () => {
    if (fileExtension === "txt" || fileExtension === "md") {
      return processTextDocument(file, context);
    } else if (fileExtension === "pdf") {
      return processPdfDocument(file, context);
    } else if (fileExtension === "docx" || fileExtension === "doc") {
      return processDocxDocument(file, context);
    } else {
      return processFallbackDocument(file, context);
    }
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
              originalName: img.original_url.split("/").pop() || "image",
              mimeType: img.mime_type || "image/jpeg",
              width: 0,
              height: 0,
              data: Buffer.from(img.data) as unknown as Uint8Array<ArrayBuffer>,
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
        await ingestSourceToWiki(notebookId, source.id);
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
    .then(({ removeSourceFromWiki }) =>
      removeSourceFromWiki(notebookId, sourceId, sourceTitle)
    )
    .then((result) =>
      console.log(
        `Wiki cleanup: deleted ${result.pagesDeleted} pages, updated ${result.pagesUpdated} pages`
      )
    )
    .catch((err) => console.error("Wiki source removal failed:", err));
}
