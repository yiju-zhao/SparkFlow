/**
 * Database model types.
 * Re-exports from Prisma client for convenience, plus any extended types.
 */

export type {
  User,
  Notebook,
  Source,
  Chunk,
  ChatSession,
  ChatMessage,
  Note,
  SourceImage,
} from "@prisma/client";

/**
 * Source status enum values.
 */
export type SourceStatus = "UPLOADING" | "PROCESSING" | "READY" | "FAILED";

/**
 * Source type enum values.
 */
export type SourceType = "DOCUMENT" | "WEBPAGE";

/**
 * Chat session status enum values.
 */
export type ChatSessionStatus = "ACTIVE" | "ARCHIVED";

/**
 * Message sender enum values.
 */
export type MessageSender = "USER" | "ASSISTANT" | "SYSTEM";

/**
 * Extended Source type with optional content field.
 */
export type SourceWithContent = {
  id: string;
  notebookId: string;
  title: string;
  sourceType: SourceType;
  url: string | null;
  status: SourceStatus;
  content?: string | null;
  fileKey: string | null;
  ragflowDocumentId: string | null;
  errorMessage: string | null;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Notebook with related counts.
 */
export interface NotebookWithCounts {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  ragflowDatasetId: string | null;
  ragflowAgentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    sources: number;
    notes: number;
  };
}
