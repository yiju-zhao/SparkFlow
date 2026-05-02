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

  eventSource.onerror = () => {
    // Note: onerror fires when connection closes, which is normal after job completion.
    // The onError callback will be ignored by hooks.ts if the job already completed.
    console.log("[matcher] SSE connection closed");
    if (onError) {
      onError(new Error("SSE connection error"));
    }
  };

  return eventSource;
}

/**
 * Cancel a running job.
 */
export async function cancelJob(jobId: string): Promise<void> {
  const response = await fetch(`/api/matcher/jobs/${jobId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to cancel job");
  }
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
