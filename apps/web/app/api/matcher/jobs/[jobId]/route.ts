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
              resultFileKey: progressData.result_file_key ?? job.resultFileKey,
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

    // Delete S3 files (matcher uses "sparkflow" bucket, not the images bucket)
    const { S3Client, DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    const matcherS3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9002",
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "minioadmin",
        secretAccessKey: process.env.S3_SECRET_KEY || "minioadmin",
      },
      forcePathStyle: true,
    });
    const matcherBucket = process.env.S3_BUCKET || "sparkflow";

    const keysToDelete = [job.queryFileKey, job.resultFileKey].filter(Boolean);
    for (const key of keysToDelete) {
      try {
        await matcherS3.send(
          new DeleteObjectCommand({ Bucket: matcherBucket, Key: key! }),
        );
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
