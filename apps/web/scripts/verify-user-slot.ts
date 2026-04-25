/**
 * Standalone check for the Lua semaphore in lib/queue/user-slot.ts.
 * Usage: REDIS_URL=redis://localhost:6379 npx tsx scripts/verify-user-slot.ts
 * Exits 0 on success, 1 on failure.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { acquireUserSlot, releaseUserSlot } from "../lib/queue/user-slot";
import { getBullmqConnection } from "../lib/queue/redis";

async function main() {
  const userId = `verify-${Date.now()}`;
  const limit = 2;

  // Clean any leftover state for this id.
  await getBullmqConnection().del(`ingest:slots:${userId}`);

  // Fire 5 concurrent acquires; exactly `limit` should get tokens.
  const results = await Promise.all(
    Array.from({ length: 5 }, () => acquireUserSlot(userId, limit)),
  );
  const admitted = results.filter(Boolean);
  if (admitted.length !== limit) {
    console.error(`FAIL: expected ${limit} admits, got ${admitted.length}`, results);
    process.exit(1);
  }

  // Releasing one should free a slot for a new acquire.
  await releaseUserSlot(userId, admitted[0] as string);
  const next = await acquireUserSlot(userId, limit);
  if (!next) {
    console.error("FAIL: expected acquire after release to succeed");
    process.exit(1);
  }

  await getBullmqConnection().del(`ingest:slots:${userId}`);
  await getBullmqConnection().quit();
  console.log("PASS");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
