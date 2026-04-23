/**
 * GET /api/digest?date=YYYY-MM-DD
 *
 * Returns the authenticated user's DailyDigest (with sections) for the
 * given date (defaults to today UTC).  Returns 404 if none found.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

/** Parse YYYY-MM-DD → UTC midnight Date, or null. */
function parseDateParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Today in UTC as YYYY-MM-DD. */
function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Parse date param ──────────────────────────────────────────────────────
  const { searchParams } = new URL(request.url);
  const rawDate = searchParams.get("date") ?? todayUtc();

  const digestDate = parseDateParam(rawDate);
  if (!digestDate) {
    return NextResponse.json(
      { error: `Invalid date format: "${rawDate}". Expected YYYY-MM-DD.` },
      { status: 400 },
    );
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  const digest = await prisma.dailyDigest.findUnique({
    where: { userId_digestDate: { userId, digestDate } },
    include: { sections: true },
  });

  if (!digest) {
    return NextResponse.json(
      { error: `No digest found for date ${rawDate}.` },
      { status: 404 },
    );
  }

  // ── Serialize ─────────────────────────────────────────────────────────────
  return NextResponse.json({
    id: digest.id,
    userId: digest.userId,
    digestDate: digest.digestDate.toISOString().slice(0, 10),
    generatedAt: digest.generatedAt.toISOString(),
    sections: digest.sections.map((s) => ({
      id: s.id,
      digestId: s.digestId,
      sourceType: s.sourceType,
      status: s.status,
      items: s.items,
      candidatePool: s.candidatePool,
      modelUsed: s.modelUsed,
      error: s.error,
      startedAt: s.startedAt.toISOString(),
      completedAt: s.completedAt?.toISOString() ?? null,
    })),
  });
}
