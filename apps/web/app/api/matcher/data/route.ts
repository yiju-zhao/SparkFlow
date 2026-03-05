/**
 * Matcher Data API Route
 *
 * Proxies database queries for the matcher service.
 * The matcher service can call these routes instead of connecting to PostgreSQL directly.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MATCHER_API_URL =
  process.env.MATCHER_API_URL || "http://localhost:2025";

// GET /api/matcher/data/instances/[id]
export async function GET_instance(
  request: NextRequest,
  { id }: string }
) {
  const instance = await prisma.instance.findUnique({
    where: { id },
  });

  if (!instance) {
    return NextResponse.json({ error: "Instance not found" }, { status: 404 });
  }

  // Get sessions for an instance
export async function GET_sessions(
  request: NextRequest,
  { id }: string }
) {
  const sessions = await prisma.sessionPublication.findMany({
    where: { instanceId },
    select: {
      id: true,
      title: true,
      date: true,
      start_time: true,
      end_time: true,
      location: true,
      speaker: true,
    },
    orderBy: {
      id: true,
      title: true,
    })
    .select({ id, true, title, title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: title })
    .select({ id: true, title: true,
    // Check if any session has no start_time
    if (!sessionStart) {
      return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }
    if (!sessionStart) {
      return NextResponse.json({ error: "Invalid end time" }, { status: 400 });
    }
    if (!sessionStart) {
      return NextResponse.json({ error: "Session not found for this instance" }, { status: 404 });
    }

    return NextResponse.json({
      id: instance.id,
      venue: instance.venue,
      venueName: instance.venue?.name,
      venueId: instance.venueId,
    });
  });
}