/**
 * Matcher Hooks
 *
 * React hooks for matcher functionality.
 */

"use client";

import { useEffect, useRef, useState } from "react";
import {
  cancelJob as cancelJobApi,
  createJob as createJobApi,
  getJob,
  subscribeToJobProgress,
} from "./client";
import type { CreateMatchJobInput, JobProgress, MatchJob, MatchJobStatus } from "./types";

/**
 * Hook for streaming job progress via SSE
 *
 * Lifecycle: the EventSource is owned by the effect — opened on mount, closed
 * by the cleanup function. The previous module-level `sseConnections` Map only
 * deleted on COMPLETED/FAILED/error and leaked on tab background, navigation
 * away, dev hot-reload, or React unmount. Returning the cleanup from useEffect
 * makes React responsible for the close, which is what we want.
 *
 * StrictMode double-mount note: with React.StrictMode the dev environment
 * mounts → unmounts → remounts the effect synchronously. The first cycle's
 * cleanup closes the EventSource before the second cycle opens its own —
 * the workflows-API just gets two GETs and one stays open. We accept that
 * over the leak.
 */
export function useJobProgress(
  jobId: string | null,
  options: {
    onComplete?: (job: MatchJob) => void;
    onError?: (error: Error) => void;
    /**
     * Optional initial progress snapshot — used when hydrating from
     * `?jobId=…` so the running step doesn't flash "Waiting / 0%" for
     * 1-3s while the first SSE message is in flight.
     */
    initialProgress?: JobProgress | null;
  } = {},
) {
  const { onComplete, onError, initialProgress } = options;

  const [progress, setProgress] = useState<JobProgress | null>(initialProgress ?? null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs so the effect doesn't re-run when their identity
  // changes — the wizard passes inline arrow functions on every render.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    if (!jobId) {
      queueMicrotask(() => {
        setProgress(null);
        setIsLoading(false);
        setIsConnected(false);
      });
      return;
    }

    console.log("[Matcher] Creating SSE connection for job:", jobId);
    queueMicrotask(() => setIsLoading(true));

    // jobCompleted is checked in onerror to suppress the "connection closed"
    // toast that EventSource fires after a clean server-side close on
    // COMPLETED/FAILED. Closure-local; reset by remount.
    let jobCompleted = false;

    const eventSource = subscribeToJobProgress(
      jobId,
      (data: JobProgress) => {
        console.log("[Matcher] SSE progress:", data.status, data.progress + "%");
        setProgress(data);
        setIsConnected(true);

        if (data.status === "COMPLETED") {
          console.log("[Matcher] Job completed");
          jobCompleted = true;
          setIsLoading(false);
          eventSource.close();

          if (onCompleteRef.current) {
            getJob(jobId).then(onCompleteRef.current).catch(console.error);
          }
        } else if (data.status === "FAILED") {
          jobCompleted = true; // Mark as completed to prevent onerror from also firing
          setIsLoading(false);
          eventSource.close();

          // Defence-in-depth: pull the latest persisted row so the UI sees the
          // FAILED status + error_message even if the workflows-api → Next.js
          // callback ever fails. Mirrors the COMPLETED branch above.
          getJob(jobId).catch(console.error);

          if (onErrorRef.current) {
            onErrorRef.current(new Error(data.errorMessage || "Job failed"));
          }
        }
      },
      (error) => {
        // Ignore error if job already completed - connection close after completion is normal
        if (jobCompleted) {
          console.log("[Matcher] SSE connection closed after completion (expected)");
          return;
        }
        // console.warn (not error) so the Next.js dev overlay doesn't pop on
        // ordinary SSE drops — workflows-api restart, brief network hiccup,
        // dev hot-reload of the proxy route. The job itself is still tracked
        // in Postgres; the wizard can recover by re-fetching.
        console.warn("[Matcher] SSE error:", error);
        setIsConnected(false);
        setIsLoading(false);
        eventSource.close();

        if (onErrorRef.current) {
          onErrorRef.current(error);
        }
      },
    );

    return () => {
      // React owns the lifecycle: cleanup closes the EventSource on unmount,
      // jobId change, or hot-reload. Idempotent — close() is a no-op once the
      // success/error branch above has already closed.
      console.log("[Matcher] SSE effect cleanup for job:", jobId);
      eventSource.close();
    };
  }, [jobId]);

  return {
    progress,
    isLoading,
    isConnected,
  };
}

/**
 * Hook for managing match jobs
 */
export function useMatchJob() {
  const [job, setJob] = useState<MatchJob | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not wrapped in useCallback — React Compiler auto-memoizes, and the
  // async bodies can't be preserved by manual useCallback anyway (the
  // preserve-manual-memoization rule flagged them).
  async function createJob(input: CreateMatchJobInput) {
    setIsCreating(true);
    setError(null);

    try {
      const newJob = await createJobApi(input);
      setJob(newJob);
      return newJob;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create job";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }

  async function cancelJob(jobId: string) {
    try {
      await cancelJobApi(jobId);
      setJob((prev) => (prev ? { ...prev, status: "CANCELLED" as MatchJobStatus } : null));
    } catch (err) {
      console.error("Failed to cancel job:", err);
      throw err;
    }
  }

  function reset() {
    setJob(null);
    setError(null);
    setIsCreating(false);
  }

  return {
    job,
    isCreating,
    error,
    createJob,
    cancelJob,
    reset,
  };
}
