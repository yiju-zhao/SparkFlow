import { NextRequest, NextResponse } from "next/server";

// WeChat cover images live on `mmbiz.qpic.cn` and a relay (`img2.jintiankansha.me`)
// that frequently times out or returns 502. Without a timeout, a single slow
// upstream wedged a Node worker until its socket was reaped (>30 s); each
// WeChat list page fans out 6+ of these in parallel, so failures cascaded
// into across-the-board API slowness.
//
// Hardening:
//   * AbortController with a hard 8 s timeout.
//   * Stream the body (no `arrayBuffer()`), so memory stays bounded.
//   * Cache failures briefly on the browser so a single broken image does
//     not retry on every tab switch / page navigation.

const FETCH_TIMEOUT_MS = 8_000;
// Browsers respect Cache-Control on non-2xx responses. 5 min keeps
// broken images out of the request path while still allowing a recover.
const FAILURE_CACHE = "public, max-age=300, stale-while-revalidate=600";
const SUCCESS_CACHE = "public, max-age=2592000, immutable";

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "image/webp,image/*,*/*;q=0.8",
      },
    });

    if (!upstream.ok || !upstream.body) {
      return new NextResponse(null, {
        status: 502,
        headers: { "Cache-Control": FAILURE_CACHE },
      });
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
        "Cache-Control": SUCCESS_CACHE,
      },
    });
  } catch {
    return new NextResponse(null, {
      status: 502,
      headers: { "Cache-Control": FAILURE_CACHE },
    });
  } finally {
    clearTimeout(timer);
  }
}
