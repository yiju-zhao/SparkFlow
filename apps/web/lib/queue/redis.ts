import IORedis, { type Redis } from "ioredis";

/**
 * Shared ioredis connection for BullMQ. Lazily created on first access so
 * `next build` (which imports route modules just to collect metadata) does
 * not fail when REDIS_URL is unset in the build environment.
 */

const globalForRedis = globalThis as unknown as {
  bullmqConnection: Redis | undefined;
};

function createConnection(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "REDIS_URL is not set — required for the BullMQ ingest queue. " +
        "Start the redis service via `docker compose up -d` and set REDIS_URL in .env.local.",
    );
  }
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}

export function getBullmqConnection(): Redis {
  if (!globalForRedis.bullmqConnection) {
    globalForRedis.bullmqConnection = createConnection();
  }
  return globalForRedis.bullmqConnection;
}
