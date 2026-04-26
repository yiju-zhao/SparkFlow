import prisma from "@/lib/prisma";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

export async function processTextDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const markdown = await file.text();
    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdown,
        status: "READY",
        metadata: {
          fileType: file.name.split(".").pop() || "txt",
          markdownLength: markdown.length,
          toc,
        },
      },
    });

    // Enqueue wiki ingest — drained out-of-process by ingest-worker.
    try {
      const { enqueueWikiIngest } = await import("@/lib/queue/ingest-queue");
      const { jobId } = await enqueueWikiIngest({
        notebookId: context.notebookId,
        sourceId,
        userId: context.userId,
      });
      console.log(`[text-processor] wiki ingest enqueued: ${jobId}`);
    } catch (err) {
      console.error("[text-processor] failed to enqueue wiki ingest:", err);
    }

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
