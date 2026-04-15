/**
 * Matcher Service Types
 */

export type MatchJobStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";

export type MatchTargetType = "SESSION" | "PUBLICATION";

export interface ParsedQuery {
  id: string;
  bu: string; // Business unit - who wants the matching
  query: string;
  rowIndex: number;
  optimizedQueryNative?: string;
  optimizedQueryEn?: string;
  optimizationFocuses?: string[];
  optimizerUsedLlm?: boolean;
}

export interface MatchJob {
  id: string;
  userId: string;
  instanceId: string;
  targetType: MatchTargetType;
  topK: number;
  searchK: number;
  includeReasons: boolean;
  queryFileKey: string | null;
  queryData: ParsedQuery[] | null;
  resultFileKey: string | null;
  status: MatchJobStatus;
  progress: number;
  errorMessage: string | null;
  queryCount: number;
  matchCount: number;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface JobProgress {
  id: string;
  status: MatchJobStatus;
  progress: number;
  errorMessage: string | null;
  queryCount: number;
  matchCount: number;
  topK?: number;
}

export interface CreateMatchJobInput {
  userId?: string; // Optional - injected by Next.js API route from session
  instanceId: string;
  targetType: MatchTargetType;
  queries?: ParsedQuery[]; // Pre-parsed queries from frontend (preferred)
  queryFileKey?: string; // Optional - only needed if queries not provided
  topK?: number;
  searchK?: number;
  includeReasons?: boolean;
}

export interface UploadResult {
  fileKey: string;
  queries: ParsedQuery[];
  queryCount: number;
}
