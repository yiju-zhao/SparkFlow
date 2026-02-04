/**
 * API request and response types.
 */

/**
 * Standard error response.
 */
export interface ApiErrorResponse {
  error: string;
}

/**
 * Standard success response with optional data.
 */
export interface ApiSuccessResponse<T = void> {
  success: true;
  data?: T;
}

/**
 * Chat API request body.
 */
export interface ChatRequest {
  messages: ChatMessage[];
  notebookId: string;
  datasetId: string;
  sessionId?: string;
  newSession?: boolean;
}

/**
 * Chat message in API format.
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Create notebook request.
 */
export interface CreateNotebookRequest {
  name: string;
  description?: string;
}

/**
 * Update notebook request.
 */
export interface UpdateNotebookRequest {
  name?: string;
  description?: string;
}

/**
 * Add webpage source request.
 */
export interface AddWebpageSourceRequest {
  url: string;
  title?: string;
}

/**
 * Create note request.
 */
export interface CreateNoteRequest {
  title: string;
  content?: string;
  tags?: string[];
}

/**
 * Update note request.
 */
export interface UpdateNoteRequest {
  title?: string;
  content?: string;
  tags?: string[];
  isPinned?: boolean;
}

/**
 * Signup request.
 */
export interface SignupRequest {
  username: string;
  email: string;
  password: string;
}

/**
 * Sources status response.
 */
export interface SourcesStatusResponse {
  sources: Array<{
    id: string;
    status: string;
    ragflowDocumentId: string | null;
    errorMessage: string | null;
    metadata: unknown;
  }>;
}
