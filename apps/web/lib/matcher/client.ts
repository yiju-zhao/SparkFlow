/**
 * Matcher Service API Client
 *
 * Module-level fetch wrappers around the Next.js matcher API routes.
 * All calls go through `/api/matcher/*` so the session-attached userId
 * is injected server-side; we never hit the workflows-API directly here.
 */

import type { CreateMatchJobInput, JobProgress, MatchJob } from "./types";

/**
 * Thrown by createJob when the server rejects the submission because the
 * user already has a PENDING/PROCESSING job. The wizard catches this and
 * deep-links to the inflight job instead of surfacing a generic error.
 */
export class InflightJobError extends Error {
  readonly inflightJobId: string;
  constructor(inflightJobId: string, message: string) {
    super(message);
    this.name = "InflightJobError";
    this.inflightJobId = inflightJobId;
  }
}

/**
 * Create a new match job. Routes through Next.js API to get userId from session.
 */
export async function createJob(input: CreateMatchJobInput): Promise<MatchJob> {
  const response = await fetch("/api/matcher/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Unknown error" }));
    if (response.status === 409 && typeof error.inflightJobId === "string") {
      throw new InflightJobError(error.inflightJobId, error.error || "Job already running");
    }
    throw new Error(error.detail || error.error || "Failed to create job");
  }

  return response.json();
}

/**
 * Get full job details.
 */
export async function getJob(jobId: string): Promise<MatchJob> {
  const response = await fetch(`/api/matcher/jobs/${jobId}`);

  if (!response.ok) {
    throw new Error("Failed to get job");
  }

  return response.json();
}

/**
 * Subscribe to job progress updates via SSE.
 * Routes through the Next.js proxy to avoid CORS issues.
 */
export function subscribeToJobProgress(
  jobId: string,
  onProgress: (progress: JobProgress) => void,
  onError?: (error: Error) => void,
): EventSource {
  const url = `/api/matcher/jobs/${jobId}/stream`;
  const eventSource = new EventSource(url);

  eventSource.onopen = () => {
    console.log("[matcher] SSE connection opened");
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onProgress(data);
    } catch (e) {
      console.error("[matcher] Failed to parse SSE data:", e);
    }
  };

  // The "error" listener catches BOTH connection-level errors (no .data)
  // AND server-sent named "error" events (with JSON .data). workflows-api
  // emits the latter when its in-memory job_store has lost the job, e.g.
  // after a workflows-api restart while Postgres still has the row. We
  // must close() in that case — otherwise EventSource auto-reconnects
  // forever and burns the upstream.
  eventSource.addEventListener("error", (event) => {
    const data = (event as MessageEvent).data;
    if (typeof data === "string" && data.length > 0) {
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(data);
      } catch {
        /* fall through to generic close */
      }
      const message =
        parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
          ? String((parsed as { error: unknown }).error)
          : "Job stream ended";
      console.warn("[matcher] SSE upstream error:", message);
      eventSource.close();
      if (onError) onError(new Error(message));
      return;
    }
    // Connection-level error. EventSource auto-reconnects unless
    // readyState === CLOSED — only surface as a real failure once it's
    // permanently dead, otherwise we'd tear down the consumer on every
    // reconnection blip and pop the Next 16 dev overlay.
    if (eventSource.readyState !== EventSource.CLOSED) {
      console.warn("[matcher] SSE transient error, awaiting auto-reconnect");
      return;
    }
    console.warn("[matcher] SSE connection closed");
    if (onError) onError(new Error("SSE connection closed"));
  });

  return eventSource;
}

/**
 * Cancel a running job.
 *
 * Distinct from a history delete — this stops the work (best-effort) and
 * leaves the row in the DB with status=CANCELLED. The history page's
 * trash button is what wipes the row entirely.
 */
export async function cancelJob(jobId: string): Promise<MatchJob> {
  const response = await fetch(`/api/matcher/jobs/${jobId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Cancel failed" }));
    throw new Error(err.error || `Cancel failed (${response.status})`);
  }
  return response.json();
}

/**
 * Get download URL for the result file.
 */
export function getDownloadUrl(jobId: string): string {
  return `/api/matcher/jobs/${jobId}/download`;
}

/**
 * Download the result file for a completed job.
 *
 * Uses fetch + blob URL instead of `window.open` / `<a href>` so that
 * Chrome's "insecure download" policy doesn't block .xlsx files on HTTP
 * deployments (e.g. http://10.x:3003 corp-network installs). The blob
 * URL is same-origin and never triggers the policy check, while the
 * underlying fetch piggybacks on the page's existing HTTP context.
 *
 * Throws on non-2xx so the caller can surface the message.
 */
export async function downloadJobResult(jobId: string): Promise<void> {
  const response = await fetch(getDownloadUrl(jobId));
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Download failed" }));
    throw new Error(err.error || `Download failed (${response.status})`);
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = `match-results-${jobId}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Defer revoke so the click has time to start the download. Without
    // a tick, Chrome occasionally races the revoke and aborts the save.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
