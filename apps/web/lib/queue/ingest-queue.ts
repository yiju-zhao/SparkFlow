import { Queue, QueueEvents, type JobProgress, type JobsOptions } from "bullmq";
import { getBullmqConnection } from "./redis";

export const INGEST_QUEUE_NAME = "wiki-ingest";

export type WikiIngestJobData = {
  notebookId: string;
  sourceId: string;
  userId: string;
};

export type WikiIngestJobResult = {
  pagesWritten: number;
  pages: string[];
};

const globalForQueue = globalThis as unknown as {
  wikiIngestQueue: Queue<WikiIngestJobData, WikiIngestJobResult> | undefined;
  wikiIngestQueueEvents: QueueEvents | undefined;
};

/**
 * Lazy — first call opens the Redis connection. Keeping this out of module
 * scope avoids failing `next build`'s page-data collection when REDIS_URL
 * isn't set in the build env.
 */
export function getWikiIngestQueue(): Queue<WikiIngestJobData, WikiIngestJobResult> {
  if (!globalForQueue.wikiIngestQueue) {
    globalForQueue.wikiIngestQueue = new Queue<WikiIngestJobData, WikiIngestJobResult>(
      INGEST_QUEUE_NAME,
      {
        connection: getBullmqConnection(),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: "exponential", delay: 5_000 },
          removeOnComplete: { age: 24 * 3600, count: 500 },
          removeOnFail: { age: 7 * 24 * 3600, count: 500 },
        },
      },
    );
  }
  return globalForQueue.wikiIngestQueue;
}

/**
 * One job per (notebook, source) — re-uploading the same source returns the
 * existing job instead of stacking duplicates behind the worker.
 */
function jobId(data: WikiIngestJobData): string {
  return `nb:${data.notebookId}:src:${data.sourceId}`;
}

export async function enqueueWikiIngest(
  data: WikiIngestJobData,
  opts: JobsOptions & { force?: boolean } = {},
): Promise<string> {
  const id = jobId(data);
  const queue = getWikiIngestQueue();

  if (opts.force) {
    // Drop any prior instance of this jobId — completed, failed, or delayed —
    // so `queue.add` doesn't silently return the old corpse.
    try {
      await queue.remove(id);
    } catch {
      // `remove` throws if the job is active; that's fine — don't re-enqueue
      // while an attempt is in flight.
    }
  }

  const { force: _force, ...addOpts } = opts;
  const job = await queue.add(INGEST_QUEUE_NAME, data, {
    jobId: id,
    ...addOpts,
  });
  return job.id ?? id;
}

export type WikiIngestJobStatus = {
  jobId: string;
  state:
    | "waiting"
    | "active"
    | "delayed"
    | "completed"
    | "failed"
    | "paused"
    | "unknown"
    | "waiting-children"
    | "prioritized";
  progress: JobProgress;
  attemptsMade: number;
  failedReason?: string;
  returnvalue?: WikiIngestJobResult;
  notebookId?: string;
  sourceId?: string;
  userId?: string;
};

export async function getWikiIngestJobStatus(
  jobIdArg: string,
): Promise<WikiIngestJobStatus | null> {
  const job = await getWikiIngestQueue().getJob(jobIdArg);
  if (!job) return null;
  const state = await job.getState();
  return {
    jobId: job.id ?? jobIdArg,
    state: state as WikiIngestJobStatus["state"],
    progress: job.progress ?? 0,
    attemptsMade: job.attemptsMade,
    failedReason: job.failedReason,
    returnvalue: job.returnvalue,
    notebookId: job.data?.notebookId,
    sourceId: job.data?.sourceId,
    userId: job.data?.userId,
  };
}

export function getQueueEvents(): QueueEvents {
  if (!globalForQueue.wikiIngestQueueEvents) {
    globalForQueue.wikiIngestQueueEvents = new QueueEvents(INGEST_QUEUE_NAME, {
      connection: getBullmqConnection(),
    });
  }
  return globalForQueue.wikiIngestQueueEvents;
}
