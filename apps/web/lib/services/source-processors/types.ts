/**
 * Context for processing a source document.
 */
export interface ProcessingContext {
  sourceId: string;
  notebookId: string;
  userId?: string; // for BYOK key resolution
}

/**
 * Result of processing a source document.
 */
export interface ProcessingResult {
  success: boolean;
  content?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Common source data for database updates.
 */
export interface SourceUpdateData {
  title?: string;
  markdown?: string;
  html?: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}
