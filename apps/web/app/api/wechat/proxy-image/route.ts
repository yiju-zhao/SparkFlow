import { NextRequest, NextResponse } from "next/server";
import { wechatPool } from "@/lib/wechat-db";

// WeChat article images are mirrored into `wechat_articles.images.data` on
// ingest, with the source URL stored in `images.original_url`. The covers
// (and most inline images) the browser asks for via this proxy are already
// present in our internal DB — there is no need to hit the public internet
// at all in the common case.
//
// Strategy:
//   1. Look the requested URL up in `wechat_articles.images` (exact + a few
//      well-known variants — the cover_url stored on `articles` is sometimes
//      wrapped in the jintiankansha relay form while the matching row in
//      `images` carries the bare mmbiz URL, or vice versa).
//   2. If we have the bytes, stream them straight from the DB.
//   3. Only fall back to fetching from outside if no row matches (e.g. an
//      image that hasn't been ingested yet). External fetches use a short
//      timeout and a hardened multi-strategy chain so a single dead host
//      can't tie up Node workers.

const PER_ATTEMPT_TIMEOUT_MS = 5_000;
const FAILURE_CACHE = "public, max-age=300, stale-while-revalidate=600";
const SUCCESS_CACHE = "public, max-age=2592000, immutable";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface FetchAttempt {
  url: string;
  referer?: string;
}

function extractRelayInner(rawUrl: string): string | null {
  const marker = "?src=";
  const idx = rawUrl.indexOf(marker);
  if (idx < 0) return null;
  const inner = rawUrl.slice(idx + marker.length);
  return inner.length > 0 ? inner : null;
}

// Build the set of URL forms a single image might be stored under.
function urlVariants(rawUrl: string): string[] {
  const set = new Set<string>([rawUrl]);

  if (rawUrl.includes("jintiankansha.me/get?src=")) {
    const inner = extractRelayInner(rawUrl);
    if (inner) {
      set.add(inner);
      set.add(inner.replace(/^http:\/\//i, "https://"));
      set.add(inner.replace(/^https:\/\//i, "http://"));
    }
  } else if (/^https?:\/\//i.test(rawUrl)) {
    set.add(rawUrl.replace(/^http:\/\//i, "https://"));
    set.add(rawUrl.replace(/^https:\/\//i, "http://"));
  }

  return [...set];
}

async function findInternalImage(
  rawUrl: string,
): Promise<{ data: Buffer; mime_type: string } | null> {
  if (!wechatPool) return null;
  try {
    const result = await wechatPool.query(
      `SELECT data, mime_type
         FROM wechat_articles.images
        WHERE original_url = ANY($1)
          AND data IS NOT NULL
        LIMIT 1`,
      [urlVariants(rawUrl)],
    );
    if (result.rows.length === 0 || !result.rows[0].data) return null;
    return result.rows[0];
  } catch {
    return null;
  }
}

function buildFetchAttempts(rawUrl: string): FetchAttempt[] {
  const attempts: FetchAttempt[] = [];

  if (rawUrl.includes("jintiankansha.me/get?src=")) {
    const inner = extractRelayInner(rawUrl);
    if (inner) {
      const httpsInner = inner.replace(/^http:\/\//i, "https://");
      attempts.push({ url: httpsInner, referer: "https://mp.weixin.qq.com/" });
      if (httpsInner !== inner) {
        attempts.push({ url: inner, referer: "https://mp.weixin.qq.com/" });
      }
    }
  } else if (/^https?:\/\/mmbiz\.qpic\.cn\//i.test(rawUrl)) {
    const httpsUrl = rawUrl.replace(/^http:\/\//i, "https://");
    attempts.push({ url: httpsUrl, referer: "https://mp.weixin.qq.com/" });
  }

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

  // 1. Internal DB — the happy path for any ingested image.
  const internal = await findInternalImage(url);
  if (internal) {
    return new NextResponse(new Uint8Array(internal.data), {
      headers: {
        "Content-Type": internal.mime_type || "image/jpeg",
        "Cache-Control": SUCCESS_CACHE,
      },
    });
  }

  // 2. External fallback for images we never mirrored.
  for (const attempt of buildFetchAttempts(url)) {
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
