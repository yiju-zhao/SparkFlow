import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const fetchCache = "force-no-store";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

function getUpstreamBaseUrl(): string | null {
  const url = process.env.LANGGRAPH_API_URL ?? process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? null;
  if (!url) return null;
  return url.replace(/\/+$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const upstreamBase = getUpstreamBaseUrl();
  if (!upstreamBase) {
    return new Response("LANGGRAPH_API_URL is not configured on the server.", { status: 500 });
  }

  const { path } = await ctx.params;
  const subPath = (path ?? []).map(encodeURIComponent).join("/");
  const search = new URL(req.url).search;
  const target = `${upstreamBase}/${subPath}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    redirect: "manual",
    cache: "no-store",
  };
  if (hasBody) init.duplex = "half";

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (err) {
    console.error("[langgraph proxy] upstream fetch failed:", err);
    return new Response(
      "Failed to reach LangGraph upstream. Check server LANGGRAPH_API_URL and that the agent is running.",
      { status: 502 },
    );
  }

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });
  responseHeaders.set("X-Accel-Buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
