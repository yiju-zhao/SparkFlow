/**
 * Matcher Hooks
 *
 * React hooks for matcher functionality.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matcherClient } from "./client";
import type { JobProgress, MatchJob, MatchJobStatus } from "./types";

/**
 * Hook for polling job progress
 */
export function useJobProgress(
  jobId: string | null,
  options: {
    pollingInterval?: number;
    onComplete?: (job: MatchJob) => void;
    onError?: (error: Error) => void;
  } = {},
) {
  const { pollingInterval = 2000, onComplete, onError } = options;
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (!jobId) return;

    stopPolling();
    setIsLoading(true);

    const poll = async () => {
      try {
        const data = await matcherClient.getJobProgress(jobId);
        setProgress(data);

        // Stop polling if job is complete
        if (isTerminalStatus(data.status)) {
          stopPolling();
          setIsLoading(false);

          if (data.status === "COMPLETED" && onComplete) {
            const fullJob = await matcherClient.getJob(jobId);
            onComplete(fullJob);
          } else if (data.status === "FAILED" && onError) {
            onError(new Error(data.errorMessage || "Job failed"));
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
        if (onError) {
          onError(error instanceof Error ? error : new Error("Polling failed"));
        }
      }
    };

    // Initial poll
    poll();

    // Start interval
    intervalRef.current = setInterval(poll, pollingInterval);
  }, [jobId, pollingInterval, stopPolling, onComplete, onError]);

  useEffect(() => {
    if (jobId) {
      startPolling();
    } else {
      stopPolling();
      setProgress(null);
    }

    return () => stopPolling();
  }, [jobId, startPolling, stopPolling]);

  return {
    progress,
    isLoading,
    startPolling,
    stopPolling,
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

// Helper functions
function isTerminalStatus(status: MatchJobStatus): boolean {
  return ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
}
