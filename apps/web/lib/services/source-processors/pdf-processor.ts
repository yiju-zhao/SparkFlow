import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import type { ProcessingContext, ProcessingResult } from "./types";

/**
 * Escape special regex characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Process a PDF file by parsing with MineRU and uploading markdown to RagFlow.
 */
export async function processPdfDocument(
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

    // Parse PDF with MineRU
    const { mineruClient } = await import("@/lib/mineru-client");
    const parseResult = await mineruClient.parseDocument(file);
    let markdown = parseResult.markdown;
    const extractedImages = parseResult.images || {};

    // Process images if any were extracted
    const imageMapping: Record<string, string> = {};
    if (Object.keys(extractedImages).length > 0) {
      const { uploadSourceImages } = await import("@/lib/s3-client");

      // Upload images to S3
      const uploadedImages = await uploadSourceImages(sourceId, extractedImages);

      // Create SourceImage records for each uploaded image
      for (const img of uploadedImages) {
        const sourceImage = await prisma.sourceImage.create({
          data: {
            sourceId,
            originalName: img.originalName,
            storageKey: img.storageKey,
            contentType: img.contentType,
          },
        });
        imageMapping[img.originalName] = sourceImage.id;
      }

      // Rewrite markdown to use API URLs for images
      for (const [originalName, imageId] of Object.entries(imageMapping)) {
        const patterns = [
          new RegExp(
            `!\\[([^\\]]*)\\]\\(images/${escapeRegExp(originalName)}\\)`,
            "g"
          ),
          new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(originalName)}\\)`, "g"),
          new RegExp(
            `!\\[([^\\]]*)\\]\\([^)]*/${escapeRegExp(originalName)}\\)`,
            "g"
          ),
        ];

        for (const pattern of patterns) {
          markdown = markdown.replace(pattern, `![$1](/api/images/${imageId})`);
        }
      }
    }

    // Upload markdown to RagFlow if dataset exists
    if (ragflowDatasetId) {
      try {
        const mdBlob = new Blob([markdown], { type: "text/markdown" });
        const mdFile = new File(
          [mdBlob],
          file.name.replace(/\.pdf$/i, ".md"),
          { type: "text/markdown" }
        );

        const doc = await ragflowClient.uploadDocument(
          ragflowDatasetId,
          mdFile,
          mdFile.name,
          { autoParse: true }
        );

        await prisma.source.update({
          where: { id: sourceId },
          data: {
            ragflowDocumentId: doc.id,
            content: markdown,
            status: "PROCESSING",
            metadata: {
              fileType: "pdf",
              markdownLength: markdown.length,
              imageCount: Object.keys(imageMapping).length,
              mineruVersion: parseResult.metadata.version,
              processedAt: new Date().toISOString(),
              ragflowRun: "RUNNING",
              ragflowProgress: doc.progress ?? 0,
            },
          },
        });

        await ragflowClient.parseDocuments(ragflowDatasetId, [doc.id]);

        return {
          success: true,
          content: markdown,
          ragflowDocumentId: doc.id,
          metadata: {
            fileType: "pdf",
            markdownLength: markdown.length,
            imageCount: Object.keys(imageMapping).length,
          },
        };
      } catch (ragflowError) {
        console.error("RagFlow upload error:", ragflowError);
        await prisma.source.update({
          where: { id: sourceId },
          data: {
            content: markdown,
            status: "READY",
            metadata: {
              fileType: "pdf",
              markdownLength: markdown.length,
              imageCount: Object.keys(imageMapping).length,
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
          content: markdown,
          metadata: {
            fileType: "pdf",
            markdownLength: markdown.length,
            imageCount: Object.keys(imageMapping).length,
            ragflowFailed: true,
          },
        };
      }
    } else {
      // No RagFlow dataset, just save content
      await prisma.source.update({
        where: { id: sourceId },
        data: {
          content: markdown,
          status: "READY",
          metadata: {
            fileType: "pdf",
            markdownLength: markdown.length,
            imageCount: Object.keys(imageMapping).length,
            processedAt: new Date().toISOString(),
          },
        },
      });

      return {
        success: true,
        content: markdown,
        metadata: {
          fileType: "pdf",
          markdownLength: markdown.length,
          imageCount: Object.keys(imageMapping).length,
        },
      };
    }
  } catch (error) {
    console.error("PDF processing error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "PDF processing failed";

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
