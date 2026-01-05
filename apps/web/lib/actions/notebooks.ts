"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";

export async function getNotebooks() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  return prisma.notebook.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { sources: true, notes: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function createNotebook(name: string, description?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Create notebook in database first
  const notebook = await prisma.notebook.create({
    data: {
      name,
      description,
      userId: session.user.id,
    },
  });

  // Try to create RagFlow dataset (non-blocking)
  try {
    const dataset = await ragflowClient.createDataset(
      `sparkflow_${notebook.id}`,
      `SparkFlow notebook: ${name}`
    );

    // Update notebook with RagFlow dataset ID
    await prisma.notebook.update({
      where: { id: notebook.id },
      data: { ragflowDatasetId: dataset.id },
    });
  } catch (error) {
    console.error("RagFlow dataset creation failed:", error);
    // Continue without RagFlow - notebook still works
  }

  revalidatePath("/dashboard");
  return notebook;
}

export async function deleteNotebook(id: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  // Try to delete RagFlow dataset (non-blocking)
  if (notebook.ragflowDatasetId) {
    try {
      await ragflowClient.deleteDataset(notebook.ragflowDatasetId);
    } catch (error) {
      console.error("RagFlow dataset deletion failed:", error);
      // Continue with local deletion
    }
  }

  await prisma.notebook.delete({ where: { id } });
  revalidatePath("/dashboard");
}

export async function updateNotebook(
  id: string,
  data: { name?: string; description?: string }
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const updated = await prisma.notebook.update({
    where: { id },
    data,
  });

  revalidatePath("/dashboard");
  return updated;
}

/**
 * Ensure a notebook has a RagFlow dataset
 * Call this if you need to ensure RagFlow integration exists
 */
export async function ensureRagFlowDataset(notebookId: string) {
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

  // Already has dataset
  if (notebook.ragflowDatasetId) {
    return notebook;
  }

  // Create RagFlow dataset
  try {
    const dataset = await ragflowClient.createDataset(
      `sparkflow_${notebook.id}`,
      `SparkFlow notebook: ${notebook.name}`
    );

    return prisma.notebook.update({
      where: { id: notebookId },
      data: { ragflowDatasetId: dataset.id },
    });
  } catch (error) {
    console.error("RagFlow dataset creation failed:", error);
    throw new Error("Failed to create RagFlow dataset");
  }
}
