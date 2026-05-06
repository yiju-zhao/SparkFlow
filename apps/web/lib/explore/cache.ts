// apps/web/lib/explore/cache.ts
//
// Process-local LRU caches for the Research Hub (/explore) read paths.
//
// The underlying data (venues, conference instances, publications, sessions)
// only changes when an admin ingests new records — minutes-to-hours, not
// seconds. We can safely cache aggressively: a 30 min TTL turns the vast
// majority of tab-switches and back-navigations into in-memory hits.
//
// `staleTtl` enables stale-while-revalidate semantics — when an entry has
// expired but is still within `staleTtl`, callers may opt to serve the stale
// value and refresh in the background, preventing thundering-herd DB hits
// when an entry expires.

import { LRUCache } from "lru-cache";
import type { FilterOptions } from "./types";

const FIVE_MIN = 5 * 60 * 1000;
const FIFTEEN_MIN = 15 * 60 * 1000;
const THIRTY_MIN = 30 * 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;

export const filterOptionsCache = new LRUCache<string, FilterOptions>({
  max: 200,
  ttl: THIRTY_MIN,
  // Filter options are global lookups — cheap to keep, expensive to recompute
  // (7 queries including 2 raw `unnest()` aggregations).
  allowStale: true,
  ttlAutopurge: false,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const statsCache = new LRUCache<string, any>({
  max: 500,
  ttl: FIFTEEN_MIN,
  allowStale: true,
  ttlAutopurge: false,
});

// Per-conference / per-list grids — heavier payloads, shorter TTL.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const listCache = new LRUCache<string, any>({
  max: 500,
  ttl: FIVE_MIN,
  allowStale: true,
  ttlAutopurge: false,
});

export const TTL = { FIVE_MIN, FIFTEEN_MIN, THIRTY_MIN, ONE_HOUR };
