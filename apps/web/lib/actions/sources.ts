"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import { crawl4aiClient } from "@/lib/crawl4ai-client";
import { mapRagFlowStatus } from "@/lib/utils/ragflow-status";
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

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background using the new processor
  const context: ProcessingContext = {
    sourceId: source.id,
    ragflowDatasetId: notebook.ragflowDatasetId,
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
    ragflowDatasetId: notebook.ragflowDatasetId,
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

export async function uploadDocumentFromUrl(
  notebookId: string,
  documentUrl: string
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

  // Validate URL
  try {
    new URL(documentUrl);
  } catch {
    throw new Error("Invalid URL");
  }

  // Download the file
  console.log(`[uploadDocumentFromUrl] Starting download for notebook ${notebookId} from URL: ${documentUrl}`);
  let buffer: Buffer;
  let filename: string;
  let contentType: string;

  try {
    const downloadResult = await crawl4aiClient.downloadFileAsBuffer(documentUrl);
    buffer = downloadResult.buffer;
    filename = downloadResult.filename;
    contentType = downloadResult.contentType;
    console.log(`[uploadDocumentFromUrl] Successfully downloaded ${buffer.length} bytes as ${filename}`);
  } catch (error) {
    console.error(`[uploadDocumentFromUrl] Download failed for URL: ${documentUrl}`, error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    throw new Error(`Failed to download document: ${errorMessage}`);
  }

  // Ensure we have a valid extension
  let fileExtension = filename.split(".").pop()?.toLowerCase() || "";
  const supportedExtensions = ["pdf", "docx", "doc", "txt", "md"];

  if (!supportedExtensions.includes(fileExtension)) {
    // Try to infer from content-type
    if (contentType.includes("pdf")) {
      filename = filename.includes(".") ? filename : `${filename}.pdf`;
      fileExtension = "pdf";
    } else if (contentType.includes("word") || contentType.includes("docx")) {
      filename = filename.includes(".") ? filename : `${filename}.docx`;
      fileExtension = "docx";
    } else if (contentType.includes("text/plain")) {
      filename = filename.includes(".") ? filename : `${filename}.txt`;
      fileExtension = "txt";
    } else if (contentType.includes("text/markdown")) {
      filename = filename.includes(".") ? filename : `${filename}.md`;
      fileExtension = "md";
    } else {
      throw new Error("Unsupported file type. Please provide a PDF, DOCX, TXT, or MD file.");
    }
  }

  // Create a File-like object
  const uint8Array = new Uint8Array(buffer);
  const blob = new Blob([uint8Array]);
  const file = new File([blob], filename, { type: contentType || "application/octet-stream" });

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: filename,
      sourceType: "DOCUMENT",
      url: documentUrl,
      status: "PROCESSING",
    },
  });

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background using the new processors
  const context: ProcessingContext = {
    sourceId: source.id,
    ragflowDatasetId: notebook.ragflowDatasetId,
    notebookId,
  };

  const finalExtension = filename.split(".").pop()?.toLowerCase() || "";

  const processDocument = async () => {
    if (finalExtension === "txt" || finalExtension === "md") {
      return processTextDocument(file, context);
    } else if (finalExtension === "pdf") {
      return processPdfDocument(file, context);
    } else if (finalExtension === "docx" || finalExtension === "doc") {
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

export async function deleteSource(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Get source and verify ownership
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true, images: true },
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

  // Delete images from S3 if any exist
  if (source.images && source.images.length > 0) {
    try {
      const { deleteImage } = await import("@/lib/s3-client");
      for (const image of source.images) {
        await deleteImage(image.storageKey);
      }
    } catch (error) {
      console.error("S3 image delete error:", error);
      // Continue with source deletion even if S3 delete fails
    }
  }

  // Delete source (cascade will delete SourceImage records)
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
      // Map RagFlow status to our status using the utility
      const runValue = (doc.run || doc.status || "").toString();
      const status = mapRagFlowStatus(runValue);

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
