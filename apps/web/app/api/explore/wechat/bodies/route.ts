import { NextRequest, NextResponse } from "next/server";
import { wechatPool } from "@/lib/wechat-db";

const MAX_IDS = 50;
const CONTENT_CHARS = 8000;

// Input:  { ids: (number|string)[] }
// Output: [{ id, title, content_text, ... }]
// Used by the search agent to fetch full bodies for the shortlist chosen after
// title triage. Content is truncated server-side so the agent can't be swamped
// by a single ultra-long article.
export async function POST(req: NextRequest) {
  if (!wechatPool) {
    return NextResponse.json({ error: "WeChat database not configured" }, { status: 503 });
  }

  const body = (await req.json()) as { ids?: (number | string)[] };
  const rawIds = Array.isArray(body.ids) ? body.ids : [];
  const ids = Array.from(
    new Set(rawIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)),
  ).slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json([]);
  }

  const result = await wechatPool.query(
    `SELECT
       a.id,
       a.title,
       a.author,
       a.publish_time,
       a.original_url,
       LEFT(a.content_text, $2) AS content_text,
       s.name AS source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
    WHERE a.id = ANY($1::int[])`,
    [ids, CONTENT_CHARS],
  );

  const rows = result.rows.map((r) => ({
    id: String(r.id),
    title: r.title,
    author: r.author,
    publish_time: r.publish_time ? String(r.publish_time).slice(0, 10) : "",
    original_url: r.original_url,
    content_text: r.content_text ?? "",
    source_name: r.source_name,
  }));

  return NextResponse.json(rows);
}
