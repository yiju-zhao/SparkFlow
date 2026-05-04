/**
 * Job Progress SSE Stream Proxy
 *
 * Proxies SSE stream from matcher service to frontend. Authorization is
 * mandatory: any logged-in user could otherwise subscribe to any other
 * user's stream by guessing/leaking the cuid.
 */

import { NextRequest, NextResponse } from "next/server";
import { Agent } from "undici";
import { requireOwnedJob } from "@/lib/matcher/auth";

// Server-side only: prefer WORKFLOWS_API_URL, fall back to the public
// form for backwards-compat. See app/api/matcher/jobs/route.ts.
const WORKFLOWS_API_URL =
  process.env.WORKFLOWS_API_URL ||
  process.env.NEXT_PUBLIC_WORKFLOWS_API_URL ||
  "http://localhost:2027";

// Matcher rank stages can run 10+ minutes on CPU with no progress events
// in between. Node 22 / undici default `bodyTimeout` is 5 minutes — the
// SSE source emits heartbeats every 15s, but we still disable the body
// timeout entirely (0 = no limit) so this proxy never gives up. Headers
// timeout stays sane: if workflows-api can't even respond with headers
// in 60s something is wrong.
const sseDispatcher = new Agent({
  bodyTimeout: 0,
  headersTimeout: 60_000,
  keepAliveTimeout: 60_000,
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  // Authorization gate. Without this, any logged-in user could open
  // any other user's progress stream by knowing/guessing the cuid.
  const ownerCheck = await requireOwnedJob(jobId, { id: true });
  if (!ownerCheck.ok) {
    return NextResponse.json({ error: ownerCheck.error }, { status: ownerCheck.status });
  }

  // Connect to matcher service SSE endpoint
  const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/stream`, {
    headers: {
      Accept: "text/event-stream",
    },
    // @ts-expect-error -- `dispatcher` is a Node fetch (undici) extension,
    // not part of the standard fetch types but supported in Next.js 16.
    dispatcher: sseDispatcher,
  });

  if (!response.ok) {
    return new Response(JSON.stringify({ error: "Failed to connect to matcher service" }), {
      status: response.status,
    });
  }

  // Stream the SSE response
  return new Response(response.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
