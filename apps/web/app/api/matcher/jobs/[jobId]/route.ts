/**
 * Single Job API Route
 *
 * Reads job from database, syncs progress from matcher service if processing.
 * On COMPLETED: downloads Excel from matcher and stores locally.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mkdir, writeFile, unlink } from "fs/promises";
import path from "path";
import { fromWire } from "@/lib/matcher/wire";

const WORKFLOWS_API_URL = process.env.NEXT_PUBLIC_WORKFLOWS_API_URL || "http://localhost:2027";

const DATA_DIR = path.join(process.cwd(), "data");

export async function GET(
  _request: NextRequest,
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
        const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}`);
        if (response.ok) {
          const matcherJob = await response.json();
          const decoded = fromWire(matcherJob as Record<string, unknown>);

          // Update database with latest progress
          const isStarting =
            job.status === "PENDING" && decoded.status && decoded.status !== "PENDING";
          const updatedJob = await prisma.matchJob.update({
            where: { id: jobId },
            data: {
              progress: decoded.progress ?? job.progress,
              status: decoded.status ?? job.status,
              matchCount: decoded.matchCount ?? job.matchCount,
              errorMessage: decoded.errorMessage ?? job.errorMessage,
              // Prisma Json column accepts plain JSON; ParsedQuery is plain JSON in practice.
              queryData: (decoded.queryData ?? job.queryData ?? undefined) as
                | object
                | undefined,
              startedAt: isStarting ? new Date() : job.startedAt,
              completedAt: decoded.status === "COMPLETED" ? new Date() : job.completedAt,
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

          // If job just completed, download Excel from matcher and store locally
          if (decoded.status === "COMPLETED" && !updatedJob.resultFileKey) {
            try {
              const dlRes = await fetch(
                `${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/download`,
              );
              if (dlRes.ok) {
                const buffer = Buffer.from(await dlRes.arrayBuffer());
                const fileKey = `match-results/${jobId}.xlsx`;
                const filePath = path.join(DATA_DIR, fileKey);
                await mkdir(path.dirname(filePath), { recursive: true });
                await writeFile(filePath, buffer);

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
            } catch (storeError) {
              console.error("[Matcher Jobs] Failed to persist Excel:", storeError);
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
    return NextResponse.json({ error: "Failed to get job" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
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
      select: { resultFileKey: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Fail closed: delete the result file FIRST and only delete the DB row if
    // the unlink succeeded. Previously this used to swallow FS errors and
    // delete the row anyway — that orphans the file on disk with no audit
    // trail (the row was the only handle back to it). We have no retry queue
    // for FS cleanup, so the simpler safe behaviour is to surface the failure.
    //
    // Query files no longer exist on disk — the wizard parses Excel
    // client-side and we never persisted uploads. Only resultFileKey matters.
    if (job.resultFileKey) {
      try {
        await unlink(path.join(DATA_DIR, job.resultFileKey));
      } catch (fsErr) {
        const code =
          fsErr && typeof fsErr === "object" && "code" in fsErr
            ? (fsErr as { code: unknown }).code
            : null;
        // ENOENT means the file is already gone — safe to proceed with DB
        // delete; nothing to orphan.
        if (code !== "ENOENT") {
          console.error(`[Matcher] Failed to delete file ${job.resultFileKey}:`, fsErr);
          return NextResponse.json(
            { error: "Failed to delete result file; job not deleted" },
            { status: 500 },
          );
        }
      }
    }

    // Delete DB record
    await prisma.matchJob.delete({ where: { id: jobId } });

    return NextResponse.json({ message: "Job deleted" });
  } catch (error) {
    console.error("Delete job error:", error);
    return NextResponse.json({ error: "Failed to delete job" }, { status: 500 });
  }
}
