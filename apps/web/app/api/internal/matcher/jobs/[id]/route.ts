/**
 * POST /api/internal/matcher/jobs/[id]
 *
 * Internal callback endpoint — called by the workflows-api whenever a
 * MatchJob's status flips. Protected by a shared-secret bearer token
 * (INTERNAL_CALLBACK_TOKEN) NOT NextAuth.
 *
 * Body is snake_case to match the workflows-api convention; coerced to
 * camelCase before writing to Prisma.
 *
 * Idempotent: if the row's current status is already terminal
 * (COMPLETED | FAILED | CANCELLED) a callback that would un-terminate it
 * is ignored — guards against an out-of-order callback re-opening a job.
 *
 * Fail-closed: if INTERNAL_CALLBACK_TOKEN is empty/undefined, returns 500.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { MatchJobStatus, Prisma } from "@prisma/client";

interface RouteParams {
  params: Promise<{ id: string }>;
}

interface CallbackBody {
  status?: string;
  progress?: number;
  error_message?: string | null;
  match_count?: number;
  started_at?: string;
  completed_at?: string;
}

const TERMINAL_STATUSES: ReadonlySet<MatchJobStatus> = new Set([
  MatchJobStatus.COMPLETED,
  MatchJobStatus.FAILED,
  MatchJobStatus.CANCELLED,
]);

const ALL_STATUSES: ReadonlySet<MatchJobStatus> = new Set([
  MatchJobStatus.PENDING,
  MatchJobStatus.PROCESSING,
  MatchJobStatus.COMPLETED,
  MatchJobStatus.FAILED,
  MatchJobStatus.CANCELLED,
]);

function isMatchJobStatus(value: unknown): value is MatchJobStatus {
  return typeof value === "string" && ALL_STATUSES.has(value as MatchJobStatus);
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function checkAuth(request: NextRequest): NextResponse | null {
  const token = process.env.INTERNAL_CALLBACK_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "INTERNAL_CALLBACK_TOKEN not configured" }, { status: 500 });
  }

  // Accept either `Authorization: Bearer <token>` (the new spec) or
  // `X-Internal-Token: <token>` (existing convention, for compat).
  const authHeader = request.headers.get("authorization") ?? "";
  const bearerToken = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice("bearer ".length).trim()
    : "";
  const xInternalToken = request.headers.get("x-internal-token") ?? "";

  if (bearerToken !== token && xInternalToken !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const authError = checkAuth(request);
  if (authError) return authError;

  let body: CallbackBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { id } = await params;

  // Coerce snake_case → camelCase, validate fields.
  const data: Prisma.MatchJobUpdateInput = {};

  if (body.status !== undefined) {
    if (!isMatchJobStatus(body.status)) {
      return NextResponse.json(
        { error: `Invalid status value: "${body.status}"` },
        { status: 400 },
      );
    }
    data.status = body.status;
  }

  if (body.progress !== undefined) {
    if (typeof body.progress !== "number" || !Number.isFinite(body.progress)) {
      return NextResponse.json({ error: "Invalid progress value" }, { status: 400 });
    }
    data.progress = body.progress;
  }

  if (body.match_count !== undefined) {
    if (typeof body.match_count !== "number" || !Number.isFinite(body.match_count)) {
      return NextResponse.json({ error: "Invalid match_count value" }, { status: 400 });
    }
    data.matchCount = body.match_count;
  }

  if (body.error_message !== undefined) {
    data.errorMessage = body.error_message;
  }

  const startedAt = parseDate(body.started_at);
  if (startedAt) data.startedAt = startedAt;

  const completedAt = parseDate(body.completed_at);
  if (completedAt) data.completedAt = completedAt;

  // Idempotency: if the current row is already in a terminal state and the
  // incoming status would un-terminate it (back to PENDING/PROCESSING), drop
  // the update silently. Out-of-order callback after the row already settled.
  try {
    const current = await prisma.matchJob.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Match job not found" }, { status: 404 });
    }
    if (TERMINAL_STATUSES.has(current.status)) {
      const incomingStatus = data.status as MatchJobStatus | undefined;
      if (incomingStatus && !TERMINAL_STATUSES.has(incomingStatus)) {
        return NextResponse.json({ ok: true, ignored: "already terminal" });
      }
    }

    await prisma.matchJob.update({ where: { id }, data });
  } catch (err) {
    console.error(`[matcher/internal] Failed to update job ${id}:`, err);
    return NextResponse.json({ error: "Failed to update match job" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
