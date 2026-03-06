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
  
  // Use refs to track connection state
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentJobIdRef = useRef<string | null>(null);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      disconnect();
      setProgress(null);
      setIsLoading(false);
      currentJobIdRef.current = null;
      return;
    }

    // Don't reconnect if already connected to same job
    if (currentJobIdRef.current === jobId && eventSourceRef.current) {
      return;
    }

    // Disconnect any existing connection
    disconnect();
    
    // Connect to new job
    currentJobIdRef.current = jobId;
    setIsLoading(true);

    console.log("[Matcher] Connecting to SSE for job:", jobId);

    const eventSource = matcherClient.subscribeToJobProgress(
      jobId,
      (data: JobProgress) => {
        console.log("[Matcher] SSE progress update:", data);
        setProgress(data);
        setIsConnected(true);
        
        // Handle completion
        if (data.status === "COMPLETED") {
          console.log("[Matcher] Job completed, fetching full job details...");
          setIsLoading(false);
          if (onComplete) {
            // Fetch full job details
            matcherClient.getJob(jobId)
              .then((fullJob) => {
                console.log("[Matcher] Full job details:", fullJob);
                onComplete(fullJob);
              })
              .catch((err) => {
                console.error("[Matcher] Failed to fetch full job:", err);
              });
          }
        } else if (data.status === "FAILED") {
          setIsLoading(false);
          if (onError) {
            onError(new Error(data.errorMessage || "Job failed"));
          }
        } else if (data.status === "CANCELLED") {
          setIsLoading(false);
        }
      },
      (error) => {
        console.error("[Matcher] SSE error:", error);
        setIsConnected(false);
        setIsLoading(false);
        if (onError) {
          onError(error);
        }
      },
    );

    eventSourceRef.current = eventSource;

    return () => {
      disconnect();
    };
  }, [jobId, disconnect, onComplete, onError]);

  return {
    progress,
    isLoading,
    isConnected,
    disconnect,
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
      console.log("[Matcher] Creating job with input:", input);
      const newJob = await matcherClient.createJob(input);
      console.log("[Matcher] Job created:", newJob);
      setJob(newJob);
      return newJob;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create job";
      console.error("[Matcher] Failed to create job:", message);
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
