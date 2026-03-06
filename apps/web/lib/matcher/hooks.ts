/**
 * Matcher Hooks
 *
 * React hooks for matcher functionality.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matcherClient } from "./client";
import type { JobProgress, MatchJob, MatchJobStatus } from "./types";

// Minimum time between polls to prevent hammering the server
const MIN_POLL_INTERVAL = 5000;  // 5 seconds minimum
const MAX_POLL_INTERVAL = 15000; // 15 seconds maximum

/**
 * Hook for polling job progress with throttled intervals
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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingRef = useRef(false);
  const lastPollTimeRef = useRef(0);

  const stopPolling = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    isPollingRef.current = false;
  }, []);

  const poll = useCallback(async () => {
    if (!jobId || !isPollingRef.current) return;

    // Throttle: ensure minimum time between requests
    const now = Date.now();
    const timeSinceLastPoll = now - lastPollTimeRef.current;
    if (timeSinceLastPoll < MIN_POLL_INTERVAL) {
      const waitTime = MIN_POLL_INTERVAL - timeSinceLastPoll;
      timeoutRef.current = setTimeout(poll, waitTime);
      return;
    }

    lastPollTimeRef.current = now;

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
        return;
      }

      // Calculate next interval: increase as job progresses
      const progressRatio = (data.progress || 0) / 100;
      const nextInterval = MIN_POLL_INTERVAL + (MAX_POLL_INTERVAL - MIN_POLL_INTERVAL) * progressRatio;

      // Schedule next poll
      timeoutRef.current = setTimeout(poll, nextInterval);
      
    } catch (error) {
      console.error("Polling error:", error);
      if (onError) {
        onError(error instanceof Error ? error : new Error("Polling failed"));
      }
      // Retry after max interval on error
      timeoutRef.current = setTimeout(poll, MAX_POLL_INTERVAL);
    }
  }, [jobId, onComplete, onError, stopPolling]);

  const startPolling = useCallback(() => {
    if (!jobId) return;

    stopPolling();
    setIsLoading(true);
    isPollingRef.current = true;
    lastPollTimeRef.current = 0;
    
    // Start polling
    poll();
  }, [jobId, stopPolling, poll]);

  useEffect(() => {
    if (jobId) {
      startPolling();
    } else {
      stopPolling();
      setProgress(null);
      setIsLoading(false);
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
