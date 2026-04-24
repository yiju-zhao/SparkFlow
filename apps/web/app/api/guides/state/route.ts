import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import type { GuideState } from "@/content/guides/types";

export async function GET(): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { tourCompletedAt: true, dismissedGuides: true },
  });

  if (!user) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  return NextResponse.json({
    tourCompletedAt: user.tourCompletedAt ? user.tourCompletedAt.toISOString() : null,
    dismissedGuides: user.dismissedGuides,
  });
}

interface PatchBody {
  markTourCompleted?: boolean;
  dismissGuideId?: string;
  undismissGuideId?: string;
  resetTour?: boolean;
}

export async function PATCH(request: Request): Promise<NextResponse<GuideState | { error: string }>> {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as PatchBody;

  const current = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, tourCompletedAt: true, dismissedGuides: true },
  });
  if (!current) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  const nextDismissed = new Set(current.dismissedGuides);
  if (body.dismissGuideId) nextDismissed.add(body.dismissGuideId);
  if (body.undismissGuideId) nextDismissed.delete(body.undismissGuideId);

  const updated = await prisma.user.update({
    where: { id: current.id },
    data: {
      tourCompletedAt: body.resetTour
        ? null
        : body.markTourCompleted
          ? new Date()
          : current.tourCompletedAt,
      dismissedGuides: Array.from(nextDismissed),
    },
    select: { tourCompletedAt: true, dismissedGuides: true },
  });

  return NextResponse.json({
    tourCompletedAt: updated.tourCompletedAt ? updated.tourCompletedAt.toISOString() : null,
    dismissedGuides: updated.dismissedGuides,
  });
}
