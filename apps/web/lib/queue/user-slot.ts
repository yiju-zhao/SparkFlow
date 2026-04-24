import { getBullmqConnection } from "./redis";

/**
 * Per-user slot counter backed by a Redis sorted set, acquired and released
 * via atomic Lua scripts. Works correctly across worker replicas because all
 * state lives in Redis.
 */

const SLOT_TTL_MS = 30 * 60 * 1000;

function slotKey(userId: string): string {
  return `ingest:slots:${userId}`;
}

/**
 * Atomic acquire:
 *   1. Drop slots older than TTL (crash recovery).
 *   2. If the current slot count is already at `limit`, reject.
 *   3. Else add ourselves and return the token.
 * All three steps happen inside a single EVAL, so two concurrent callers
 * cannot both observe "count < limit" and both ZADD.
 */
const ACQUIRE_SCRIPT = `
  local key   = KEYS[1]
  local now   = tonumber(ARGV[1])
  local ttl   = tonumber(ARGV[2])
  local limit = tonumber(ARGV[3])
  local token = ARGV[4]

  redis.call("ZREMRANGEBYSCORE", key, "-inf", now - ttl)
  local count = redis.call("ZCARD", key)
  if count >= limit then
    return ""
  end
  redis.call("ZADD", key, now, token)
  return token
`;

const RELEASE_SCRIPT = `
  redis.call("ZREM", KEYS[1], ARGV[1])
  return 1
`;

export async function acquireUserSlot(
  userId: string,
  limit: number,
): Promise<string | null> {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
  const result = await getBullmqConnection().eval(
    ACQUIRE_SCRIPT,
    1,
    slotKey(userId),
    String(Date.now()),
    String(SLOT_TTL_MS),
    String(limit),
    token,
  );
  return result ? String(result) : null;
}

export async function releaseUserSlot(
  userId: string,
  token: string,
): Promise<void> {
  await getBullmqConnection().eval(
    RELEASE_SCRIPT,
    1,
    slotKey(userId),
    token,
  );
}
