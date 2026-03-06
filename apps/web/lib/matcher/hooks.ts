/**
 * Matcher Hooks
 *
 * React hooks for matcher functionality.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matcherClient } from "./client";
import type { JobProgress, MatchJob, MatchJobStatus } from "./types";

// Global registry to track SSE connections by jobId
const sseConnections = new Map<string, EventSource>();

/**
 * Hook for streaming job progress via SSE
 */
export function useJobProgress(
  jobId: string | null,
  options: {
    onComplete?: (job: MatchJob) => void;
    onError?: (error: Error) => void;
  } = {},
) {
  const { onComplete, onError } = options;
  
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Store callbacks in refs
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
  }, [onComplete, onError]);

  useEffect(() => {
    if (!jobId) {
      setProgress(null);
      setIsLoading(false);
      setIsConnected(false);
      return;
    }

    // Check if connection already exists
    if (sseConnections.has(jobId)) {
      console.log("[Matcher] SSE connection already exists for job:", jobId);
      setIsConnected(true);
      setIsLoading(true);
      return;
    }

    console.log("[Matcher] Creating SSE connection for job:", jobId);
    setIsLoading(true);

    // Track if job completed successfully - used to ignore onerror after completion
    let jobCompleted = false;

    const eventSource = matcherClient.subscribeToJobProgress(
      jobId,
      (data: JobProgress) => {
        console.log("[Matcher] SSE progress:", data.status, data.progress + "%");
        setProgress(data);
        setIsConnected(true);

        if (data.status === "COMPLETED") {
          console.log("[Matcher] Job completed");
          jobCompleted = true;
          setIsLoading(false);
          sseConnections.delete(jobId);

          if (onCompleteRef.current) {
            matcherClient.getJob(jobId)
              .then(onCompleteRef.current)
              .catch(console.error);
          }
        } else if (data.status === "FAILED") {
          jobCompleted = true; // Mark as completed to prevent onerror from also firing
          setIsLoading(false);
          sseConnections.delete(jobId);
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
        console.error("[Matcher] SSE error:", error);
        setIsConnected(false);
        setIsLoading(false);
        sseConnections.delete(jobId);

        if (onErrorRef.current) {
          onErrorRef.current(error);
        }
      },
    );

    // Store connection globally
    sseConnections.set(jobId, eventSource);

    // Don't close on cleanup - let the connection complete naturally
    // This prevents React StrictMode double-effect issues
    // The connection will close when job completes or errors
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

  const createJob = useCallback(async (input: Parameters<typeof matcherClient.createJob>[0]) => {
    setIsCreating(true);
    setError(null);

    try {
      const newJob = await matcherClient.createJob(input);
      setJob(newJob);
      return newJob;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create job";
      setError(message);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      await matcherClient.cancelJob(jobId);
      setJob((prev) =>
        prev ? { ...prev, status: "CANCELLED" as MatchJobStatus } : null,
      );
    } catch (err) {
      console.error("Failed to cancel job:", err);
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setJob(null);
    setError(null);
    setIsCreating(false);
  }, []);

  return {
    job,
    isCreating,
    error,
    createJob,
    cancelJob,
    reset,
  };
}

/**
 * Hook to check matcher service health
 */
export function useMatcherHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  const checkHealth = useCallback(async () => {
    setIsChecking(true);
    try {
      const healthy = await matcherClient.healthCheck();
      setIsHealthy(healthy);
    } catch {
      setIsHealthy(false);
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    checkHealth();
  }, [checkHealth]);

  return { isHealthy, isChecking, checkHealth };
}
