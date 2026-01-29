import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Fallback processor - uploads documents directly to RagFlow without preprocessing.
 * Used for DOCX and other unsupported file types.
 */
export async function processFallbackDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  const { sourceId, ragflowDatasetId } = context;
  const fileType = file.name.split(".").pop()?.toLowerCase() || "unknown";

  try {
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
            status: "PROCESSING",
            metadata: {
              fileType,
              ragflowRun: "RUNNING",
              ragflowProgress: doc.progress ?? 0,
              uploadStartedAt: new Date().toISOString(),
            },
          },
        });

        await ragflowClient.parseDocuments(ragflowDatasetId, [doc.id]);

        return {
          success: true,
          ragflowDocumentId: doc.id,
          metadata: { fileType },
        };
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        // Continue without RagFlow
        await prisma.source.update({
          where: { id: sourceId },
          data: { status: "READY" },
        });

        return {
          success: true,
          metadata: { fileType, ragflowFailed: true },
        };
      }
    } else {
      // No RagFlow dataset configured, just mark as ready
      await prisma.source.update({
        where: { id: sourceId },
        data: { status: "READY" },
      });

      return {
        success: true,
        metadata: { fileType },
      };
    }
  } catch (error) {
    console.error("Fallback document processing error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Upload failed";

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

/**
 * Handle DOCX files - currently just falls back to direct RagFlow upload.
 */
export async function processDocxDocument(
  file: File,
  context: ProcessingContext
): Promise<ProcessingResult> {
  console.warn("DOCX parsing not yet implemented, using RagFlow fallback");
  return processFallbackDocument(file, context);
}
