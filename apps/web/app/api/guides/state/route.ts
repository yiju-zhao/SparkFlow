import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { GuideState } from "@/content/guides/types";

export async function GET(): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { tourCompletedAt: true, welcomePending: true, dismissedGuides: true },
  });

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    tourCompletedAt: user.tourCompletedAt ? user.tourCompletedAt.toISOString() : null,
    welcomePending: user.welcomePending,
    dismissedGuides: user.dismissedGuides,
  });
}

interface PatchBody {
  /** Skip / Finish — flips welcomePending off too so the modal won't return. */
  markTourCompleted?: boolean;
  /** Start — flips welcomePending off without marking the tour as completed. */
  dismissWelcome?: boolean;
  dismissGuideId?: string;
  undismissGuideId?: string;
  /** Replay — re-arms the welcome modal and clears tourCompletedAt. */
  resetTour?: boolean;
}

export async function PATCH(
  request: Request,
): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const current = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, tourCompletedAt: true, welcomePending: true, dismissedGuides: true },
  });
  if (!current) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const nextDismissed = new Set(current.dismissedGuides);
  if (body.dismissGuideId) nextDismissed.add(body.dismissGuideId);
  if (body.undismissGuideId) nextDismissed.delete(body.undismissGuideId);

  let nextTourCompleted = current.tourCompletedAt;
  let nextWelcomePending = current.welcomePending;
  if (body.resetTour) {
    nextTourCompleted = null;
    nextWelcomePending = true;
  } else if (body.markTourCompleted) {
    nextTourCompleted = new Date();
    nextWelcomePending = false;
  } else if (body.dismissWelcome) {
    nextWelcomePending = false;
  }

  const updated = await prisma.user.update({
    where: { id: current.id },
    data: {
      tourCompletedAt: nextTourCompleted,
      welcomePending: nextWelcomePending,
      dismissedGuides: Array.from(nextDismissed),
    },
    select: { tourCompletedAt: true, welcomePending: true, dismissedGuides: true },
  });

  return NextResponse.json({
    tourCompletedAt: updated.tourCompletedAt ? updated.tourCompletedAt.toISOString() : null,
    welcomePending: updated.welcomePending,
    dismissedGuides: updated.dismissedGuides,
  });
}
