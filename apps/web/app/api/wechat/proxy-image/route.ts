import { NextRequest, NextResponse } from "next/server";

// WeChat cover images are stored in our DB pointing at a third-party relay
// (img2.jintiankansha.me/get?src=<mmbiz_url>). The relay is unreliable and
// has been returning 502 for whole batches of images. The underlying source
// is Tencent's mmbiz.qpic.cn CDN, which is far more stable but requires a
// `Referer: https://mp.weixin.qq.com/` header to serve cross-origin.
//
// Strategy: try the underlying mmbiz URL directly first (HTTPS + correct
// Referer). If that fails, fall back to the relay. Each attempt has a
// short timeout so a single dead host can't tie up a Node worker. Failure
// responses are cached briefly on the browser so a broken cover image
// does not retry on every navigation.

const PER_ATTEMPT_TIMEOUT_MS = 5_000;
const FAILURE_CACHE = "public, max-age=300, stale-while-revalidate=600";
const SUCCESS_CACHE = "public, max-age=2592000, immutable";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface FetchAttempt {
  url: string;
  referer?: string;
}

// Pull the inner mmbiz URL out of the jintiankansha relay form. We use raw
// string slicing rather than `URL.searchParams.get('src')` because the inner
// URL itself contains `?` and `&` (e.g. `?wx_fmt=jpeg&...`), which standard
// URL parsing would chop off.
function extractRelayInner(rawUrl: string): string | null {
  const marker = "?src=";
  const idx = rawUrl.indexOf(marker);
  if (idx < 0) return null;
  const inner = rawUrl.slice(idx + marker.length);
  return inner.length > 0 ? inner : null;
}

function buildAttempts(rawUrl: string): FetchAttempt[] {
  const attempts: FetchAttempt[] = [];

  // 1. If the URL is the jintiankansha relay, prefer the underlying mmbiz
  //    source (upgraded to HTTPS) with a wechat Referer.
  if (rawUrl.includes("jintiankansha.me/get?src=")) {
    const inner = extractRelayInner(rawUrl);
    if (inner) {
      const httpsInner = inner.replace(/^http:\/\//i, "https://");
      attempts.push({ url: httpsInner, referer: "https://mp.weixin.qq.com/" });
      // Some mmbiz hosts only accept HTTP; try that variant too.
      if (httpsInner !== inner) {
        attempts.push({ url: inner, referer: "https://mp.weixin.qq.com/" });
      }
    }
  } else if (/^https?:\/\/mmbiz\.qpic\.cn\//i.test(rawUrl)) {
    // Direct mmbiz URL — same Referer trick.
    const httpsUrl = rawUrl.replace(/^http:\/\//i, "https://");
    attempts.push({ url: httpsUrl, referer: "https://mp.weixin.qq.com/" });
  }

  // 2. As a final fallback, try whatever the caller actually asked for.
  attempts.push({ url: rawUrl });

  return attempts;
}

async function fetchWithTimeout(attempt: FetchAttempt): Promise<Response | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_ATTEMPT_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Accept: "image/webp,image/*,*/*;q=0.8",
    };
    if (attempt.referer) headers.Referer = attempt.referer;

    const res = await fetch(attempt.url, { signal: controller.signal, headers });
    if (!res.ok || !res.body) return null;
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  for (const attempt of buildAttempts(url)) {
    const upstream = await fetchWithTimeout(attempt);
    if (upstream) {
      return new NextResponse(upstream.body, {
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "image/jpeg",
          "Cache-Control": SUCCESS_CACHE,
        },
      });
    }
  }

  return new NextResponse(null, {
    status: 502,
    headers: { "Cache-Control": FAILURE_CACHE },
  });
}
