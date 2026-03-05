/**
 * Matcher Service Types
 */

export type MatchJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type MatchTargetType = "SESSION" | "PUBLICATION";

export interface ParsedQuery {
  id: string;
  key: string;
  area: string;
  query: string;
  rowIndex: number;
}

export interface MatchJob {
  id: string;
  userId: string;
  instanceId: string;
  targetType: MatchTargetType;
  topK: number;
  searchK: number;
  includeReasons: boolean;
  queryFileKey: string;
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
}

export interface CreateMatchJobInput {
  userId?: string; // Optional - injected by Next.js API route from session
  instanceId: string;
  targetType: MatchTargetType;
  queryFileKey: string;
  topK?: number;
  searchK?: number;
  includeReasons?: boolean;
}

export interface UploadResult {
  fileKey: string;
  queries: ParsedQuery[];
  queryCount: number;
}
