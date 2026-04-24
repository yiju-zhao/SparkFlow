import { getBullmqConnection } from "./redis";

/**
 * Per-notebook mutex backed by Redis SET NX PX. The heartbeat extends the
 * TTL while the holder is still alive; this lets the ingest pipeline run
 * longer than the base TTL without losing mutual exclusion.
 */

const BASE_TTL_MS = 5 * 60 * 1000;          // 5 min
const HEARTBEAT_INTERVAL_MS = 60 * 1000;    // extend every 60s
const HEARTBEAT_EXTEND_MS = 5 * 60 * 1000;  // push TTL to now + 5 min

function lockKey(notebookId: string): string {
  return `lock:notebook:${notebookId}`;
}

export type NotebookLockHandle = {
  notebookId: string;
  token: string;
  stopHeartbeat: () => void;
};

export async function acquireNotebookLock(
  notebookId: string,
): Promise<NotebookLockHandle | null> {
  const token = `${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
  const result = await getBullmqConnection().set(
    lockKey(notebookId),
    token,
    "PX",
    BASE_TTL_MS,
    "NX",
  );
  if (result !== "OK") return null;

  const heartbeat = setInterval(() => {
    void extendLock(notebookId, token, HEARTBEAT_EXTEND_MS).catch((err) => {
      console.warn(`[notebook-lock] heartbeat failed for ${notebookId}:`, err);
    });
  }, HEARTBEAT_INTERVAL_MS);
  // Don't hold the Node event loop open just for a heartbeat.
  heartbeat.unref?.();

  return {
    notebookId,
    token,
    stopHeartbeat: () => clearInterval(heartbeat),
  };
}

const EXTEND_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("PEXPIRE", KEYS[1], ARGV[2])
  else
    return 0
  end
`;

async function extendLock(
  notebookId: string,
  token: string,
  extendMs: number,
): Promise<void> {
  await getBullmqConnection().eval(
    EXTEND_SCRIPT,
    1,
    lockKey(notebookId),
    token,
    String(extendMs),
  );
}

const RELEASE_SCRIPT = `
  if redis.call("GET", KEYS[1]) == ARGV[1] then
    return redis.call("DEL", KEYS[1])
  else
    return 0
  end
`;

export async function releaseNotebookLock(handle: NotebookLockHandle): Promise<void> {
  handle.stopHeartbeat();
  try {
    await getBullmqConnection().eval(
      RELEASE_SCRIPT,
      1,
      lockKey(handle.notebookId),
      handle.token,
    );
  } catch (err) {
    console.warn(`[notebook-lock] release failed for ${handle.notebookId}:`, err);
  }
}
