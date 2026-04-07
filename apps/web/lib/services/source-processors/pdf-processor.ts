import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

export async function processPdfDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    // Write file to temp location for MinerU
    const tempPath = `/tmp/${sourceId}-${file.name}`;
    const arrayBuffer = await file.arrayBuffer();
    const { writeFile, unlink } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(arrayBuffer));

    let mineruResult;
    try {
      const { parsePdf } = await import("@/lib/services/mineru-client");
      mineruResult = await parsePdf(tempPath);
    } finally {
      await unlink(tempPath).catch(() => {});
    }

    // Store images in PG and rewrite markdown references
    const markdown = await storeImagesAndRewriteMarkdown(
      sourceId,
      mineruResult.markdown,
      mineruResult.images
    );

    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdownContent: markdown,
        content: markdown,
        status: "READY",
        metadata: {
          fileType: "pdf",
          markdownLength: markdown.length,
          imageCount: mineruResult.images.length,
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
