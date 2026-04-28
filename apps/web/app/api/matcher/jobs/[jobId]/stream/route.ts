/**
 * Job Progress SSE Stream Proxy
 *
 * Proxies SSE stream from matcher service to frontend.
 */

import { NextRequest } from "next/server";

const WORKFLOWS_API_URL = process.env.NEXT_PUBLIC_WORKFLOWS_API_URL || "http://localhost:2027";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  const { jobId } = await params;

  // Connect to matcher service SSE endpoint
  const response = await fetch(`${WORKFLOWS_API_URL}/v1/workflows/matcher/jobs/${jobId}/stream`, {
    headers: {
      Accept: "text/event-stream",
    },
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
