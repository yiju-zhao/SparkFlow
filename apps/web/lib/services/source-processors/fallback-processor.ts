import prisma from "@/lib/prisma";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Fallback processor for unsupported file types.
 * Used for DOCX and other file types without dedicated processors.
 */
export async function processFallbackDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  const { sourceId } = context;
  const fileType = file.name.split(".").pop()?.toLowerCase() || "unknown";

  try {
    await prisma.source.update({
      where: { id: sourceId },
      data: { status: "READY" },
    });

    return {
      success: true,
      metadata: { fileType },
    };
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
 * Handle DOCX files - currently uses fallback processing.
 */
export async function processDocxDocument(
  file: File,
  context: ProcessingContext,
): Promise<ProcessingResult> {
  console.warn("DOCX parsing not yet implemented, using fallback");
  return processFallbackDocument(file, context);
}
