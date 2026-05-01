/**
 * Matcher Jobs API Route
 *
 * Fetches target data from database and sends everything to matcher service.
 * Persists jobs to database for history tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveApiKey } from "@/lib/services/api-key-resolver";
import { toWire } from "@/lib/matcher/wire";

const WORKFLOWS_API_URL = process.env.NEXT_PUBLIC_WORKFLOWS_API_URL || "http://localhost:2027";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      instanceId,
      targetType,
      queries,
      topK = 50,
      searchK = 350,
      includeReasons = true,
    } = body;

    console.log("[Matcher Jobs] Config:", {
      instanceId,
      targetType,
      queryCount: queries?.length,
      topK,
      searchK,
      includeReasons,
    });

    // Fetch user's matcher model settings. BYOK is required (no env fallback).
    const userSettings = await prisma.userSettings.findUnique({
      where: { userId: session.user.id },
      select: {
        semopsModelProvider: true,
        semopsModelName: true,
      },
    });

    if (!userSettings?.semopsModelProvider || !userSettings.semopsModelName) {
      return NextResponse.json(
        {
          error:
            "Matcher model is not configured. Open Settings → Research Hub → SemOps model to pick one.",
        },
        { status: 400 },
      );
    }

    const modelProvider = userSettings.semopsModelProvider;
    const modelName = userSettings.semopsModelName;

    // Resolve the BYOK credential for this provider. resolveApiKey throws
    // if the user hasn't configured a key — surface that to the client.
    let apiKey: string;
    let apiBase: string | undefined;
    try {
      const resolved = await resolveApiKey(session.user.id, modelProvider);
      apiKey = resolved.apiKey;
      apiBase = resolved.baseUrl;
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : String(err) },
        { status: 400 },
      );
    }

    // Fetch target data from database
    let targetData: Record<string, unknown>[] = [];

    if (targetType === "SESSION") {
      const sessions = await prisma.conferenceSession.findMany({
        where: { instanceId },
        select: {
          id: true,
          title: true,
          type: true,
          date: true,
          startTime: true,
          endTime: true,
          location: true,
          speaker: true,
          abstract: true,
          overview: true,
          topic: true,
          affiliation: true,
          technology: true,
          sessionFormat: true,
          hasRecording: true,
          intendedAudience: true,
          sessionUrl: true,
        },
      });
      targetData = sessions as Record<string, unknown>[];
      console.log("[Matcher Jobs] Found", sessions.length, "sessions");
    } else {
      const publications = await prisma.publication.findMany({
        where: { instanceId },
        select: {
          id: true,
          title: true,
          authors: true,
          abstract: true,
          summary: true,
          affiliations: true,
          countries: true,
          keywords: true,
          researchTopic: true,
          rating: true,
          doi: true,
          pdfUrl: true,
          githubUrl: true,
          websiteUrl: true,
          status: true,
        },
      });
      targetData = publications as Record<string, unknown>[];
      console.log("[Matcher Jobs] Found", publications.length, "publications");
    }

    if (targetData.length === 0) {
      return NextResponse.json(
        { error: `No ${targetType === "SESSION" ? "sessions" : "publications"} found` },
        { status: 400 },
      );
    }

    // Build payload with all data — translate Prisma-shaped → wire-shaped via lib/matcher/wire.
    const payload = toWire({
      instanceId,
      targetType,
      queries: queries ?? [],
      topK,
      searchK,
      includeReasons,
      targetData,
      modelProvider,
      modelName,
      userId: session.user.id,
      apiKey,
      apiBase: apiBase ?? null,
    });

    console.log("[Matcher Jobs] Sending to matcher - model:", modelProvider, modelName);

    const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs`, {
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
    console.log("[Matcher Jobs] Job created:", job.id, "topK:", job.top_k);

    // Persist job to database
    const matchJob = await prisma.matchJob.create({
      data: {
        id: job.id, // Use the ID from matcher service
        userId: session.user.id,
        instanceId,
        targetType,
        topK,
        searchK,
        includeReasons,
        queryData: queries ?? undefined,
        status: "PENDING",
        queryCount: queries?.length || 0,
      },
      include: {
        instance: {
          select: { name: true, venue: { select: { name: true } } },
        },
      },
    });

    return NextResponse.json(matchJob);
  } catch (error) {
    console.error("Create job error:", error);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
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

    // Query jobs from database
    const jobs = await prisma.matchJob.findMany({
      where: {
        userId: session.user.id,
        ...(instanceId ? { instanceId } : {}),
      },
      include: {
        instance: {
          select: {
            name: true,
            venue: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(jobs);
  } catch (error) {
    console.error("Get jobs error:", error);
    return NextResponse.json({ error: "Failed to fetch jobs" }, { status: 500 });
  }
}
