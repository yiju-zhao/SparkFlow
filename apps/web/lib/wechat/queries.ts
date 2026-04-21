import { wechatPool } from "@/lib/wechat-db";
import { type WechatArticleFilters, WECHAT_PAGE_SIZE } from "./filters";

export interface WechatSource {
  id: number;
  slug: string;
  name: string;
  description: string;
}

export interface WechatArticleSummary {
  id: number;
  title: string;
  author: string;
  publish_time: string | null;
  cover_url: string;
  source_name: string;
  source_id: number;
}

export interface WechatArticleDetail {
  id: number;
  title: string;
  author: string;
  publish_time: string | null;
  original_url: string;
  cover_url: string;
  content_html: string;
  content_text: string;
  source_name: string;
  source_id: number;
  source_slug: string;
  images: { id: number; image_type: string; image_index: number; original_url: string }[];
}

export async function getWechatSources(): Promise<WechatSource[]> {
  if (!wechatPool) return [];
  const result = await wechatPool.query(
    `SELECT id, slug, name, description
     FROM wechat_articles.sources
     ORDER BY name`,
  );
  return result.rows;
}

export async function getWechatArticles(
  filters: WechatArticleFilters,
): Promise<{ articles: WechatArticleSummary[]; total: number }> {
  if (!wechatPool) return { articles: [], total: 0 };
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (filters.source) {
    conditions.push(`a.source_id = $${paramIndex++}`);
    values.push(filters.source);
  }
  if (filters.dateFrom) {
    conditions.push(`a.publish_time >= $${paramIndex++}`);
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    conditions.push(`a.publish_time <= $${paramIndex++}`);
    values.push(filters.dateTo + " 23:59:59");
  }
  if (filters.search) {
    conditions.push(`(a.title ILIKE $${paramIndex} OR a.author ILIKE $${paramIndex})`);
    values.push(`%${filters.search}%`);
    paramIndex++;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const countResult = await wechatPool.query(
    `SELECT COUNT(*)::int as total FROM wechat_articles.articles a ${whereClause}`,
    values,
  );
  const total = countResult.rows[0].total;

  const offset = filters.page * WECHAT_PAGE_SIZE;
  const dataResult = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.cover_url,
            s.name as source_name, a.source_id
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON s.id = a.source_id
     ${whereClause}
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
    [...values, WECHAT_PAGE_SIZE, offset],
  );

  return { articles: dataResult.rows, total };
}

export async function getWechatArticle(id: number): Promise<WechatArticleDetail | null> {
  if (!wechatPool) return null;
  const articleResult = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text,
            s.name as source_name, s.id as source_id, s.slug as source_slug
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON s.id = a.source_id
     WHERE a.id = $1`,
    [id],
  );

  if (articleResult.rows.length === 0) return null;

  const imageResult = await wechatPool.query(
    `SELECT id, image_type, image_index, original_url
     FROM wechat_articles.images
     WHERE article_id = $1
     ORDER BY image_index`,
    [id],
  );

  return {
    ...articleResult.rows[0],
    images: imageResult.rows,
  };
}

export async function getRelatedWechatArticles(
  sourceId: number,
  excludeId: number,
  limit = 4,
): Promise<WechatArticleSummary[]> {
  if (!wechatPool) return [];
  const result = await wechatPool.query(
    `SELECT a.id, a.title, a.author, a.publish_time, a.cover_url,
            s.name as source_name, a.source_id
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON s.id = a.source_id
     WHERE a.source_id = $1 AND a.id <> $2
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $3`,
    [sourceId, excludeId, limit],
  );
  return result.rows;
}

export async function getWechatImage(
  id: number,
): Promise<{ data: Buffer; mime_type: string } | null> {
  if (!wechatPool) return null;
  const result = await wechatPool.query(
    `SELECT data, mime_type FROM wechat_articles.images WHERE id = $1`,
    [id],
  );
  if (result.rows.length === 0 || !result.rows[0].data) return null;
  return result.rows[0];
}
