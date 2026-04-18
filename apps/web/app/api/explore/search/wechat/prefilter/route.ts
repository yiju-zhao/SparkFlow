import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { wechatPool } from "@/lib/wechat-db";

const EMBED_DIM = 1024;
const DEFAULT_LIMIT = 80;

// Input: { embedding: number[1024], limit?: number, sourceIds?: number[] }
// Output: candidate rows ordered by weighted cosine similarity
//         (70% title + 30% content). Two phases:
//           (1) ANN query on the mirror table `wechat_article_embeddings` in the
//               main SparkFlow DB — this is where the pgvector index lives.
//           (2) Metadata lookup for those ids in the external WeChat DB so the
//               agent can see titles/authors/dates without round-tripping.
//         This keeps the external wechat_articles DB read-only.
export async function POST(req: NextRequest) {
  if (!wechatPool) {
    return NextResponse.json({ error: "WeChat database not configured" }, { status: 503 });
  }

  const body = (await req.json()) as {
    embedding?: number[];
    limit?: number;
    sourceIds?: number[];
  };

  if (!Array.isArray(body.embedding) || body.embedding.length !== EMBED_DIM) {
    return NextResponse.json(
      { error: `embedding must be a number[] of length ${EMBED_DIM}` },
      { status: 400 },
    );
  }

  const limit = Math.min(Math.max(body.limit ?? DEFAULT_LIMIT, 1), 200);
  const vectorLiteral = "[" + body.embedding.map((v) => v.toFixed(7)).join(",") + "]";

  // --- Phase 1: ANN on main DB --------------------------------------------
  type AnnRow = { articleId: number; distance: number };
  const annRows = await prisma.$queryRawUnsafe<AnnRow[]>(
    `SELECT "articleId",
            (0.7 * ("titleEmbedding" <=> $1::vector) +
             0.3 * COALESCE("contentEmbedding" <=> $1::vector,
                            "titleEmbedding" <=> $1::vector)) AS distance
       FROM "wechat_article_embeddings"
      WHERE "titleEmbedding" IS NOT NULL
      ORDER BY distance ASC
      LIMIT $2`,
    vectorLiteral,
    limit,
  );

  if (annRows.length === 0) return NextResponse.json([]);

  const distanceByArticleId = new Map<number, number>(
    annRows.map((r) => [Number(r.articleId), Number(r.distance)]),
  );
  const ids = Array.from(distanceByArticleId.keys());

  // --- Phase 2: metadata from external WeChat DB --------------------------
  const filters: string[] = ["a.id = ANY($1::int[])"];
  const values: unknown[] = [ids];
  if (body.sourceIds?.length) {
    filters.push("a.source_id = ANY($2)");
    values.push(body.sourceIds);
  }
  const meta = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            s.name AS source_name, a.source_id
       FROM wechat_articles.articles a
       JOIN wechat_articles.sources s ON a.source_id = s.id
      WHERE ${filters.join(" AND ")}`,
    values,
  );

  // Preserve ANN ordering; articles removed upstream since last sync are
  // silently dropped (their row in the mirror is stale — the next sync run
  // will clean it up).
  const byId = new Map<number, (typeof meta.rows)[number]>();
  for (const row of meta.rows) byId.set(Number(row.id), row);

  const rows = ids
    .map((articleId) => {
      const m = byId.get(articleId);
      if (!m) return null;
      const distance = distanceByArticleId.get(articleId) ?? 1;
      return {
        id: String(m.id),
        title: m.title,
        author: m.author,
        publish_time: m.publish_time ? String(m.publish_time).slice(0, 10) : "",
        original_url: m.original_url,
        source_name: m.source_name,
        source_id: m.source_id,
        score: Math.max(0, 1 - distance),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  return NextResponse.json(rows);
}
