/**
 * Matcher Service API Client
 *
 * Client for communicating with the matcher service.
 */

import type {
  CreateMatchJobInput,
  JobProgress,
  MatchJob,
} from "./types";

const MATCHER_API_URL =
  process.env.NEXT_PUBLIC_MATCHER_API_URL || "http://localhost:2025";

class MatcherClient {
  private baseUrl: string;

  constructor(baseUrl: string = MATCHER_API_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Create a new match job
   * Routes through Next.js API to get userId from session
   */
  async createJob(input: CreateMatchJobInput): Promise<MatchJob> {
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
   * Get full job details
   */
  async getJob(jobId: string): Promise<MatchJob> {
    const response = await fetch(`/api/matcher/jobs/${jobId}`);

    if (!response.ok) {
      throw new Error("Failed to get job");
    }

    return response.json();
  }

  /**
   * Subscribe to job progress updates via SSE
   * Routes through Next.js API to avoid CORS issues
   */
  subscribeToJobProgress(
    jobId: string,
    onProgress: (progress: JobProgress) => void,
    onError?: (error: Error) => void,
  ): EventSource {
    // Use Next.js proxy route
    const url = `/api/matcher/jobs/${jobId}/stream`;
    const eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log("[MatcherClient] SSE connection opened");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onProgress(data);
      } catch (e) {
        console.error("[MatcherClient] Failed to parse SSE data:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("[MatcherClient] SSE error:", e);
      if (onError) {
        onError(new Error("SSE connection error"));
      }
    };

    return eventSource;
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(`/api/matcher/jobs/${jobId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to cancel job");
    }
  }

  /**
   * Get download URL for result file
   */
  getDownloadUrl(jobId: string): string {
    return `/api/matcher/jobs/${jobId}/download`;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const matcherClient = new MatcherClient();
export { MatcherClient };
