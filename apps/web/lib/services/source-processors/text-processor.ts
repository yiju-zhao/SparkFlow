import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Process a text/markdown file by saving content directly and optionally uploading to RagFlow.
 */
export async function processTextDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId, ragflowDatasetId } = context;

  try {
    // Update status to processing
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "PROCESSING" },
    });

    // Read file content directly
    const content = await file.text();
    const fileType = file.name.endsWith(".md") ? "markdown" : "text";

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
            ragflowDocumentId: doc.id,
            content,
            status: "PROCESSING",
            metadata: {
              fileType,
              contentLength: content.length,
              processedAt: new Date().toISOString(),
              ragflowRun: "RUNNING",
              ragflowProgress: doc.progress ?? 0,
              uploadStartedAt: new Date().toISOString(),
            },
          },
        });

        await ragflowClient.parseDocuments(ragflowDatasetId, [doc.id]);

        return {
          success: true,
          content,
          ragflowDocumentId: doc.id,
          metadata: { fileType, contentLength: content.length },
        };
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        await prisma.source.update({
          where: { id: sourceId },
          data: {
            content,
            status: "READY",
            metadata: {
              fileType,
              contentLength: content.length,
              processedAt: new Date().toISOString(),
              ragflowError:
                ragflowError instanceof Error
                  ? ragflowError.message
                  : "Upload failed",
            },
          },
        });

        return {
          success: true,
          content,
          metadata: { fileType, contentLength: content.length, ragflowFailed: true },
        };
      }
    } else {
      // Save content directly - no RagFlow upload needed
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          content,
          status: "READY",
          metadata: {
            fileType,
            contentLength: content.length,
            processedAt: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        content,
        metadata: { fileType, contentLength: content.length },
      };
    }
  } catch (error) {
    console.error("Text document processing error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Text processing failed";

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
