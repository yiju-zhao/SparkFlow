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

// Server-side only: prefer WORKFLOWS_API_URL, fall back to the public
// form for backwards-compat. See app/api/matcher/jobs/route.ts.
const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ||
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Re-read a job by id with the standard `instance.venue` include shape.
 * Used after every `updateMany` (terminal-aware writes) to return the
 * latest persisted row to the caller.
 */
async function reloadJobWithInstance(jobId: string) {
  return prisma.matchJob.findUnique({
    where: { id: jobId },
    include: {
      instance: {
        select: { name: true, venue: { select: { name: true } } },
      },
    },
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

    // If job is not in a terminal state, sync progress from matcher service.
    //
    // EVERY write below is filtered on `status IN ('PENDING','PROCESSING')`
    // so a callback that races ahead and writes COMPLETED/CANCELLED/FAILED
    // can never be un-terminated by this sync. updateMany returns
    // count=0 in that case and we just return the latest row.
    if (job.status === "PENDING" || job.status === "PROCESSING") {
      try {
        const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}`);

        if (response.status === 404) {
          // Orphan: workflows-api restarted (or the in-memory store was
          // wiped) while Postgres still showed PENDING/PROCESSING. Flip
          // the row to FAILED so the single-flight guard releases and the
          // wizard renders a terminal state instead of spinning forever.
          await prisma.matchJob.updateMany({
            where: {
              id: jobId,
              userId: session.user.id,
              status: { in: ["PENDING", "PROCESSING"] },
            },
            data: {
              status: "FAILED",
              errorMessage: "Matcher service restarted; please retry this job.",
              completedAt: new Date(),
            },
          });
          const fresh = await reloadJobWithInstance(jobId);
          return NextResponse.json(fresh ?? job);
        }

        if (response.ok) {
          const matcherJob = await response.json();
          const decoded = fromWire(matcherJob as Record<string, unknown>);

          // Persist Excel BEFORE the row update so resultFileKey lands
          // in the same write — eliminates the previous two-write
          // sequence that allowed a window where status=COMPLETED but
          // file was missing. Failure here isn't fatal: the next sync
          // poll retries; the row still flips to COMPLETED with no key.
          let resultFileKey: string | undefined;
          if (decoded.status === "COMPLETED" && !job.resultFileKey) {
            try {
              // `consume=true` tells workflows-api to free its
              // in-memory Excel bytes after streaming us a copy. We
              // own the persistent disk copy from here on.
              const dlRes = await fetch(
                `${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/download?consume=true`,
              );
              if (dlRes.ok) {
                const buffer = Buffer.from(await dlRes.arrayBuffer());
                const fileKey = `match-results/${jobId}.xlsx`;
                const filePath = path.join(DATA_DIR, fileKey);
                await mkdir(path.dirname(filePath), { recursive: true });
                await writeFile(filePath, buffer);
                resultFileKey = fileKey;
              }
            } catch (storeError) {
              console.error("[Matcher Jobs] Failed to persist Excel:", storeError);
            }
          }

          const isStarting =
            job.status === "PENDING" && decoded.status && decoded.status !== "PENDING";

          await prisma.matchJob.updateMany({
            where: {
              id: jobId,
              userId: session.user.id,
              status: { in: ["PENDING", "PROCESSING"] },
            },
            data: {
              progress: decoded.progress ?? undefined,
              status: decoded.status ?? undefined,
              matchCount: decoded.matchCount ?? undefined,
              errorMessage: decoded.errorMessage ?? undefined,
              // Prisma Json column accepts plain JSON; ParsedQuery is plain JSON in practice.
              queryData: (decoded.queryData ?? undefined) as object | undefined,
              startedAt: isStarting ? new Date() : undefined,
              completedAt: decoded.status === "COMPLETED" ? new Date() : undefined,
              resultFileKey,
            },
          });
          const fresh = await reloadJobWithInstance(jobId);
          return NextResponse.json(fresh ?? job);
        }
      } catch (syncError) {
        console.error("[Matcher Jobs] Failed to sync progress:", syncError);
        // Stale-row recovery: if we can't reach workflows-api at all
        // AND the row hasn't been touched in a long time, treat it as
        // orphaned (workflows-api crashed mid-job, network partition,
        // etc). The 404 branch above only fires when workflows-api is
        // up but doesn't have the job; this branch covers "workflows-
        // api itself is unreachable for so long the job is dead."
        const STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 min
        if (Date.now() - job.updatedAt.getTime() > STALE_THRESHOLD_MS) {
          await prisma.matchJob.updateMany({
            where: {
              id: jobId,
              userId: session.user.id,
              status: { in: ["PENDING", "PROCESSING"] },
            },
            data: {
              status: "FAILED",
              errorMessage:
                "Matcher service was unreachable for 30+ minutes; this job has been marked failed.",
              completedAt: new Date(),
            },
          });
          const fresh = await reloadJobWithInstance(jobId);
          return NextResponse.json(fresh ?? job);
        }
        // Otherwise return the stale DB record; caller will retry.
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
