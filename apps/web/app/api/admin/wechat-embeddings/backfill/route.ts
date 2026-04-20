import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/actions/admin";
import type * as WechatEmbeddingJob from "@/lib/services/wechat-embedding-job";

// Lazy-load the service so Next.js file tracing doesn't follow its
// `path.resolve(process.cwd(), ...)` usage out of the app root and pull
// next.config.ts (and the rest of the monorepo) into the server bundle.
async function loadService(): Promise<typeof WechatEmbeddingJob> {
  return import(/* turbopackIgnore: true */ "@/lib/services/wechat-embedding-job");
}

// GET  — return current/last backfill job status (logFile path etc.)
// POST — kick off a new backfill. Body: { mode?: "incremental" | "full" }
//        Returns 409 if a job is already running.
//
// The periodic keep-up-to-date mechanism is the same script run under cron,
// or repeated POSTs with mode=incremental from a scheduler.
export async function GET() {
  await requireAdminUser();
  const { getJobStatus } = await loadService();
  return NextResponse.json(getJobStatus());
}

export async function POST(req: NextRequest) {
  await requireAdminUser();
  const { getJobStatus, isRunning, startBackfill } = await loadService();

  if (isRunning()) {
    return NextResponse.json(
      { error: "A backfill is already running", status: getJobStatus() },
      { status: 409 },
    );
  }

  let mode: "incremental" | "full" = "incremental";
  try {
    const body = (await req.json()) as { mode?: string };
    if (body?.mode === "full") mode = "full";
  } catch {
    // Empty body is fine — default to incremental.
  }

  const status = await startBackfill(mode);
  return NextResponse.json(status, { status: 202 });
}
