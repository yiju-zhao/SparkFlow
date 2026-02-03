import prisma from "@/lib/prisma";
import { crawl4aiClient } from "@/lib/crawl4ai-client";
import { ragflowClient } from "@/lib/ragflow-client";
import { extractTocFromMarkdown } from "@/lib/utils/toc-extractor";
import type { Prisma } from "@prisma/client";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Process a webpage source by converting it to markdown and uploading to RagFlow.
 */
export async function processWebpage(
  url: string,
  title: string | undefined,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId, ragflowDatasetId } = context;

  try {
    // Step 1: Convert webpage to markdown using Crawl4AI
    const {
      file,
      title: extractedTitle,
      markdown,
    } = await crawl4aiClient.getMarkdownAsFile(url);

    const finalTitle = title || extractedTitle;

    // Step 2: Upload the markdown file to RagFlow if dataset exists
    if (ragflowDatasetId) {
      try {
        const doc = await ragflowClient.uploadDocument(
          ragflowDatasetId,
          file,
          file.name,
          { autoParse: true }
        );

        await prisma.source.update({
          where: { id: sourceId },
          data: {
            title: finalTitle,
            ragflowDocumentId: doc.id,
            content: markdown,
            status: "PROCESSING",
            metadata: {
              markdownLength: markdown.length,
              convertedAt: new Date().toISOString(),
              ragflowRun: "RUNNING",
              ragflowProgress: doc.progress ?? 0,
              toc: extractTocFromMarkdown(markdown),
            } as Prisma.InputJsonValue,
          },
        });

        await ragflowClient.parseDocuments(ragflowDatasetId, [doc.id]);

        return {
          success: true,
          content: markdown,
          ragflowDocumentId: doc.id,
          metadata: { markdownLength: markdown.length },
        };
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        // Store markdown locally but mark as ready
        await prisma.source.update({
          where: { id: sourceId },
          data: {
            title: finalTitle,
            content: markdown,
            status: "READY",
            metadata: {
              markdownLength: markdown.length,
              convertedAt: new Date().toISOString(),
              ragflowError:
                ragflowError instanceof Error
                  ? ragflowError.message
                  : "Upload failed",
              toc: extractTocFromMarkdown(markdown),
            } as Prisma.InputJsonValue,
          },
        });

        return {
          success: true,
          content: markdown,
          metadata: { markdownLength: markdown.length, ragflowFailed: true },
        };
      }
    } else {
      // No RagFlow dataset, store conversion info and mark as ready
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          title: finalTitle,
          content: markdown,
          status: "READY",
          metadata: {
            markdownLength: markdown.length,
            convertedAt: new Date().toISOString(),
            toc: extractTocFromMarkdown(markdown),
          } as Prisma.InputJsonValue,
        },
      });

      return {
        success: true,
        content: markdown,
        metadata: { markdownLength: markdown.length },
      };
    }
  } catch (error) {
    console.error("Webpage conversion error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Webpage conversion failed";

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage,
      },
    });

    return { success: false, errorMessage };
  }
}
