"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { ragflowClient } from "@/lib/ragflow-client";
import { crawl4aiClient } from "@/lib/crawl4ai-client";

export async function getSources(notebookId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  return prisma.source.findMany({
    where: { notebookId },
    orderBy: { createdAt: "desc" },
  });
}

export async function addWebpageSource(
  notebookId: string,
  url: string,
  title?: string
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  // Create source with PROCESSING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: title || new URL(url).hostname,
      sourceType: "WEBPAGE",
      url,
      status: "PROCESSING",
    },
  });

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background (fire and forget)
  processWebpage(source.id, url, title, notebook.ragflowDatasetId, notebookId).catch(console.error);

  return source;
}

// Background processing function for webpage
async function processWebpage(
  sourceId: string,
  url: string,
  title: string | undefined,
  ragflowDatasetId: string | null,
  notebookId: string
) {
  try {
    // Step 1: Convert webpage to markdown using Crawl4AI
    const { file, title: extractedTitle, markdown } = await crawl4aiClient.getMarkdownAsFile(url);

    // Update title if we extracted a better one
    const finalTitle = title || extractedTitle;

    // Step 2: Upload the markdown file to RagFlow if dataset exists
    if (ragflowDatasetId) {
      try {
        // Upload markdown document to RagFlow
        const doc = await ragflowClient.uploadDocument(
          ragflowDatasetId,
          file,
          file.name,
          { autoParse: true }
        );

        // Update source with RagFlow document ID and markdown content
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
            },
          },
        });

        // Ensure parsing/indexing starts
        await ragflowClient.parseDocuments(ragflowDatasetId, [doc.id]);
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
              ragflowError: ragflowError instanceof Error ? ragflowError.message : "Upload failed",
            },
          },
        });
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
          },
        },
      });
    }
  } catch (error) {
    console.error("Webpage conversion error:", error);
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Webpage conversion failed",
      },
    });
  }

  // Final revalidate to update status (wrapped in try-catch for background execution)
  try {
    revalidatePath(`/deepdive/${notebookId}`);
  } catch {
    // Ignore revalidation errors in background context
  }
}


export async function uploadDocumentSource(
  notebookId: string,
  formData: FormData
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const file = formData.get("file") as File;
  if (!file) {
    throw new Error("No file provided");
  }

  // Detect file type
  const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';

  // Create source with UPLOADING status
  const source = await prisma.source.create({
    data: {
      notebookId,
      title: file.name,
      sourceType: "DOCUMENT",
      status: "UPLOADING",
    },
  });

  // Revalidate immediately so it shows up in the list
  revalidatePath(`/deepdive/${notebookId}`);

  // Process in the background (fire and forget)
  processDocument(source.id, file, fileExtension, notebook.ragflowDatasetId, notebookId).catch(console.error);

  return source;
}

// Background processing function for documents
async function processDocument(
  sourceId: string,
  file: File,
  fileExtension: string,
  ragflowDatasetId: string | null,
  notebookId: string
) {
  try {
    // Route by file type
    if (fileExtension === 'txt' || fileExtension === 'md') {
      // TXT/MD: Save content directly without preprocessing
      await handleTextDocument(file, { id: sourceId }, { ragflowDatasetId });
    } else if (fileExtension === 'pdf') {
      // PDF: Parse with MineRU, upload markdown to RagFlow
      await handlePdfDocument(file, { id: sourceId }, { ragflowDatasetId });
    } else if (fileExtension === 'docx' || fileExtension === 'doc') {
      // DOCX: TODO - For now, just upload to RagFlow directly
      await handleDocxDocument(file, { id: sourceId }, { ragflowDatasetId });
    } else {
      // Unsupported file type - try direct RagFlow upload as fallback
      await handleFallbackDocument(file, { id: sourceId }, { ragflowDatasetId });
    }
  } catch (error) {
    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Upload failed",
      },
    });
  }

  // Final revalidate to update status (wrapped in try-catch for background execution)
  try {
    revalidatePath(`/deepdive/${notebookId}`);
  } catch {
    // Ignore revalidation errors in background context
  }
}


/**
 * Handle TXT/MD files - save content directly without preprocessing
 */
