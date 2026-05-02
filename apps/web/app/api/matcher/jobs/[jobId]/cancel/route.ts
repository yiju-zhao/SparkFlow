/**
 * Cancel a running match job.
 *
 * Distinct from `DELETE /api/matcher/jobs/[jobId]`, which wipes the row
 * from history. Cancel forwards the request to workflows-api so its
 * in-memory status flips to CANCELLED (best-effort — the LOTUS rank
 * thread can't actually be interrupted, but the in-memory flag prevents
 * any further status callbacks from clobbering Postgres) and then
 * updates the Postgres row to CANCELLED. The row stays for history.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const WORKFLOWS_API_URL = process.env.NEXT_PUBLIC_WORKFLOWS_API_URL || "http://localhost:2027";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = await params;

    const job = await prisma.matchJob.findFirst({
      where: { id: jobId, userId: session.user.id },
      select: { status: true },
    });
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }
    if (job.status === "COMPLETED" || job.status === "CANCELLED" || job.status === "FAILED") {
      return NextResponse.json(
        { error: `Job already in terminal state: ${job.status}` },
        { status: 400 },
      );
    }

    // Forward to workflows-api. Best-effort: a 404 means workflows-api
    // already lost the in-memory job (orphan), but the Postgres row
    // still needs flipping so the single-flight guard releases.
    try {
      await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}`, {
        method: "DELETE",
      });
    } catch (err) {
      console.warn("[Matcher Cancel] workflows-api forward failed:", err);
    }

    const updated = await prisma.matchJob.update({
      where: { id: jobId },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
      include: {
        instance: {
          select: { name: true, venue: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Cancel job error:", error);
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
}
