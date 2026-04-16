import prisma from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type { ProcessingContext } from "./source-processors/types";
import { processWebpage } from "./source-processors/webpage-processor";
import { processTextDocument } from "./source-processors/text-processor";
import { processMineruDocument } from "./source-processors/mineru-processor";
import { processFallbackDocument } from "./source-processors/fallback-processor";
import type { Source } from "@prisma/client";

/**
 * Store extracted images in PostgreSQL and rewrite markdown image references.
 * Returns rewritten markdown AND a mapping of all image path aliases to their
 * final /api/images/{id} URL, so callers can reuse the map (e.g., for HTML rewriting).
 */
export async function storeImagesAndRewriteMarkdown(
  sourceId: string,
  markdown: string,
  images: { name: string; fullPath?: string; data: Buffer; mimeType: string }[],
): Promise<{ markdown: string; imagePathToApiUrl: Map<string, string> }> {
  let rewrittenMarkdown = markdown;
  const imagePathToApiUrl = new Map<string, string>();

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

    // Record every known alias for this image so later consumers (HTML builder)
    // can resolve references by any of them.
    imagePathToApiUrl.set(image.name, apiUrl);
    if (image.fullPath) {
      imagePathToApiUrl.set(image.fullPath, apiUrl);
      // Path suffixes too (e.g., "images/hash.jpg" from "prefix/images/hash.jpg")
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length; i++) {
        imagePathToApiUrl.set(parts.slice(i).join("/"), apiUrl);
      }
    }

    // Rewrite markdown
    if (image.fullPath) {
      rewrittenMarkdown = rewrittenMarkdown.replaceAll(image.fullPath, apiUrl);
      const parts = image.fullPath.split("/");
      for (let i = 1; i < parts.length - 1; i++) {
        const suffix = parts.slice(i).join("/");
        if (rewrittenMarkdown.includes(suffix)) {
          rewrittenMarkdown = rewrittenMarkdown.replaceAll(suffix, apiUrl);
          break;
        }
      }
    }

    const escaped = image.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    rewrittenMarkdown = rewrittenMarkdown.replace(
      new RegExp(`(!\\[[^\\]]*\\]\\()[^)]*?${escaped}(\\))`, "g"),
      `$1${apiUrl}$2`,
    );
  }

  return { markdown: rewrittenMarkdown, imagePathToApiUrl };
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
    }
    if (["pdf", "docx", "doc", "pptx", "ppt"].includes(fileExtension)) {
      return processMineruDocument(file, context);
    }
    return processFallbackDocument(file, context);
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
