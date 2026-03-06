/**
 * Single Job API Route
 *
 * Reads job from database, syncs progress from matcher service if processing.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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

    // First fetch from database to verify ownership
    const job = await prisma.matchJob.findFirst({
      where: {
        id: jobId,
        userId: session.user.id,
      },
      include: {
        instance: {
          select: {
            name: true,
            venue: { select: { name: true } },
          },
        },
      },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // If job is PROCESSING, sync progress from matcher service
    if (job.status === "PROCESSING") {
      try {
        const response = await fetch(`${MATCHER_API_URL}/api/jobs/${jobId}/progress`);
        if (response.ok) {
          const progressData = await response.json();

          // Update database with latest progress
          const updatedJob = await prisma.matchJob.update({
            where: { id: jobId },
            data: {
              progress: progressData.progress ?? job.progress,
              status: progressData.status ?? job.status,
              matchCount: progressData.match_count ?? job.matchCount,
              errorMessage: progressData.error_message ?? job.errorMessage,
              completedAt: progressData.status === "COMPLETED" ? new Date() : job.completedAt,
            },
            include: {
              instance: {
                select: {
                  name: true,
                  venue: { select: { name: true } },
                },
              },
            },
          });

          return NextResponse.json(updatedJob);
        }
      } catch (syncError) {
        console.error("[Matcher Jobs] Failed to sync progress:", syncError);
        // Return database record if sync fails
      }
    }

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