async function handleTextDocument(
  file: File,
  source: { id: string },
  notebook: { ragflowDatasetId: string | null }
) {
  // Read file content directly
  const content = await file.text();

  // Save content directly - no RagFlow upload needed for simple text
  await prisma.source.update({
    where: { id: source.id },
    data: {
      content,
      status: "READY",
      metadata: {
        fileType: file.name.endsWith('.md') ? 'markdown' : 'text',
        contentLength: content.length,
        processedAt: new Date().toISOString(),
      },
    },
  });
}

/**
 * Handle PDF files - parse with MineRU, upload markdown to RagFlow
 */
async function handlePdfDocument(
  file: File,
  source: { id: string },
  notebook: { ragflowDatasetId: string | null }
) {
  // Update status to processing
  await prisma.source.update({
    where: { id: source.id },
    data: { status: "PROCESSING" },
  });

  // Parse PDF with MineRU
  const { mineruClient } = await import("@/lib/mineru-client");
  const parseResult = await mineruClient.parseDocument(file);
  let markdown = parseResult.markdown;
  const extractedImages = parseResult.images || {};

  // Process images if any were extracted
  const imageMapping: Record<string, string> = {}; // originalName -> imageId
  if (Object.keys(extractedImages).length > 0) {
    const { uploadSourceImages } = await import("@/lib/s3-client");

    // Upload images to S3
    const uploadedImages = await uploadSourceImages(source.id, extractedImages);

    // Create SourceImage records for each uploaded image
    for (const img of uploadedImages) {
      const sourceImage = await prisma.sourceImage.create({
        data: {
          sourceId: source.id,
          originalName: img.originalName,
          storageKey: img.storageKey,
          contentType: img.contentType,
        },
      });
      imageMapping[img.originalName] = sourceImage.id;
    }

    // Rewrite markdown to use API URLs for images
    // MinerU typically outputs: ![](images/image_name.png) or ![](image_name.png)
    for (const [originalName, imageId] of Object.entries(imageMapping)) {
      // Replace various possible image path formats
      const patterns = [
        new RegExp(`!\\[([^\\]]*)\\]\\(images/${escapeRegExp(originalName)}\\)`, 'g'),
        new RegExp(`!\\[([^\\]]*)\\]\\(${escapeRegExp(originalName)}\\)`, 'g'),
        new RegExp(`!\\[([^\\]]*)\\]\\([^)]*/${escapeRegExp(originalName)}\\)`, 'g'),
      ];

      for (const pattern of patterns) {
        markdown = markdown.replace(pattern, `![$1](/api/images/${imageId})`);
      }
    }
  }

  // Upload markdown to RagFlow if dataset exists
  if (notebook.ragflowDatasetId) {
    try {
      // Create a markdown file from the parsed content
      const mdBlob = new Blob([markdown], { type: "text/markdown" });
      const mdFile = new File(
        [mdBlob],
        file.name.replace(/\.pdf$/i, ".md"),
        { type: "text/markdown" }
      );

      // Upload to RagFlow
      const doc = await ragflowClient.uploadDocument(
        notebook.ragflowDatasetId,
        mdFile,
        mdFile.name,
        { autoParse: true }
      );

      // Update source with content and RagFlow ID
      await prisma.source.update({
        where: { id: source.id },
        data: {
          ragflowDocumentId: doc.id,
          content: markdown,
          status: "PROCESSING",
          metadata: {
            fileType: 'pdf',
            markdownLength: markdown.length,
            imageCount: Object.keys(imageMapping).length,
            mineruVersion: parseResult.metadata.version,
            processedAt: new Date().toISOString(),
            ragflowRun: "RUNNING",
            ragflowProgress: doc.progress ?? 0,
          },
        },
      });

      // Trigger RagFlow parsing
      await ragflowClient.parseDocuments(notebook.ragflowDatasetId, [doc.id]);
    } catch (ragflowError) {
      console.error("RagFlow upload error:", ragflowError);
      // Store content locally but mark as ready
      await prisma.source.update({
        where: { id: source.id },
        data: {
          content: markdown,
          status: "READY",
          metadata: {
            fileType: 'pdf',
            markdownLength: markdown.length,
            imageCount: Object.keys(imageMapping).length,
            processedAt: new Date().toISOString(),
            ragflowError: ragflowError instanceof Error ? ragflowError.message : "Upload failed",
          },
        },
      });
    }
  } else {
    // No RagFlow dataset, just save content
    await prisma.source.update({
      where: { id: source.id },
      data: {
        content: markdown,
        status: "READY",
        metadata: {
          fileType: 'pdf',
          markdownLength: markdown.length,
          imageCount: Object.keys(imageMapping).length,
          processedAt: new Date().toISOString(),
        },
      },
    });
  }
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Handle DOCX files - TODO: convert to PDF and parse
 * For now, upload directly to RagFlow
 */
async function handleDocxDocument(
  file: File,
  source: { id: string },
  notebook: { ragflowDatasetId: string | null }
) {
  // TODO: Convert DOCX to PDF and parse with MineRU
  // For now, fall back to direct RagFlow upload
  console.warn("DOCX parsing not yet implemented, using RagFlow fallback");
  await handleFallbackDocument(file, source, notebook);
}

/**
 * Fallback handler - upload directly to RagFlow
 */
async function handleFallbackDocument(
  file: File,
  source: { id: string },
  notebook: { ragflowDatasetId: string | null }
) {
  if (notebook.ragflowDatasetId) {
    try {
      // Upload document to RagFlow
      const doc = await ragflowClient.uploadDocument(
        notebook.ragflowDatasetId,
        file,
        file.name,
        { autoParse: true }
      );

      // Update status to processing
      await prisma.source.update({
        where: { id: source.id },
        data: {
          ragflowDocumentId: doc.id,
          status: "PROCESSING",
          metadata: {
            fileType: file.name.split('.').pop()?.toLowerCase() || 'unknown',
            ragflowRun: "RUNNING",
            ragflowProgress: doc.progress ?? 0,
            uploadStartedAt: new Date().toISOString(),
          },
        },
      });

      // Trigger parsing
      await ragflowClient.parseDocuments(notebook.ragflowDatasetId, [doc.id]);
    } catch (ragflowError) {
      console.error("RagFlow upload error:", ragflowError);
      // Continue without RagFlow
      await prisma.source.update({
        where: { id: source.id },
        data: { status: "READY" },
      });
    }
  } else {
    // No RagFlow dataset configured, just mark as ready
    await prisma.source.update({
      where: { id: source.id },
      data: { status: "READY" },
    });
  }
}


export async function deleteSource(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Get source and verify ownership
  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true, images: true },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Source not found");
  }

  // Delete from RagFlow if exists
  if (source.ragflowDocumentId && source.notebook.ragflowDatasetId) {
    try {
      await ragflowClient.deleteDocument(
        source.notebook.ragflowDatasetId,
        source.ragflowDocumentId
      );
    } catch (error) {
      console.error("RagFlow delete error:", error);
      // Continue with local deletion even if RagFlow fails
    }
  }

  // Delete images from S3 if any exist
  if (source.images && source.images.length > 0) {
    try {
      const { deleteImage } = await import("@/lib/s3-client");
      for (const image of source.images) {
        await deleteImage(image.storageKey);
      }
    } catch (error) {
      console.error("S3 image delete error:", error);
      // Continue with source deletion even if S3 delete fails
    }
  }

  // Delete source (cascade will delete SourceImage records)
  await prisma.source.delete({ where: { id: sourceId } });
  revalidatePath(`/deepdive/${source.notebookId}`);
}

