import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { wechatPool } from "@/lib/wechat-db";
import { requireAdminUser } from "@/lib/actions/admin";

// GET /api/admin/wechat-embeddings/status
// Compares upstream article count (external WeChat DB) against the mirror
// table (main DB) so the admin can see how many articles still need embedding.
export async function GET() {
  await requireAdminUser();

  if (!wechatPool) {
    return NextResponse.json({ error: "WeChat database not configured" }, { status: 503 });
  }

  const [upstreamResult, embeddedResult, latest] = await Promise.all([
    wechatPool.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM wechat_articles.articles",
    ),
    prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "wechat_article_embeddings"
    `,
    prisma.$queryRaw<{ embeddedAt: Date | null }[]>`
      SELECT MAX("embeddedAt") AS "embeddedAt" FROM "wechat_article_embeddings"
    `,
  ]);

  const upstream = Number(upstreamResult.rows[0]?.count ?? 0);
  const embedded = Number(embeddedResult[0]?.count ?? 0);
  const pending = Math.max(0, upstream - embedded);
  const lastEmbeddedAt = latest[0]?.embeddedAt ?? null;

  return NextResponse.json({
    upstream,
    embedded,
    pending,
    lastEmbeddedAt,
  });
}
