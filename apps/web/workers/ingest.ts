/**
 * Wiki-ingest BullMQ worker.
 *
 * Run locally:   npm run worker:ingest
 * Concurrency is tuned by two env vars:
 *   INGEST_WORKER_CONCURRENCY    — total jobs in flight in this process
 *   INGEST_PER_USER_CONCURRENCY  — max jobs a single user can occupy
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { DelayedError, UnrecoverableError, Worker, type Job } from "bullmq";
import { getBullmqConnection } from "../lib/queue/redis";
import {
  INGEST_QUEUE_NAME,
  type WikiIngestJobData,
  type WikiIngestJobResult,
} from "../lib/queue/ingest-queue";
import { ingestSourceToWiki } from "../lib/services/wiki-ingest";
import { acquireNotebookLock, releaseNotebookLock } from "../lib/queue/notebook-lock";
import { acquireUserSlot, releaseUserSlot } from "../lib/queue/user-slot";

const CONCURRENCY = Number(process.env.INGEST_WORKER_CONCURRENCY ?? 4);
const PER_USER_LIMIT = Number(process.env.INGEST_PER_USER_CONCURRENCY ?? 2);

async function processJob(
  job: Job<WikiIngestJobData, WikiIngestJobResult>,
  token?: string,
): Promise<WikiIngestJobResult> {
  const { notebookId, sourceId, userId } = job.data;
  if (!notebookId || !sourceId || !userId) {
    throw new UnrecoverableError("missing notebookId / sourceId / userId on job");
  }

  const slotToken = await acquireUserSlot(userId, PER_USER_LIMIT);
  if (!slotToken) {
    // Reschedule without burning the attempts budget.
    await job.moveToDelayed(Date.now() + 2_000, token);
    throw new DelayedError();
  }

  const notebookLock = await acquireNotebookLock(notebookId);
  if (!notebookLock) {
    await releaseUserSlot(userId, slotToken).catch(() => undefined);
    await job.moveToDelayed(Date.now() + 3_000, token);
    throw new DelayedError();
  }

  const startedAt = Date.now();
  try {
    await job.updateProgress({ phase: "extracting", started: startedAt });
    const result = await ingestSourceToWiki(notebookId, sourceId, userId);
    await job.updateProgress({ phase: "done", pagesWritten: result.pagesWritten });
    return result;
  } finally {
    await releaseNotebookLock(notebookLock).catch(() => undefined);
    await releaseUserSlot(userId, slotToken).catch(() => undefined);
  }
}

const worker = new Worker<WikiIngestJobData, WikiIngestJobResult>(
  INGEST_QUEUE_NAME,
  processJob,
  {
    connection: getBullmqConnection(),
    concurrency: CONCURRENCY,
  },
);

worker.on("ready", () => {
  console.log(
    `[ingest-worker] ready — concurrency=${CONCURRENCY} perUserLimit=${PER_USER_LIMIT}`,
  );
});
worker.on("active", (job) => {
  console.log(`[ingest-worker] active job=${job.id} user=${job.data.userId}`);
});
worker.on("completed", (job, result) => {
  console.log(
    `[ingest-worker] completed job=${job.id} user=${job.data.userId} pages=${result.pagesWritten}`,
  );
});
worker.on("failed", (job, err) => {
  console.error(
    `[ingest-worker] failed job=${job?.id} user=${job?.data.userId}: ${err.message}`,
  );
});
worker.on("error", (err) => {
  console.error(`[ingest-worker] error: ${err.message}`);
});

async function shutdown(signal: string): Promise<void> {
  console.log(`[ingest-worker] ${signal} received, closing...`);
  await worker.close();
  await getBullmqConnection().quit();
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
