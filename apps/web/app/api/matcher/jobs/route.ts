/**
 * Matcher Jobs API Route
 *
 * Fetches target data from database and sends everything to matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MATCHER_API_URL =
  process.env.MATCHER_API_URL || "http://localhost:2025";

// Convert camelCase to snake_case for matcher service
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function transformToSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    if (Array.isArray(value)) {
      result[snakeKey] = value.map(item =>
        typeof item === "object" && item !== null
          ? transformToSnakeCase(item as Record<string, unknown>)
          : item
      );
    } else if (typeof value === "object" && value !== null) {
      result[snakeKey] = transformToSnakeCase(value as Record<string, unknown>);
    } else {
      result[snakeKey] = value;
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { instanceId, targetType, queries, topK, searchK, includeReasons } = body;

    console.log("[Matcher Jobs] Request:", { instanceId, targetType, queryCount: queries?.length });

    // Fetch target data from database
    let targetData: Record<string, unknown>[] = [];
    
    if (targetType === "SESSION") {
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
          overview: true,
          type: true,
        },
      });
      targetData = sessions as Record<string, unknown>[];
      console.log("[Matcher Jobs] Found", sessions.length, "sessions for instance", instanceId);
    } else {
      const publications = await prisma.publication.findMany({
        where: { instanceId },
        select: {
          id: true,
          title: true,
          abstract: true,
          authors: true,
          keywords: true,
        },
      });
      targetData = publications as Record<string, unknown>[];
      console.log("[Matcher Jobs] Found", publications.length, "publications for instance", instanceId);
    }

    if (targetData.length === 0) {
      return NextResponse.json(
        { error: `No ${targetType === "SESSION" ? "sessions" : "publications"} found for this instance` },
        { status: 400 },
      );
    }

    // Build payload with all data
    const payload = {
      ...transformToSnakeCase({
        instanceId,
        targetType,
        queries,
        topK,
        searchK,
        includeReasons,
        targetData,
      }),
      user_id: session.user.id,
    };

    console.log("[Matcher Jobs] Sending to matcher:", queries?.length, "queries,", targetData.length, "target items");

    const response = await fetch(`${MATCHER_API_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      console.error("[Matcher Jobs] Error response:", error);
      return NextResponse.json(
        { error: error.detail || error.error || "Failed to create job" },
        { status: response.status },
      );
    }

    const job = await response.json();
    return NextResponse.json(job);
  } catch (error) {
    console.error("Create job error:", error);
    return NextResponse.json(
      { error: "Failed to create job" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get("instanceId");

    const response = await fetch(
      `${MATCHER_API_URL}/api/jobs?userId=${session.user.id}${instanceId ? `&instanceId=${instanceId}` : ""}`,
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch jobs" },
        { status: response.status },
      );
    }

    const jobs = await response.json();
    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Get jobs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch jobs" },
      { status: 500 },
    );
  }
}
