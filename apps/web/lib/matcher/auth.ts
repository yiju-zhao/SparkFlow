/**
 * Per-job authorization helper for the matcher API.
 *
 * Every per-job route (GET, DELETE, /cancel, /stream, /download) must
 * verify the requester owns the row before touching it. Centralized so
 * that adding a future per-job route can't accidentally skip the check.
 */

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type OwnedJobAuthSuccess<T> = {
  ok: true;
  userId: string;
  job: T;
};

export type OwnedJobAuthFailure = {
  ok: false;
  status: 401 | 404;
  error: string;
};

/**
 * Verify the request has a session AND the session user owns this job.
 *
 * Returns either a success with the (selected) job row or a failure
 * shape carrying the HTTP status to return. Callers do:
 *
 *   const result = await requireOwnedJob(jobId, { id: true, status: true });
 *   if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
 *   const { job, userId } = result;
 *
 * Returning a discriminated union (instead of throwing) keeps the
 * happy-path control flow obvious in the route handler.
 */
export async function requireOwnedJob<S extends Record<string, true>>(
  jobId: string,
  select: S,
): Promise<
  // We can't fully type the resulting job shape at the helper level
  // without dragging Prisma's generic GetPayload through; callers know
  // what fields they asked for, so we return `Record<string, unknown>`
  // and let them narrow. The shape IS what was selected — Prisma
  // returns exactly the requested fields.
  OwnedJobAuthSuccess<Record<string, unknown>> | OwnedJobAuthFailure
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const job = await prisma.matchJob.findFirst({
    where: { id: jobId, userId: session.user.id },
    select,
  });
  if (!job) {
    // 404 (not 403) by design — don't leak existence of jobs the
    // caller doesn't own. Same shape as not-found.
    return { ok: false, status: 404, error: "Job not found" };
  }
  return { ok: true, userId: session.user.id, job };
}
