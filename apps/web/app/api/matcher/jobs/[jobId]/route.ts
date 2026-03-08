/**
 * Single Job API Route
 *
 * Reads job from database, syncs progress from matcher service if processing.
 * On COMPLETED: downloads Excel from matcher and uploads to S3.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { s3StorageClient } from "@/lib/s3-client";

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

    // If job is not in a terminal state, sync progress from matcher service
    if (job.status === "PENDING" || job.status === "PROCESSING") {
      try {
        const response = await fetch(`${MATCHER_API_URL}/api/jobs/${jobId}/progress`);
        if (response.ok) {
          const progressData = await response.json();

          // Update database with latest progress
          const isStarting = job.status === "PENDING" && progressData.status && progressData.status !== "PENDING";
          const updatedJob = await prisma.matchJob.update({
            where: { id: jobId },
            data: {
              progress: progressData.progress ?? job.progress,
              status: progressData.status ?? job.status,
              matchCount: progressData.match_count ?? job.matchCount,
              errorMessage: progressData.error_message ?? job.errorMessage,
              startedAt: isStarting ? new Date() : job.startedAt,
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

          // If job just completed, download Excel from matcher and upload to S3
          if (progressData.status === "COMPLETED" && !updatedJob.resultFileKey) {
            try {
              const dlRes = await fetch(`${MATCHER_API_URL}/api/jobs/${jobId}/download`);
              if (dlRes.ok) {
                const buffer = Buffer.from(await dlRes.arrayBuffer());
                const fileKey = `match-results/${jobId}.xlsx`;
                await s3StorageClient.uploadImage(
                  fileKey,
                  buffer,
                  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                );

                const finalJob = await prisma.matchJob.update({
                  where: { id: jobId },
                  data: { resultFileKey: fileKey },
                  include: {
                    instance: {
                      select: {
                        name: true,
                        venue: { select: { name: true } },
                      },
                    },
                  },
                });

                return NextResponse.json(finalJob);
              }
            } catch (s3Error) {
              console.error("[Matcher Jobs] Failed to persist Excel to S3:", s3Error);
              // Job is still COMPLETED, file can be retried on next poll
            }
          }

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

    // Verify ownership and get file keys
    const job = await prisma.matchJob.findFirst({
      where: { id: jobId, userId: session.user.id },
      select: { queryFileKey: true, resultFileKey: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Delete S3 files using shared s3StorageClient
    const keysToDelete = [job.queryFileKey, job.resultFileKey].filter(Boolean);
    for (const key of keysToDelete) {
      try {
        await s3StorageClient.deleteImage(key!);
      } catch (s3Err) {
        console.error(`[Matcher] Failed to delete S3 key ${key}:`, s3Err);
        // Continue deleting other files and DB record
      }
    }

    // Delete DB record
    await prisma.matchJob.delete({ where: { id: jobId } });

    return NextResponse.json({ message: "Job deleted" });
  } catch (error) {
    console.error("Delete job error:", error);
    return NextResponse.json(
      { error: "Failed to delete job" },
      { status: 500 },
    );
  }
}
