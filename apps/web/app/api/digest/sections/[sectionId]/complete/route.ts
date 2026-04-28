/**
 * POST /api/digest/sections/[sectionId]/complete
 *
 * Internal callback endpoint — called by the Python workflow when a
 * DigestSection finishes generating.  Protected by a shared-secret header
 * (X-Internal-Token) NOT by NextAuth.
 *
 * Fail-closed: if INTERNAL_CALLBACK_TOKEN is empty/undefined, returns 500.
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import type { DigestItem } from "@/lib/types/digest";
import { DigestStatus } from "@prisma/client";

interface RouteParams {
  params: Promise<{ sectionId: string }>;
}

interface CompleteBody {
  status: "COMPLETED" | "EMPTY" | "FAILED";
  items?: DigestItem[];
  model_used?: string;
  error?: string;
  candidate_pool?: number;
  completed_at?: string;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  // ── Shared-secret auth (no NextAuth) ──────────────────────────────────────
  const token = process.env.INTERNAL_CALLBACK_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "INTERNAL_CALLBACK_TOKEN not configured" }, { status: 500 });
  }

  const incomingToken = request.headers.get("x-internal-token") ?? "";
  if (incomingToken !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: CompleteBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { status, items, model_used, error, candidate_pool, completed_at } = body;

  // Validate status
  const allowedStatuses: DigestStatus[] = [
    DigestStatus.COMPLETED,
    DigestStatus.EMPTY,
    DigestStatus.FAILED,
  ];
  if (!allowedStatuses.includes(status as DigestStatus)) {
    return NextResponse.json({ error: `Invalid status value: "${status}"` }, { status: 400 });
  }

  // Parse completedAt
  let completedAt: Date;
  if (completed_at) {
    completedAt = new Date(completed_at);
    if (isNaN(completedAt.getTime())) {
      completedAt = new Date();
    }
  } else {
    completedAt = new Date();
  }

  const { sectionId } = await params;

  // ── Update DigestSection ──────────────────────────────────────────────────
  try {
    await prisma.digestSection.update({
      where: { id: sectionId },
      data: {
        status: status as DigestStatus,
        items: (items ?? []) as object[],
        modelUsed: model_used ?? null,
        error: error ?? null,
        candidatePool: candidate_pool ?? 0,
        completedAt,
      },
    });
  } catch (err) {
    console.error(`[digest/complete] Failed to update section ${sectionId}:`, err);
    return NextResponse.json({ error: "Failed to update section" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
