import pg from "pg";

const pool = new pg.Pool({
  host: process.env.WECHAT_DB_HOST,
  port: parseInt(process.env.WECHAT_DB_PORT || "5432"),
  user: process.env.WECHAT_DB_USER,
  password: process.env.WECHAT_DB_PASSWORD,
  database: process.env.WECHAT_DB_NAME,
  max: 5,
  idleTimeoutMillis: 30000,
});

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
): Promise<WechatArticle[]> {
  const result = await pool.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE a.title ILIKE $1 OR a.content_text ILIKE $1
     ORDER BY a.publish_time DESC NULLS LAST
     LIMIT $2`,
    [`%${query}%`, limit],
  );
  return result.rows;
}

export async function getWechatArticleById(
  articleId: number,
): Promise<WechatArticle | null> {
  const result = await pool.query<WechatArticle>(
    `SELECT a.id, a.title, a.author, a.publish_time, a.original_url,
            a.cover_url, a.content_html, a.content_text, s.name as source_name
     FROM wechat_articles.articles a
     JOIN wechat_articles.sources s ON a.source_id = s.id
     WHERE a.id = $1`,
    [articleId],
  );
  return result.rows[0] || null;
}

export async function getWechatArticleImages(
  articleId: number,
): Promise<WechatImage[]> {
  const result = await pool.query<WechatImage>(
    `SELECT id, article_id, image_type, original_url, mime_type, data
     FROM wechat_articles.images
     WHERE article_id = $1
     ORDER BY image_index ASC`,
    [articleId],
  );
  return result.rows;
}
