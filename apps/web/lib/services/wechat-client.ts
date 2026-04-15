import { wechatPool } from "@/lib/wechat-db";

export interface WechatArticle {
  id: number;
  title: string;
  author: string;
  publish_time: Date | null;
  original_url: string;
  cover_url: string;
  content_html: string;
  content_text: string;
  source_name: string;
}

export interface WechatImage {
  id: number;
  article_id: number;
  image_type: string;
  original_url: string;
  mime_type: string;
  data: Buffer;
}

export async function searchWechatArticles(
  query: string,
  limit = 10,
  excludedSourceIds: number[] = [],
): Promise<WechatArticle[]> {
  if (!wechatPool) return [];

  const conditions = ["(a.title ILIKE $1 OR a.content_text ILIKE $1)"];
  const params: (string | number | number[])[] = [`%${query}%`];
  let paramIndex = 2;

  if (excludedSourceIds.length > 0) {
    conditions.push(`a.source_id != ALL($${paramIndex})`);
    params.push(excludedSourceIds);
    paramIndex++;
  }

  params.push(limit);

  const result = await wechatPool!.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE ${conditions.join(" AND ")}
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $${paramIndex}`,
    params,
  );
  return result.rows;
}

export async function getWechatArticleById(articleId: number): Promise<WechatArticle | null> {
  if (!wechatPool) return null;
  const result = await wechatPool!.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE a.id = $1`,
    [articleId],
  );
  return result.rows[0] || null;
}

export async function getWechatArticleImages(articleId: number): Promise<WechatImage[]> {
  if (!wechatPool) return [];
  const result = await wechatPool!.query<WechatImage>(
    `SELECT id, article_id, image_type, original_url, mime_type, data
     FROM wechat_articles.images
     WHERE article_id = $1
     ORDER BY image_index ASC`,
    [articleId],
  );
  return result.rows;
}
