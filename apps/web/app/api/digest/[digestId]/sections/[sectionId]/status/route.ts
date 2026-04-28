/**
 * GET /api/digest/[digestId]/sections/[sectionId]/status
 *
 * Returns the current status of a single DigestSection.
 * Auth-gated; verifies the digest belongs to the authenticated user.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { DigestSectionStatus } from "@/lib/types/digest";

interface RouteParams {
  params: Promise<{ digestId: string; sectionId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  const { digestId, sectionId } = await params;

  // ── Fetch digest + section, verify ownership ──────────────────────────────
  const digest = await prisma.dailyDigest.findUnique({
    where: { id: digestId },
    include: {
      sections: {
        where: { id: sectionId },
      },
    },
  });

  // Return 404 for not-found OR ownership mismatch (don't leak existence)
  if (!digest || digest.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const section = digest.sections[0];
  if (!section) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // ── Serialize as DigestSectionStatus ──────────────────────────────────────
  const body: DigestSectionStatus = {
    id: section.id,
    sourceType: section.sourceType,
    status: section.status,
    items: Array.isArray(section.items)
      ? (section.items as unknown as DigestSectionStatus["items"])
      : [],
    candidatePool: section.candidatePool,
    modelUsed: section.modelUsed,
    error: section.error,
    startedAt: section.startedAt.toISOString(),
    completedAt: section.completedAt?.toISOString() ?? null,
  };

  return NextResponse.json(body);
}
