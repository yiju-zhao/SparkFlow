/**
 * Job Results Download Route
 *
 * Verifies ownership via database, then proxies file download from matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MATCHER_API_URL =
  process.env.MATCHER_API_URL || "http://localhost:2025";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    // Verify user owns the job via database
    const job = await prisma.matchJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Check job is completed
    if (job.status !== "COMPLETED") {
      return NextResponse.json(
        { error: "Job is not completed yet" },
        { status: 400 },
      );
    }

    // Stream from matcher service
    const response = await fetch(`${MATCHER_API_URL}/api/jobs/${jobId}/download`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return NextResponse.json(
        { error: error.detail || "Failed to download results" },
        { status: response.status },
      );
    }

    // Stream the file back
    const headers = new Headers(response.headers);
    headers.set("Content-Disposition", `attachment; filename="match-results-${jobId}.xlsx"`);

    return new Response(response.body, {
      headers,
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download results" },
      { status: 500 },
    );
  }
}
