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

class SourceService {
  /**
   * Add a webpage source to a notebook.
   */
  async addWebpageSource(
    notebookId: string,
    ragflowDatasetId: string | null,
    url: string,
    title?: string
  ): Promise<Source> {
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
    const context: ProcessingContext = {
      sourceId: source.id,
      ragflowDatasetId,
      notebookId,
    };

    this.processInBackground(
      () => processWebpage(url, title, context),
      notebookId
    );

    return source;
  }

  /**
   * Upload a document source to a notebook.
   */
  async uploadDocumentSource(
    notebookId: string,
    ragflowDatasetId: string | null,
    file: File
  ): Promise<Source> {
    // Create source with PROCESSING status
    const source = await prisma.source.create({
      data: {
        notebookId,
        title: file.name,
        sourceType: "DOCUMENT",
        status: "PROCESSING",
      },
    });

    // Revalidate immediately so it shows up in the list
    revalidatePath(`/deepdive/${notebookId}`);

    // Process in the background (fire and forget)
    const context: ProcessingContext = {
      sourceId: source.id,
      ragflowDatasetId,
      notebookId,
    };

    const fileExtension = file.name.split(".").pop()?.toLowerCase() || "";
    this.processInBackground(
      () => this.processDocument(file, fileExtension, context),
      notebookId
    );

    return source;
  }

  /**
   * Process a document based on its file type.
   */
  private async processDocument(
    file: File,
    fileExtension: string,
    context: ProcessingContext
  ) {
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

  /**
   * Run a processing function in the background with error handling.
   */
  private processInBackground(
    processFn: () => Promise<unknown>,
    notebookId: string
  ): void {
    processFn()
      .catch(console.error)
      .finally(() => {
        // Final revalidate to update status
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
