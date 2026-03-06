/**
 * Matcher Hooks
 *
 * React hooks for matcher functionality.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { matcherClient } from "./client";
import type { JobProgress, MatchJob, MatchJobStatus } from "./types";

// Global registry to prevent duplicate SSE connections
const activeConnections = new Map<string, EventSource>();

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
  
  // Track if this hook instance initiated the connection
  const initiatedRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!jobId) {
      setProgress(null);
      setIsLoading(false);
      setIsConnected(false);
      initiatedRef.current = false;
      return;
    }

    // Check if there's already an active connection for this job
    const existingConnection = activeConnections.get(jobId);
    if (existingConnection) {
      console.log("[Matcher] Reusing existing SSE connection for job:", jobId);
      setIsConnected(true);
      setIsLoading(true);
      initiatedRef.current = false;
      return;
    }

    // Prevent double connection in StrictMode
    if (initiatedRef.current) {
      return;
    }
    initiatedRef.current = true;

    console.log("[Matcher] Creating new SSE connection for job:", jobId);
    setIsLoading(true);

    const eventSource = matcherClient.subscribeToJobProgress(
      jobId,
      (data: JobProgress) => {
        if (!mountedRef.current) return;
        
        console.log("[Matcher] SSE progress:", data.status, data.progress + "%");
        setProgress(data);
        setIsConnected(true);
        
        // Handle completion
        if (data.status === "COMPLETED") {
          console.log("[Matcher] Job completed");
          setIsLoading(false);
          
          // Clean up connection
          activeConnections.delete(jobId);
          
          if (onComplete && mountedRef.current) {
            matcherClient.getJob(jobId)
              .then((fullJob) => {
                if (mountedRef.current) {
                  console.log("[Matcher] Got full job:", fullJob.status, fullJob.matchCount, "matches");
                  onComplete(fullJob);
                }
              })
              .catch((err) => {
                console.error("[Matcher] Failed to fetch full job:", err);
              });
          }
        } else if (data.status === "FAILED") {
          setIsLoading(false);
          activeConnections.delete(jobId);
          if (onError && mountedRef.current) {
            onError(new Error(data.errorMessage || "Job failed"));
          }
        } else if (data.status === "CANCELLED") {
          setIsLoading(false);
          activeConnections.delete(jobId);
        }
      },
      (error) => {
        console.error("[Matcher] SSE error:", error);
        if (!mountedRef.current) return;
        
        setIsConnected(false);
        setIsLoading(false);
        activeConnections.delete(jobId);
        
        if (onError) {
          onError(error);
        }
      },
    );

    // Register the connection
    activeConnections.set(jobId, eventSource);

    return () => {
      // Only close if this hook initiated the connection
      if (initiatedRef.current && activeConnections.get(jobId) === eventSource) {
        console.log("[Matcher] Closing SSE connection for job:", jobId);
        eventSource.close();
        activeConnections.delete(jobId);
      }
      initiatedRef.current = false;
    };
  }, [jobId, onComplete, onError]);

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
      console.log("[Matcher] Creating job...");
      const newJob = await matcherClient.createJob(input);
      console.log("[Matcher] Job created:", newJob.id);
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
