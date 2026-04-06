import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

export async function processWebpage(
  url: string,
  title: string | undefined,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const { scrapeWebpage } = await import("@/lib/services/playwright-scraper");
    const result = await scrapeWebpage(url);

    const markdown = await storeImagesAndRewriteMarkdown(
      sourceId,
      result.markdown,
      result.images
    );

    const finalTitle = title || result.metadata.title;
    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: finalTitle,
        markdownContent: markdown,
        content: markdown,
        status: "READY",
        metadata: {
          author: result.metadata.author,
          publishDate: result.metadata.date,
          markdownLength: markdown.length,
          imageCount: result.images.length,
          toc,
        },
      },
    });

    // Trigger PageIndex indexing in background (non-blocking)
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3001";
    fetch(
      `${baseUrl}/api/notebooks/${context.notebookId}/sources/${sourceId}/index`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }
    ).catch((err) => console.error("PageIndex indexing trigger failed:", err));

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
