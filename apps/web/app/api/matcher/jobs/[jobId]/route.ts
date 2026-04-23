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

const WORKFLOWS_API_URL =
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

const DATA_DIR = path.join(process.cwd(), "data");

function normalizeMatcherQueryData(queryData: unknown) {
  if (!Array.isArray(queryData)) {
    return undefined;
  }

  return queryData.map((item) => {
    const record = (item ?? {}) as Record<string, unknown>;
    const rawFocuses = record.optimization_focuses ?? record.optimizationFocuses;
    const optimizationFocuses = Array.isArray(rawFocuses)
      ? rawFocuses.filter((focus): focus is string => typeof focus === "string" && focus.length > 0)
      : [];

    return {
      id: typeof record.id === "string" ? record.id : "",
      bu: typeof record.bu === "string" ? record.bu : "",
      query: typeof record.query === "string" ? record.query : "",
      rowIndex:
        typeof record.rowIndex === "number"
          ? record.rowIndex
          : typeof record.row_index === "number"
            ? record.row_index
            : 0,
      optimizedQueryNative:
        typeof record.optimizedQueryNative === "string"
          ? record.optimizedQueryNative
          : typeof record.optimized_query_native === "string"
            ? record.optimized_query_native
            : undefined,
      optimizedQueryEn:
        typeof record.optimizedQueryEn === "string"
          ? record.optimizedQueryEn
          : typeof record.optimized_query_en === "string"
            ? record.optimized_query_en
            : undefined,
      optimizationFocuses,
      optimizerUsedLlm:
        typeof record.optimizerUsedLlm === "boolean"
          ? record.optimizerUsedLlm
          : typeof record.optimizer_used_llm === "boolean"
            ? record.optimizer_used_llm
            : undefined,
    };
  });
}

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
          const normalizedQueryData = normalizeMatcherQueryData(matcherJob.query_data);

          // Update database with latest progress
          const isStarting =
            job.status === "PENDING" && matcherJob.status && matcherJob.status !== "PENDING";
          const updatedJob = await prisma.matchJob.update({
            where: { id: jobId },
            data: {
              progress: matcherJob.progress ?? job.progress,
              status: matcherJob.status ?? job.status,
              matchCount: matcherJob.match_count ?? job.matchCount,
              errorMessage: matcherJob.error_message ?? job.errorMessage,
              queryData: normalizedQueryData ?? job.queryData ?? undefined,
              startedAt: isStarting ? new Date() : job.startedAt,
              completedAt: matcherJob.status === "COMPLETED" ? new Date() : job.completedAt,
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
          if (matcherJob.status === "COMPLETED" && !updatedJob.resultFileKey) {
            try {
              const dlRes = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/download`);
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
      select: { queryFileKey: true, resultFileKey: true },
    });

    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    // Delete local files
    const keysToDelete = [job.queryFileKey, job.resultFileKey].filter(Boolean);
    for (const key of keysToDelete) {
      try {
        await unlink(path.join(DATA_DIR, key!));
      } catch (fsErr) {
        console.error(`[Matcher] Failed to delete file ${key}:`, fsErr);
        // Continue deleting other files and DB record
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
