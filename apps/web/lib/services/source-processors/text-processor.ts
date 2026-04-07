import prisma from "@/lib/prisma";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

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

    // Trigger wiki ingest in background (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
    fetch(
      `${baseUrl}/api/notebooks/${context.notebookId}/ingest/${sourceId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ).catch((err) => console.error("Wiki ingest trigger failed:", err));

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "FAILED", errorMessage },
    });
    return { success: false, errorMessage };
  }
}
