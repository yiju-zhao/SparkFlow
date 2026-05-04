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

// Server-side only: prefer WORKFLOWS_API_URL, fall back to the public
// form for backwards-compat. See app/api/matcher/jobs/route.ts.
const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ||
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

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

    // Terminal-status race guard: between the read at line 35 and this
    // write, the workflows-api callback can flip the row to COMPLETED
    // (and trigger Excel-to-disk). Without `updateMany` + status filter
    // we'd un-complete a finished job, nuke completedAt, and orphan the
    // on-disk Excel. The filtered update is a no-op if the row already
    // settled — we then re-read and return whatever it landed on.
    const result = await prisma.matchJob.updateMany({
      where: {
        id: jobId,
        userId: session.user.id,
        status: { in: ["PENDING", "PROCESSING"] },
      },
      data: {
        status: "CANCELLED",
        completedAt: new Date(),
      },
    });

    const fresh = await prisma.matchJob.findUnique({
      where: { id: jobId },
      include: {
        instance: {
          select: { name: true, venue: { select: { name: true } } },
        },
      },
    });

    if (!fresh) {
      // Row was deleted out from under us between the check and the
      // update. Vanishingly rare but cheap to handle.
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    if (result.count === 0) {
      // The row was already terminal when we tried to flip it. Surface
      // what it actually became so the client transitions cleanly.
      console.log(
        `[Matcher Cancel] job ${jobId} settled to ${fresh.status} before cancel could land`,
      );
    }

    return NextResponse.json(fresh);
  } catch (error) {
    console.error("Cancel job error:", error);
    return NextResponse.json({ error: "Failed to cancel job" }, { status: 500 });
  }
}
