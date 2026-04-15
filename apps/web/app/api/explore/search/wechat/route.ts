import { NextRequest, NextResponse } from "next/server";
import { wechatPool } from "@/lib/wechat-db";

export async function POST(req: NextRequest) {
  if (!wechatPool) {
    return NextResponse.json(
      { error: "WeChat database not configured" },
      { status: 503 },
    );
  }

  const { query, limit = 20 } = (await req.json()) as {
    query: string;
    limit?: number;
  };

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // 'simple' config: tokenizes on whitespace, works for Chinese + English mixed content.
  // No language-specific stemming, but handles CJK reasonably.
  const result = await wechatPool.query(
    `SELECT
      a.id,
      a.title,
      LEFT(a.content_text, 300) AS content_text,
      a.author,
      a.publish_time,
      a.original_url,
      s.name AS source_name,
      ts_rank(
        setweight(to_tsvector('simple', coalesce(a.title, '')), 'A') ||
        setweight(to_tsvector('simple', coalesce(a.content_text, '')), 'B'),
        plainto_tsquery('simple', $1)
      ) AS rank
    FROM wechat_articles.articles a
    JOIN wechat_articles.sources s ON a.source_id = s.id
    WHERE (
      to_tsvector('simple', coalesce(a.title, '')) ||
      to_tsvector('simple', coalesce(a.content_text, ''))
    ) @@ plainto_tsquery('simple', $1)
    ORDER BY rank DESC
    LIMIT $2`,
    [query, limit],
  );

  return NextResponse.json(result.rows);
}
