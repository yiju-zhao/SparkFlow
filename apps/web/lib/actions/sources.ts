"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import { crawl4aiClient } from "@/lib/crawl4ai-client";

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
  title?: string
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

  try {
    // Step 1: Convert webpage to markdown using Crawl4AI
    const { file, title: extractedTitle, markdown } = await crawl4aiClient.getMarkdownAsFile(url);

    // Update title if we extracted a better one
    const finalTitle = title || extractedTitle;
    if (finalTitle !== source.title) {
      await prisma.source.update({
        where: { id: source.id },
        data: { title: finalTitle },
      });
    }

    // Step 2: Upload the markdown file to RagFlow if dataset exists
    if (notebook.ragflowDatasetId) {
      try {
        // Upload markdown document to RagFlow
        const doc = await ragflowClient.uploadDocument(
          notebook.ragflowDatasetId,
          file,
          file.name,
          { autoParse: true }
        );

        // Update source with RagFlow document ID and markdown content
      await prisma.source.update({
        where: { id: source.id },
        data: {
          ragflowDocumentId: doc.id,
          content: markdown,
          status: "PROCESSING",
          metadata: {
            markdownLength: markdown.length,
            convertedAt: new Date().toISOString(),
            ragflowRun: "RUNNING",
            ragflowProgress: doc.progress ?? 0,
          },
        },
      });

        // Ensure parsing/indexing starts
        await ragflowClient.parseDocuments(notebook.ragflowDatasetId, [doc.id]);
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        // Store markdown locally but mark as ready
        await prisma.source.update({
          where: { id: source.id },
          data: {
            content: markdown,
            status: "READY",
            metadata: {
              markdownLength: markdown.length,
              convertedAt: new Date().toISOString(),
              ragflowError: ragflowError instanceof Error ? ragflowError.message : "Upload failed",
            },
          },
        });
      }
    } else {
      // No RagFlow dataset, store conversion info and mark as ready
      await prisma.source.update({
        where: { id: source.id },
        data: {
          content: markdown,
          status: "READY",
          metadata: {
            markdownLength: markdown.length,
            convertedAt: new Date().toISOString(),
          },
        },
      });
    }
  } catch (error) {
    console.error("Webpage conversion error:", error);
    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Webpage conversion failed",
      },
    });
  }

  revalidatePath(`/deepdive/${notebookId}`);
  return source;
}

export async function uploadDocumentSource(
  notebookId: string,
  formData: FormData
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

  // Create source with UPLOADING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: file.name,
      sourceType: "DOCUMENT",
      status: "UPLOADING",
    },
  });

  try {
    let ragflowDocumentId: string | undefined;

    // Upload to RagFlow if dataset exists
    if (notebook.ragflowDatasetId) {
      try {
        // Update status to uploading
        await prisma.source.update({
          where: { id: source.id },
          data: { status: "UPLOADING" },
        });

        // Upload document to RagFlow
        const doc = await ragflowClient.uploadDocument(
          notebook.ragflowDatasetId,
          file,
          file.name,
          { autoParse: true }
        );

        ragflowDocumentId = doc.id;

        // Update status to processing
        await prisma.source.update({
          where: { id: source.id },
          data: {
            ragflowDocumentId: doc.id,
            status: "PROCESSING",
            metadata: {
              ...(source.metadata as Record<string, unknown> | null),
              ragflowRun: "RUNNING",
              ragflowProgress: doc.progress ?? 0,
              uploadStartedAt: new Date().toISOString(),
            },
          },
        });

        // Trigger parsing
        await ragflowClient.parseDocuments(notebook.ragflowDatasetId, [doc.id]);
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        // Continue without RagFlow
        await prisma.source.update({
          where: { id: source.id },
          data: { status: "READY" },
        });
      }
    } else {
      // No RagFlow dataset configured, just mark as ready
      await prisma.source.update({
        where: { id: source.id },
        data: { status: "READY" },
      });
    }
  } catch (error) {
    await prisma.source.update({
      where: { id: source.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Upload failed",
      },
    });
    throw error;
  }

  revalidatePath(`/deepdive/${notebookId}`);
  return source;
}

export async function deleteSource(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Get source and verify ownership
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Source not found");
  }

  // Delete from RagFlow if exists
  if (source.ragflowDocumentId && source.notebook.ragflowDatasetId) {
    try {
      await ragflowClient.deleteDocument(
        source.notebook.ragflowDatasetId,
        source.ragflowDocumentId
      );
    } catch (error) {
      console.error("RagFlow delete error:", error);
      // Continue with local deletion even if RagFlow fails
    }
  }

  await prisma.source.delete({ where: { id: sourceId } });
  revalidatePath(`/deepdive/${source.notebookId}`);
}

/**
 * Sync source status with RagFlow
 */
export async function syncSourceStatus(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Source not found");
  }

  if (!source.ragflowDocumentId || !source.notebook.ragflowDatasetId) {
    return source;
  }

  try {
    const doc = await ragflowClient.getDocumentStatus(
      source.notebook.ragflowDatasetId,
      source.ragflowDocumentId
    );

    if (doc) {
      // Map RagFlow status to our status
      const runValue = (doc.run || doc.status || "").toString().toUpperCase();
      let status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" = "PROCESSING";

      if (runValue === "DONE" || runValue === "3") {
        status = "READY";
      } else if (
        runValue === "FAIL" ||
        runValue === "4" ||
        runValue === "-1" ||
        runValue === "ERROR"
      ) {
        status = "FAILED";
      } else {
        status = "PROCESSING";
      }

      if (source.status !== status) {
        await prisma.source.update({
          where: { id: sourceId },
          data: {
            status,
            metadata: {
              ...(source.metadata as Record<string, unknown> | null),
              ragflowRun: doc.run ?? runValue,
              ragflowStatus: doc.status,
              ragflowProgress: doc.progress,
              ragflowUpdatedAt: new Date().toISOString(),
            },
          },
        });
      }
    }
  } catch (error) {
    console.error("Sync source status error:", error);
  }

  return prisma.source.findUnique({ where: { id: sourceId } });
}
