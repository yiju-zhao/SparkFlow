/**
 * POST /api/digest/generate
 *
 * Creates (or resumes) a DailyDigest for the authenticated user and
 * fires per-section generation workflows asynchronously.
 *
 * Returns 202 with { digestId, sections, conflicts? }.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { resolveApiKey } from "@/lib/services/api-key-resolver";
import type { DigestConfig } from "@/lib/types/digest";
import { DigestSourceType } from "@prisma/client";

const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ?? "http://localhost:2027";

const INTERNAL_CALLBACK_TOKEN = process.env.INTERNAL_CALLBACK_TOKEN ?? "";

/** Parse a YYYY-MM-DD string and return a UTC midnight Date, or null. */
function parseDateParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  return d;
}

/** Format a Date as YYYY-MM-DD (UTC). */
function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today in UTC as YYYY-MM-DD. */
function todayUtc(): string {
  return toDateString(new Date());
}

export async function POST(request: NextRequest) {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { date?: string; sources?: DigestSourceType[] } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — all fields are optional
  }

  const rawDate = body.date ?? todayUtc();
  const digestDate = parseDateParam(rawDate);
  if (!digestDate) {
    return NextResponse.json(
      { error: `Invalid date format: "${rawDate}". Expected YYYY-MM-DD.` },
      { status: 400 },
    );
  }

  // ── Load user settings ────────────────────────────────────────────────────
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId },
    select: {
      digestConfig: true,
      semopsModelProvider: true,
      semopsModelName: true,
    },
  });

  const digestConfig: DigestConfig =
    userSettings?.digestConfig &&
    typeof userSettings.digestConfig === "object" &&
    !Array.isArray(userSettings.digestConfig)
      ? (userSettings.digestConfig as unknown as DigestConfig)
      : { queries: [], sources: {} };

  // ── Validate queries ──────────────────────────────────────────────────────
  const enabledQueries = (digestConfig.queries ?? []).filter((q) => q.enabled);
  if (enabledQueries.length === 0) {
    return NextResponse.json(
      {
        error:
          "No enabled interest queries — configure at /settings#daily-digest",
      },
      { status: 400 },
    );
  }

  // ── Determine target source types ─────────────────────────────────────────
  // Default: all source types that have a truthy entry in digestConfig.sources.
  const configuredSources: DigestSourceType[] = [];
  if (digestConfig.sources?.wechat) {
    configuredSources.push(DigestSourceType.WECHAT);
  }

  let targetSources: DigestSourceType[];
  if (body.sources && body.sources.length > 0) {
    // Intersection of requested and configured
    targetSources = body.sources.filter((s) => configuredSources.includes(s));
  } else {
    targetSources = configuredSources;
  }

  if (targetSources.length === 0) {
    return NextResponse.json(
      { error: "No valid source types to generate for." },
      { status: 400 },
    );
  }

  // ── Resolve model + API key ─────────────────────────────────────────────
  // BYOK is required. Reject early if either the model hasn't been picked
  // or the user hasn't configured a key for it. Semops has no env fallback.
  if (!userSettings?.semopsModelProvider || !userSettings.semopsModelName) {
    return NextResponse.json(
      {
        error:
          "Digest model is not configured. Open Settings → Research Hub → SemOps model to pick one.",
      },
      { status: 400 },
    );
  }
  const modelProvider = userSettings.semopsModelProvider;
  const modelName = userSettings.semopsModelName;

  let resolvedApiKey: string;
  let resolvedApiBase: string | undefined;
  try {
    const resolved = await resolveApiKey(userId, modelProvider);
    resolvedApiKey = resolved.apiKey;
    resolvedApiBase = resolved.baseUrl;
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }

  // ── Transaction: upsert DailyDigest, create new DigestSections ───────────
  const conflicts: DigestSourceType[] = [];
  let digestId: string = "";
  const newSections: { id: string; sourceType: DigestSourceType; status: string }[] = [];

  await prisma.$transaction(async (tx) => {
    // Upsert the daily digest row
    const digest = await tx.dailyDigest.upsert({
      where: { userId_digestDate: { userId, digestDate } },
      create: { userId, digestDate },
      update: {},
      select: { id: true },
    });
    digestId = digest.id;

    // For each target source, check or create a DigestSection
    for (const sourceType of targetSources) {
      const existing = await tx.digestSection.findUnique({
        where: { digestId_sourceType: { digestId: digest.id, sourceType } },
        select: { id: true, status: true },
      });

      if (existing) {
        if (existing.status === "COMPLETED") {
          conflicts.push(sourceType);
        }
        // Non-completed existing section: skip creating a duplicate
        continue;
      }

      // Create a fresh section in GENERATING state
      const section = await tx.digestSection.create({
        data: {
          digestId: digest.id,
          sourceType,
          status: "GENERATING",
          items: [],
        },
        select: { id: true, sourceType: true, status: true },
      });

      newSections.push({
        id: section.id,
        sourceType: section.sourceType,
        status: section.status,
      });
    }
  });

  // ── Enqueue one ARQ job per new section ───────────────────────────────────
  const wechatConfig = digestConfig.sources?.wechat;
  const topN = wechatConfig?.topN ?? 5;
  const subscribedSourceIds = wechatConfig?.subscribedSourceIds ?? [];

  const enqueued: Array<{
    sectionId: string;
    sourceType: DigestSourceType;
    jobId: string | null;
  }> = [];
  const enqueueErrors: Array<{
    sectionId: string;
    sourceType: DigestSourceType;
    status: number;
    detail: string;
  }> = [];

  for (const section of newSections) {
    const agentPayload = {
      section_id: section.id,
      source_type: section.sourceType,
      digest_date: toDateString(digestDate),
      queries: enabledQueries,
      subscribed_source_ids: subscribedSourceIds,
      top_n: topN,
      model_provider: modelProvider,
      model_name: modelName,
      api_key: resolvedApiKey,
      api_base: resolvedApiBase ?? null,
    };

    try {
      const agentResp = await fetch(
        `${WORKFLOWS_API_URL}/v1/workflows/daily_digest/sections/${section.id}/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Token": INTERNAL_CALLBACK_TOKEN,
          },
          body: JSON.stringify(agentPayload),
        },
      );

      if (!agentResp.ok) {
        const detail = await agentResp.text().catch(() => "(no body)");
        console.error(
          "[digest/generate] agent enqueue failed:",
          agentResp.status,
          detail,
        );
        enqueueErrors.push({
          sectionId: section.id,
          sourceType: section.sourceType,
          status: agentResp.status,
          detail,
        });
        continue;
      }

      const agentBody = (await agentResp.json()) as { job_id?: string };
      enqueued.push({
        sectionId: section.id,
        sourceType: section.sourceType,
        jobId: agentBody.job_id ?? null,
      });
    } catch (err) {
      console.error("[digest/generate] agent fetch threw:", err);
      enqueueErrors.push({
        sectionId: section.id,
        sourceType: section.sourceType,
        status: 0,
        detail: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // If every attempt failed AND nothing was enqueued AND no prior conflicts,
  // the client has no usable result — surface a 502. Otherwise prefer a
  // partial-success 202 so the client can see which sections need retry.
  if (
    enqueued.length === 0 &&
    enqueueErrors.length > 0 &&
    conflicts.length === 0
  ) {
    return NextResponse.json(
      {
        error: "Digest enqueue failed. Try again shortly.",
        failures: enqueueErrors.map(({ sectionId, sourceType }) => ({
          sectionId,
          sourceType,
        })),
      },
      { status: 502 },
    );
  }

  return NextResponse.json(
    {
      accepted: true,
      digestId,
      enqueued,
      conflicts,
      ...(enqueueErrors.length > 0
        ? {
            failures: enqueueErrors.map(({ sectionId, sourceType }) => ({
              sectionId,
              sourceType,
            })),
          }
        : {}),
    },
    { status: 202 },
  );
}
