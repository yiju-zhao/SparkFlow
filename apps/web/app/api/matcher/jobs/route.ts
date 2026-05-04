/**
 * Matcher Jobs API Route
 *
 * Fetches target data from database and sends everything to matcher service.
 * Persists jobs to database for history tracking.
 */

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveApiKey } from "@/lib/services/api-key-resolver";
import { toWire } from "@/lib/matcher/wire";

// Server-side only: prefer WORKFLOWS_API_URL. Fall back to the
// `NEXT_PUBLIC_*` form for backwards-compat with older .env files, but
// the public form is only relevant for client bundles. New deployments
// should set WORKFLOWS_API_URL alone.
const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ||
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

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

    // Single-flight: at most one matcher job per user may be PENDING or
    // PROCESSING. Enforced by the partial unique index
    // `match_jobs_user_inflight_unique` (migration
    // 20260504000000_matchjob_one_inflight_per_user). The application-
    // level findFirst-then-create pattern was insufficient — two tabs
    // could both pass the check, both spawn LOTUS jobs, both burn BYOK
    // quota. The DB-level constraint closes that race.
    //
    // Order of operations:
    //   1. Generate the job id locally (we own it now, not workflows-api).
    //   2. Insert PENDING row — the unique index here is the gate.
    //   3. Dispatch to workflows-api with that id.
    //   4. If dispatch fails, delete the row to release the gate.
    //
    // Old order ("dispatch then create") meant a successful dispatch
    // followed by a failed Postgres insert orphaned a workflows-api
    // job with no DB row to track it.
    const jobId = randomUUID();

    let matchJob: Awaited<ReturnType<typeof prisma.matchJob.create>>;
    try {
      matchJob = await prisma.matchJob.create({
        data: {
          id: jobId,
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
    } catch (err) {
      // P2002 = unique constraint violation. Maps to either the partial
      // index (a job is already inflight for this user) or the row's
      // primary id (collision is astronomically unlikely with UUIDv4).
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const inflight = await prisma.matchJob.findFirst({
          where: {
            userId: session.user.id,
            status: { in: ["PENDING", "PROCESSING"] },
          },
          select: { id: true },
          orderBy: { createdAt: "desc" },
        });
        return NextResponse.json(
          {
            error:
              "You already have a matcher job running. Resume it before starting a new one.",
            inflightJobId: inflight?.id ?? null,
          },
          { status: 409 },
        );
      }
      throw err;
    }

    // Build payload with all data — translate Prisma-shaped → wire-shaped via lib/matcher/wire.
    const payload = toWire({
      jobId,
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

    console.log("[Matcher Jobs] Dispatching", jobId, "model:", modelProvider, modelName);

    let dispatchOk = false;
    try {
      const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      dispatchOk = response.ok;
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: "Unknown error" }));
        console.error("[Matcher Jobs] Dispatch error:", error);
      }
    } catch (err) {
      console.error("[Matcher Jobs] Dispatch threw:", err);
    }

    if (!dispatchOk) {
      // Release the single-flight gate so the user can retry.
      await prisma.matchJob.delete({ where: { id: jobId } }).catch((e) => {
        console.error("[Matcher Jobs] Failed to roll back PENDING row after dispatch failure:", e);
      });
      return NextResponse.json(
        { error: "Failed to dispatch job to matcher service" },
        { status: 502 },
      );
    }

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
    // `?status=inflight` returns only PENDING/PROCESSING. Used by the
    // matcher landing wizard to discover a server-side running job and
    // offer a resume banner when no `?jobId=` is in the URL.
    const statusFilter = searchParams.get("status");

    // Query jobs from database
    const jobs = await prisma.matchJob.findMany({
      where: {
        userId: session.user.id,
        ...(instanceId ? { instanceId } : {}),
        ...(statusFilter === "inflight" ? { status: { in: ["PENDING", "PROCESSING"] } } : {}),
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
