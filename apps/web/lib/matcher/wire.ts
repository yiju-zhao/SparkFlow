/**
 * Matcher Wire Contract
 *
 * Centralizes the snake_case ↔ camelCase translation between this Next.js app
 * and the workflows-API (Python). Two shapes:
 *
 *   - Prisma-shaped (camelCase, what `lib/matcher/types.ts` exports) — what the
 *     DB and React components see.
 *   - Wire-shaped (snake_case) — what the workflows-API speaks.
 *
 * Use `toWire()` for outbound payloads (Next.js → workflows-API) and
 * `fromWire()` for inbound payloads (workflows-API → Next.js).
 *
 * If a third shape ever shows up (a different upstream service, etc.), add a
 * new pair here. Do **not** reinstate the inline transforms in route handlers.
 */

import type { MatchJobStatus, MatchTargetType, ParsedQuery } from "./types";

// ────────────────────────────────────────────────────────────────────────────
// Wire-shaped types (snake_case). Kept independent of `types.ts` so a Prisma
// rename never silently breaks the wire contract.
// ────────────────────────────────────────────────────────────────────────────

export interface WireParsedQuery {
  id: string;
  bu: string;
  query: string;
  row_index: number;
  optimized_query_native?: string;
  optimized_query_en?: string;
  optimization_focuses?: string[];
  optimizer_used_llm?: boolean;
}

export interface WireJobProgress {
  id: string;
  status: MatchJobStatus;
  progress: number;
  error_message: string | null;
  query_count: number;
  match_count: number;
  top_k?: number;
}

export interface WireMatchJob {
  id: string;
  user_id: string;
  instance_id: string;
  target_type: MatchTargetType;
  top_k: number;
  search_k: number;
  include_reasons: boolean;
  query_data: WireParsedQuery[] | null;
  result_file_key: string | null;
  status: MatchJobStatus;
  progress: number;
  error_message: string | null;
  query_count: number;
  match_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

/**
 * Outbound POST payload to `/v1/workflows/matcher/jobs`. Includes auth/key
 * bits that aren't part of any persisted shape.
 */
export interface WireCreateMatchJob {
  instance_id: string;
  target_type: MatchTargetType;
  queries: WireParsedQuery[];
  top_k: number;
  search_k: number;
  include_reasons: boolean;
  target_data: Record<string, unknown>[];
  model_provider: string;
  model_name: string;
  user_id: string;
  api_key: string;
  api_base: string | null;
}

// ────────────────────────────────────────────────────────────────────────────
// Conversion helpers. Hand-rolled (no key-mangling reflection) so the compiler
// catches drift between the Prisma shape and the wire shape.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Convert a `ParsedQuery` (camelCase) to its wire form (snake_case).
 */
export function parsedQueryToWire(q: ParsedQuery): WireParsedQuery {
  const wire: WireParsedQuery = {
    id: q.id,
    bu: q.bu,
    query: q.query,
    row_index: q.rowIndex,
  };
  if (q.optimizedQueryNative !== undefined) wire.optimized_query_native = q.optimizedQueryNative;
  if (q.optimizedQueryEn !== undefined) wire.optimized_query_en = q.optimizedQueryEn;
  if (q.optimizationFocuses !== undefined) wire.optimization_focuses = q.optimizationFocuses;
  if (q.optimizerUsedLlm !== undefined) wire.optimizer_used_llm = q.optimizerUsedLlm;
  return wire;
}

/**
 * Convert a single wire-shaped query item back to camelCase. Tolerant: workflows-API
 * sometimes echoes the original camelCase (when the optimizer no-ops), so we
 * accept either spelling on the way in.
 */
export function parsedQueryFromWire(item: unknown): ParsedQuery {
  const record = (item ?? {}) as Record<string, unknown>;

  const rawFocuses = record.optimization_focuses ?? record.optimizationFocuses;
  const optimizationFocuses = Array.isArray(rawFocuses)
    ? rawFocuses.filter((focus): focus is string => typeof focus === "string" && focus.length > 0)
    : [];

  return {
    id: typeof record.id === "string" ? record.id : "",
    bu: typeof record.bu === "string" ? record.bu : "",
    query: typeof record.query === "string" ? record.query : "",
    rowIndex:
      typeof record.rowIndex === "number"
        ? record.rowIndex
        : typeof record.row_index === "number"
          ? record.row_index
          : 0,
    optimizedQueryNative:
      typeof record.optimizedQueryNative === "string"
        ? record.optimizedQueryNative
        : typeof record.optimized_query_native === "string"
          ? record.optimized_query_native
          : undefined,
    optimizedQueryEn:
      typeof record.optimizedQueryEn === "string"
        ? record.optimizedQueryEn
        : typeof record.optimized_query_en === "string"
          ? record.optimized_query_en
          : undefined,
    optimizationFocuses,
    optimizerUsedLlm:
      typeof record.optimizerUsedLlm === "boolean"
        ? record.optimizerUsedLlm
        : typeof record.optimizer_used_llm === "boolean"
          ? record.optimizer_used_llm
          : undefined,
  };
}

/**
 * Convert a list of wire-shaped queries back to camelCase, or `undefined` if the
 * input isn't an array (workflows-API sometimes returns null pre-optimization).
 */
export function parsedQueriesFromWire(value: unknown): ParsedQuery[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(parsedQueryFromWire);
}

// ────────────────────────────────────────────────────────────────────────────
// Top-level toWire / fromWire. These are the entry points the API routes use.
// ────────────────────────────────────────────────────────────────────────────

interface ToWireInput {
  instanceId: string;
  targetType: MatchTargetType;
  queries: ParsedQuery[];
  topK: number;
  searchK: number;
  includeReasons: boolean;
  targetData: Record<string, unknown>[];
  modelProvider: string;
  modelName: string;
  userId: string;
  apiKey: string;
  apiBase: string | null;
}

/**
 * Build the outbound `POST /v1/workflows/matcher/jobs` body from the
 * Prisma-shaped wizard inputs.
 */
export function toWire(input: ToWireInput): WireCreateMatchJob {
  return {
    instance_id: input.instanceId,
    target_type: input.targetType,
    queries: input.queries.map(parsedQueryToWire),
    top_k: input.topK,
    search_k: input.searchK,
    include_reasons: input.includeReasons,
    target_data: input.targetData,
    model_provider: input.modelProvider,
    model_name: input.modelName,
    user_id: input.userId,
    api_key: input.apiKey,
    api_base: input.apiBase,
  };
}

/**
 * Decode the workflows-API `GET /v1/workflows/matcher/jobs/{id}` response into
 * the camelCase shape that Prisma + React want. Only fields the routes actually
 * persist are returned — everything else is dropped.
 */
export function fromWire(wire: Record<string, unknown>): {
  status?: MatchJobStatus;
  progress?: number;
  matchCount?: number;
  errorMessage?: string | null;
  queryData?: ParsedQuery[];
} {
  const out: ReturnType<typeof fromWire> = {};

  if (typeof wire.status === "string") {
    out.status = wire.status as MatchJobStatus;
  }
  if (typeof wire.progress === "number") {
    out.progress = wire.progress;
  }
  if (typeof wire.match_count === "number") {
    out.matchCount = wire.match_count;
  }
  if (wire.error_message === null || typeof wire.error_message === "string") {
    out.errorMessage = wire.error_message;
  }
  const decoded = parsedQueriesFromWire(wire.query_data);
  if (decoded) {
    out.queryData = decoded;
  }
  return out;
}
