import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { ProcessingContext, ProcessingResult } from "./types";

function rewriteImgTags(html: string, imageMap: Map<string, string>): string {
  return html.replace(/<img\b[^>]*>/gi, (tag) => {
    const srcMatch = tag.match(/src=["']([^"']+)["']/);
    if (!srcMatch) return tag;
    const src = srcMatch[1];
    // Direct hit
    const local = imageMap.get(src);
    if (local) return tag.replace(/src=["'][^"']+["']/, `src="${local}"`);
    // Try filename
    const filename = src.split("/").pop() ?? "";
    const byFilename = imageMap.get(filename);
    if (byFilename) return tag.replace(/src=["'][^"']+["']/, `src="${byFilename}"`);
    return tag;
  });
}

export async function processWebpage(
  url: string,
  title: string | undefined,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const { scrapeWebpage } = await import("@/lib/services/playwright-scraper");
    const result = await scrapeWebpage(url);

    const { markdown, imagePathToApiUrl } = await storeImagesAndRewriteMarkdown(
      sourceId,
      result.markdown,
      result.images,
    );

    const html = result.html ? rewriteImgTags(result.html, imagePathToApiUrl) : null;

    const finalTitle = title || result.metadata.title;
    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        title: finalTitle,
        markdown,
        html,
        status: "READY",
        metadata: {
          author: result.metadata.author,
          publishDate: result.metadata.date,
          markdownLength: markdown.length,
          imageCount: result.images.length,
          hasHtml: !!html,
          toc,
        },
      },
    });

    // Trigger wiki ingest (awaited to prevent premature termination)
    try {
      const { ingestSourceToWiki } = await import("@/lib/services/wiki-ingest");
      const ingestResult = await ingestSourceToWiki(context.notebookId, sourceId, context.userId);
      console.log(`Wiki ingest complete: ${ingestResult.pagesWritten} pages written`);
    } catch (err) {
      console.error("Wiki ingest failed:", err);
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
