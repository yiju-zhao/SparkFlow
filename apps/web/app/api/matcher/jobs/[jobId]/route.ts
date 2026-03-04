/**
 * Single Job API Route
 *
 * Proxies job operations to the matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MATCHER_API_URL =
  process.env.MATCHER_API_URL || "http://localhost:2025";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    // Get progress (lightweight) or full job details
    const { searchParams } = new URL(request.url);
    const progressOnly = searchParams.get("progress") === "true";

    const endpoint = progressOnly
      ? `${MATCHER_API_URL}/api/jobs/${jobId}/progress`
      : `${MATCHER_API_URL}/api/jobs/${jobId}`;

    const response = await fetch(endpoint);

    if (!response.ok) {
      return NextResponse.json(
        { error: "Job not found" },
        { status: response.status },
      );
    }

    const job = await response.json();
    return NextResponse.json(job);
  } catch (error) {
    console.error("Get job error:", error);
    return NextResponse.json(
      { error: "Failed to get job" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    const response = await fetch(`${MATCHER_API_URL}/api/jobs/${jobId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return NextResponse.json(
        { error: error.detail || "Failed to cancel job" },
        { status: response.status },
      );
    }

    return NextResponse.json({ message: "Job cancelled" });
  } catch (error) {
    console.error("Cancel job error:", error);
    return NextResponse.json(
      { error: "Failed to cancel job" },
      { status: 500 },
    );
  }
}
