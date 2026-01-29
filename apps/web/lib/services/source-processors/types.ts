/**
 * Context for processing a source document.
 */
export interface ProcessingContext {
  sourceId: string;
  ragflowDatasetId: string | null;
  notebookId: string;
}

/**
 * Result of processing a source document.
 */
export interface ProcessingResult {
  success: boolean;
  content?: string;
  ragflowDocumentId?: string;
  metadata?: Record<string, unknown>;
  errorMessage?: string;
}

/**
 * Common source data for database updates.
 */
export interface SourceUpdateData {
  title?: string;
  content?: string;
  ragflowDocumentId?: string;
  status: "UPLOADING" | "PROCESSING" | "READY" | "FAILED";
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}
