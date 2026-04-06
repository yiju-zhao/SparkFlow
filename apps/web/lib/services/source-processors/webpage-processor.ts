import prisma from "@/lib/prisma";
import { scrapeWebpage } from "@/lib/services/playwright-scraper";
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
