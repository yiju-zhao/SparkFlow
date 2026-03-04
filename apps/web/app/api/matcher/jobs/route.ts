/**
 * Matcher Jobs API Route
 *
 * Proxies job creation and listing to the matcher service.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const MATCHER_API_URL =
  process.env.MATCHER_API_URL || "http://localhost:2025";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();

    // Ensure userId matches session
    const payload = {
      ...body,
      user_id: session.user.id,
    };

    const response = await fetch(`${MATCHER_API_URL}/api/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Unknown error" }));
      return NextResponse.json(
        { error: error.detail || "Failed to create job" },
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

    // Get jobs for the current user
    const { searchParams } = new URL(request.url);
    const instanceId = searchParams.get("instanceId");

    // For now, we'll just proxy to the matcher service
    // In a full implementation, we'd filter by userId
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