/**
 * Sync source status with RagFlow
 */
export async function syncSourceStatus(sourceId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: true },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    throw new Error("Source not found");
  }

  if (!source.ragflowDocumentId || !source.notebook.ragflowDatasetId) {
    return source;
  }

  try {
    const doc = await ragflowClient.getDocumentStatus(
      source.notebook.ragflowDatasetId,
      source.ragflowDocumentId
    );

    if (doc) {
      // Map RagFlow status to our status
      const runValue = (doc.run || doc.status || "").toString().toUpperCase();
      let status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED" = "PROCESSING";

      if (runValue === "DONE" || runValue === "3") {
        status = "READY";
      } else if (
        runValue === "FAIL" ||
        runValue === "4" ||
        runValue === "-1" ||
        runValue === "ERROR"
      ) {
        status = "FAILED";
      } else {
        status = "PROCESSING";
      }

      if (source.status !== status) {
        await prisma.source.update({
          where: { id: sourceId },
          data: {
            status,
            metadata: {
              ...(source.metadata as Record<string, unknown> | null),
              ragflowRun: doc.run ?? runValue,
              ragflowStatus: doc.status,
              ragflowProgress: doc.progress,
              ragflowUpdatedAt: new Date().toISOString(),
            },
          },
        });
      }
    }
  } catch (error) {
    console.error("Sync source status error:", error);
  }

  return prisma.source.findUnique({ where: { id: sourceId } });
}
