/**
 * Matcher Service API Client
 *
 * Client for communicating with the matcher service.
 */

import type {
  CreateMatchJobInput,
  JobProgress,
  MatchJob,
  UploadResult,
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
   */
  async createJob(input: CreateMatchJobInput): Promise<MatchJob> {
    const response = await fetch(`${this.baseUrl}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      throw new Error(error.detail || "Failed to create job");
    }

    return response.json();
  }

  /**
   * Get full job details
   */
  async getJob(jobId: string): Promise<MatchJob> {
    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}`);

    if (!response.ok) {
      throw new Error("Failed to get job");
    }

    return response.json();
  }

  /**
   * Get job progress (lightweight polling)
   */
  async getJobProgress(jobId: string): Promise<JobProgress> {
    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}/progress`);

    if (!response.ok) {
      throw new Error("Failed to get job progress");
    }

    return response.json();
  }

  /**
   * Cancel a running job
   */
  async cancelJob(jobId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/jobs/${jobId}`, {
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
    return `${this.baseUrl}/api/jobs/${jobId}/download`;
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
