/**
 * Sessions Data API Route
 *
 * Returns conference sessions for an instance for the matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: instanceId } = await params;

    const sessions = await prisma.conferenceSession.findMany({
      where: { instanceId },
      select: {
        id: true,
        title: true,
        date: true,
        startTime: true,
        endTime: true,
        location: true,
        speaker: true,
        abstract: true,
        type: true,
      },
      orderBy: { date: "asc" },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Get sessions error:", error);
    return NextResponse.json(
      { error: "Failed to get sessions" },
      { status: 500 }
    );
  }
}
