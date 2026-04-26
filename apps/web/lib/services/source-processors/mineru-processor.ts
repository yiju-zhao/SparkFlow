import prisma from "@/lib/prisma";
import { storeImagesAndRewriteMarkdown } from "@/lib/services/source-service";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import { buildHtmlFromContentList } from "@/lib/services/content-list-to-html";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Handles PDF / DOCX / PPT / PPTX via MinerU.
 * MinerU auto-detects the file type based on extension.
 */
export async function processMineruDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    const tempPath = `/tmp/${sourceId}-${file.name}`;
    const { writeFile, unlink } = await import("fs/promises");
    await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

    let mineruResult;
    try {
      const { parsePdf } = await import("@/lib/services/mineru-client");
      mineruResult = await parsePdf(tempPath);
    } finally {
      await unlink(tempPath).catch(() => {});
    }

    console.log(
      `[MinerU] ${file.name}: ${mineruResult.images.length} images, ` +
        `${mineruResult.markdown.length} markdown chars, ` +
        `contentList=${mineruResult.contentList?.length ?? "none"}`,
    );

    const { markdown, imagePathToApiUrl } = await storeImagesAndRewriteMarkdown(
      sourceId,
      mineruResult.markdown,
      mineruResult.images,
    );

    let html: string | null = null;
    if (mineruResult.contentList && mineruResult.contentList.length > 0) {
      try {
        // Pass original markdown as math-hint source — content_list_v2 strips
        // $...$ delimiters from paragraph text, but markdown preserves them.
        html = buildHtmlFromContentList(
          mineruResult.contentList,
          imagePathToApiUrl,
          mineruResult.markdown,
        );
      } catch (err) {
        console.warn("[MinerU] HTML build failed, will fall back to markdown:", err);
      }
    }

    const toc = extractTocFromMarkdown(markdown);

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        markdown,
        html,
        status: "READY",
        metadata: {
          fileType: file.name.split(".").pop()?.toLowerCase() ?? "unknown",
          markdownLength: markdown.length,
          imageCount: mineruResult.images.length,
          hasHtml: !!html,
          toc,
        },
      },
    });

    try {
      const { enqueueWikiIngest } = await import("@/lib/queue/ingest-queue");
      const { jobId } = await enqueueWikiIngest({
        notebookId: context.notebookId,
        sourceId,
        userId: context.userId,
      });
      console.log(`[mineru-processor] wiki ingest enqueued: ${jobId}`);
    } catch (err) {
      console.error("[mineru-processor] failed to enqueue wiki ingest:", err);
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
