import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ProcessingContext } from "./source-processors/types";
import { processWebpage } from "./source-processors/webpage-processor";
import { processTextDocument } from "./source-processors/text-processor";
import { processPdfDocument } from "./source-processors/pdf-processor";
import {
  processDocxDocument,
  processFallbackDocument,
} from "./source-processors/fallback-processor";
import type { Source } from "@prisma/client";

/**
 * Store extracted images in PostgreSQL and rewrite markdown image references.
 */
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[],
): Promise<string> {
  let rewrittenMarkdown = markdown;

  for (const image of images) {
    const imageData = new Uint8Array(image.data);
    console.log(
      `[storeImage] Saving "${image.name}" (${image.mimeType}), ${imageData.byteLength} bytes`,
    );

    const savedImage = await prisma.sourceImage.create({
      data: {
        sourceId,
        originalName: image.name,
        mimeType: image.mimeType,
        data: imageData,
      },
    });

    const apiUrl = `/api/images/${savedImage.id}`;

    // Replace full path first (e.g., "prefix/images/hash.jpg")
    if (image.fullPath) {
      rewrittenMarkdown = rewrittenMarkdown.replaceAll(image.fullPath, apiUrl);

      // Also try path suffixes — MinerU zip paths have a prefix the markdown doesn't use.
      // e.g., fullPath "content_abc/images/hash.jpg" but markdown says "images/hash.jpg"
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join("/");
        if (rewrittenMarkdown.includes(suffix)) {
          rewrittenMarkdown = rewrittenMarkdown.replaceAll(suffix, apiUrl);
          break;
        }
      }
    }

    // Fallback: replace filename (with optional directory prefix) in markdown image syntax.
    // Handles both ![alt](hash.jpg) and ![alt](images/hash.jpg) without corrupting other text.
    const escaped = image.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewrittenMarkdown = rewrittenMarkdown.replace(
      new RegExp(`(!\\[[^\\]]*\\]\\()[^)]*?${escaped}(\\))`, "g"),
      `$1${apiUrl}$2`,
    );
  }

  return rewrittenMarkdown;
}

class SourceService {
  async addWebpageSource(notebookId: string, url: string, title?: string): Promise<Source> {
    const source = await prisma.source.create({
      data: {
        notebookId,
        title: title || new URL(url).hostname,
        sourceType: "WEBPAGE",
        url,
        status: "PROCESSING",
      },
    });

    revalidatePath(`/deepdive/${notebookId}`);

    const context: ProcessingContext = {
      sourceId: source.id,
      notebookId,
    };

    this.processInBackground(() => processWebpage(url, title, context), notebookId);

    return source;
  }

  async uploadDocumentSource(notebookId: string, file: File): Promise<Source> {
    const source = await prisma.source.create({
      data: {
        notebookId,
        title: file.name,
        sourceType: "DOCUMENT",
        status: "PROCESSING",
      },
    });

    revalidatePath(`/deepdive/${notebookId}`);

    const context: ProcessingContext = {
      sourceId: source.id,
      notebookId,
    };

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    this.processInBackground(() => this.processDocument(file, fileExtension, context), notebookId);

    return source;
  }

  private async processDocument(file: File, fileExtension: string, context: ProcessingContext) {
    if (fileExtension === "txt" || fileExtension === "md") {
      return processTextDocument(file, context);
    } else if (fileExtension === "pdf") {
      return processPdfDocument(file, context);
    } else if (fileExtension === "docx" || fileExtension === "doc") {
      return processDocxDocument(file, context);
    } else {
      return processFallbackDocument(file, context);
    }
  }

  private processInBackground(processFn: () => Promise<unknown>, notebookId: string): void {
    processFn()
      .catch(console.error)
      .finally(() => {
        try {
          revalidatePath(`/deepdive/${notebookId}`);
        } catch {
          // Ignore revalidation errors in background context
        }
      });
  }
}

export const sourceService = new SourceService();
export { SourceService };
