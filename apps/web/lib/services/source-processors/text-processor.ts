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

    // Trigger wiki ingest (awaited to prevent premature termination)
    try {
      const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
      const result = await ingestSourceToWiki(context.notebookId, sourceId, context.userId);
      console.log(`Wiki ingest complete: ${result.pagesWritten} pages written`);
    } catch (err) {
      console.error("Wiki ingest failed:", err);
      // Don't fail the source processing if wiki ingest fails
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
