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

  await prisma.source.delete({ where: { id: sourceId } });
  revalidatePath(`/deepdive/${source.notebook.id}`);
}
