"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";

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
    // Try to add webpage to RagFlow if dataset exists
    if (notebook.ragflowDatasetId) {
      const doc = await ragflowClient.addWebpage(
        notebook.ragflowDatasetId,
        url,
        title
      );

      if (doc) {
        await prisma.source.update({
          where: { id: source.id },
          data: {
            ragflowDocumentId: doc.id,
            status: "READY",
          },
        });
      } else {
        // Webpage ingestion not supported, mark as ready anyway
        await prisma.source.update({
          where: { id: source.id },
          data: { status: "READY" },
        });
      }
    } else {
      // No RagFlow dataset, just mark as ready
      await prisma.source.update({
        where: { id: source.id },
        data: { status: "READY" },
      });
    }
  } catch (error) {
    console.error("RagFlow webpage error:", error);
    // Still mark as ready even if RagFlow fails
    await prisma.source.update({
      where: { id: source.id },
      data: { status: "READY" },
    });
  }

  revalidatePath(`/studio/${notebookId}`);
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
          file.name
        );

        ragflowDocumentId = doc.id;

        // Update status to processing
        await prisma.source.update({
          where: { id: source.id },
          data: {
            ragflowDocumentId: doc.id,
            status: "PROCESSING",
          },
        });

        // Trigger parsing
        await ragflowClient.parseDocuments(notebook.ragflowDatasetId, [doc.id]);

        // For now, mark as ready (in production, you'd poll for status)
        await prisma.source.update({
          where: { id: source.id },
          data: { status: "READY" },
        });
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

  revalidatePath(`/studio/${notebookId}`);
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
  revalidatePath(`/studio/${source.notebookId}`);
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
      let status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" = "PROCESSING";

      if (doc.status === "1" || doc.status === "done") {
        status = "READY";
      } else if (doc.status === "0" || doc.status === "pending") {
        status = "PROCESSING";
      } else if (doc.status === "-1" || doc.status === "error") {
        status = "FAILED";
      }

      if (source.status !== status) {
        await prisma.source.update({
          where: { id: sourceId },
          data: { status },
        });
      }
    }
  } catch (error) {
    console.error("Sync source status error:", error);
  }

  return prisma.source.findUnique({ where: { id: sourceId } });
}
