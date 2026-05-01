/**
 * Matcher Service API Client
 *
 * Module-level fetch wrappers around the Next.js matcher API routes.
 * All calls go through `/api/matcher/*` so the session-attached userId
 * is injected server-side; we never hit the workflows-API directly here.
 */

import type { CreateMatchJobInput, JobProgress, MatchJob } from "./types";

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
