import type { DigestSourceType, DigestStatus } from "@prisma/client";

export type { DigestSourceType, DigestStatus };

/** One entry inside DigestSection.items (JSON). */
export interface DigestItem {
  rank: number;                  // 1..topN
  externalId: string;            // source-native id as string
  sourceRefId: string | number;
  sourceName: string;
  title: string;
  author?: string;
  publishedAt: string;           // ISO 8601
  url: string;
  score: number;                 // 0..1
  matchedQueries: string[];
  reason: string;
  summary: string;
  meta?: Record<string, unknown>;
}

/** User's `digestConfig` JSON on UserSettings. */
export interface DigestConfig {
  queries: {
    id: string;                  // stable uuid
    text: string;                // <= 200 chars
    enabled: boolean;
    createdAt: string;           // ISO 8601
  }[];
  sources: {
    wechat?: {
      subscribedSourceIds: number[];   // empty = all
      topN: number;                     // 1..10, default 5
    };
  };
}

export interface DigestSectionStatus {
  id: string;
  sourceType: DigestSourceType;
  status: DigestStatus;
  items: DigestItem[];
  candidatePool: number;
  modelUsed: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface DigestGenerateRequest {
  date: string;                  // "YYYY-MM-DD"; defaults to today server-side
  sources?: DigestSourceType[];  // defaults to all configured
}
