"""Sync BGE-M3 embeddings for WeChat articles into the main SparkFlow DB.

The WeChat articles live in the external `wechat_articles` Postgres which we
treat as read-only. Their embeddings are mirrored into the main SparkFlow DB
table `wechat_article_embeddings`, keyed by the upstream integer article id.

Two modes:

    # Incremental (default): embed rows that are missing or whose upstream
    # article_hash has changed since their last embedding. Also removes
    # embedding rows whose upstream article was deleted. Safe to run on a
    # cron — idempotent and self-healing.
    python apps/langgraph/scripts/backfill_wechat_embeddings.py

    # Full re-embed: truncate the mirror table then re-embed every upstream
    # row. Useful after changing the embedding model or chunking strategy.
    python apps/langgraph/scripts/backfill_wechat_embeddings.py --full

Env:
    WECHAT_DATABASE_URL   external WeChat Postgres (read-only for this script)
    DATABASE_URL          main SparkFlow Postgres (pgvector + mirror table)
    BGE_M3_MODEL          optional override (default BAAI/bge-m3)
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from embeddings.bge_m3 import EMBED_DIM, embed_passages  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)-7s  %(message)s")
logger = logging.getLogger("backfill_wechat")

CONTENT_SNIPPET_CHARS = 4000
FETCH_BATCH = 200  # upstream rows fetched per loop iteration


def _vector_literal(vec: list[float]) -> str:
    if len(vec) != EMBED_DIM:
        raise ValueError(f"Expected {EMBED_DIM}-d vector, got {len(vec)}")
    return "[" + ",".join(f"{v:.7f}" for v in vec) + "]"


def _load_existing_hashes(main_dsn: str) -> dict[int, str | None]:
    """articleId -> articleHash for every row already in the mirror table."""
    existing: dict[int, str | None] = {}
    with psycopg.connect(main_dsn) as conn, conn.cursor() as cur:
        cur.execute('SELECT "articleId", "articleHash" FROM "wechat_article_embeddings"')
        for article_id, article_hash in cur:
            existing[int(article_id)] = article_hash
    return existing


def _load_upstream_catalog(wechat_dsn: str) -> dict[int, str | None]:
    """articleId -> upstream article_hash for every row in the external DB."""
    catalog: dict[int, str | None] = {}
    with psycopg.connect(wechat_dsn) as conn, conn.cursor() as cur:
        cur.execute("SELECT id, article_hash FROM wechat_articles.articles")
        for article_id, article_hash in cur:
            catalog[int(article_id)] = article_hash
    return catalog


def _fetch_upstream_rows(wechat_dsn: str, ids: list[int]) -> list[tuple[int, str | None, str, str]]:
    """Fetch (id, article_hash, title, content_snippet) for the given ids."""
    if not ids:
        return []
    with psycopg.connect(wechat_dsn) as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, article_hash, COALESCE(title, ''), LEFT(COALESCE(content_text, ''), %s)
              FROM wechat_articles.articles
             WHERE id = ANY(%s::int[])
            """,
            (CONTENT_SNIPPET_CHARS, ids),
        )
        return list(cur.fetchall())


async def _embed_and_upsert(main_dsn: str, rows: list[tuple[int, str | None, str, str]]) -> int:
    if not rows:
        return 0
    titles = [r[2] or "" for r in rows]
    contents = [r[3] or "" for r in rows]
    title_vecs = await embed_passages(titles, batch_size=len(rows), max_length=128)
    content_vecs = await embed_passages(contents, batch_size=len(rows), max_length=1024)

    with psycopg.connect(main_dsn) as conn, conn.cursor() as cur:
        for (article_id, article_hash, _title, _snippet), tvec, cvec in zip(
            rows, title_vecs, content_vecs
        ):
            cur.execute(
                """
                INSERT INTO "wechat_article_embeddings"
                    ("articleId", "articleHash", "titleEmbedding", "contentEmbedding", "embeddedAt")
                VALUES (%s, %s, %s::vector, %s::vector, CURRENT_TIMESTAMP)
                ON CONFLICT ("articleId") DO UPDATE
                   SET "articleHash"      = EXCLUDED."articleHash",
                       "titleEmbedding"   = EXCLUDED."titleEmbedding",
                       "contentEmbedding" = EXCLUDED."contentEmbedding",
                       "embeddedAt"       = CURRENT_TIMESTAMP
                """,
                (article_id, article_hash, _vector_literal(tvec), _vector_literal(cvec)),
            )
        conn.commit()
    return len(rows)


def _delete_stale(main_dsn: str, ids: list[int]) -> int:
    if not ids:
        return 0
    with psycopg.connect(main_dsn) as conn, conn.cursor() as cur:
        cur.execute(
            'DELETE FROM "wechat_article_embeddings" WHERE "articleId" = ANY(%s::int[])',
            (ids,),
        )
        conn.commit()
        return cur.rowcount or 0


def _truncate(main_dsn: str) -> None:
    with psycopg.connect(main_dsn) as conn, conn.cursor() as cur:
        cur.execute('TRUNCATE TABLE "wechat_article_embeddings"')
        conn.commit()


async def run(mode: str, batch_size: int, hard_limit: int | None) -> dict[str, int]:
    wechat_dsn = os.environ["WECHAT_DATABASE_URL"]
    main_dsn = os.environ["DATABASE_URL"]

    if mode == "full":
        logger.info("Full re-embed: truncating wechat_article_embeddings")
        _truncate(main_dsn)

    upstream = _load_upstream_catalog(wechat_dsn)
    existing = {} if mode == "full" else _load_existing_hashes(main_dsn)

    # Classify: new (missing), changed (hash differs), stale (upstream-deleted).
    to_embed: list[int] = []
    for article_id, up_hash in upstream.items():
        if article_id not in existing:
            to_embed.append(article_id)
        elif up_hash is not None and existing[article_id] != up_hash:
            to_embed.append(article_id)

    stale = [aid for aid in existing.keys() if aid not in upstream]

    logger.info(
        "upstream=%d  already_embedded=%d  to_embed=%d  stale=%d",
        len(upstream),
        len(existing),
        len(to_embed),
        len(stale),
    )

    deleted = _delete_stale(main_dsn, stale)

    embedded = 0
    # Iterate in upstream-id order so restarts advance deterministically.
    to_embed.sort()
    for start in range(0, len(to_embed), FETCH_BATCH):
        chunk_ids = to_embed[start : start + FETCH_BATCH]
        rows = _fetch_upstream_rows(wechat_dsn, chunk_ids)
        for inner in range(0, len(rows), batch_size):
            batch = rows[inner : inner + batch_size]
            embedded += await _embed_and_upsert(main_dsn, batch)
            logger.info("embedded %d / %d", embedded, len(to_embed))
            if hard_limit is not None and embedded >= hard_limit:
                return {
                    "embedded": embedded,
                    "deleted": deleted,
                    "pending": len(to_embed) - embedded,
                }

    return {"embedded": embedded, "deleted": deleted, "pending": 0}


def main() -> int:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--full",
        action="store_true",
        help="Truncate the mirror table and re-embed every upstream row.",
    )
    parser.add_argument("--batch", type=int, default=16, help="Rows per embedding batch.")
    parser.add_argument("--limit", type=int, default=None, help="Stop after N embeds (testing).")
    args = parser.parse_args()

    mode = "full" if args.full else "incremental"
    stats = asyncio.run(run(mode, args.batch, args.limit))
    logger.info(
        "Done. mode=%s embedded=%d deleted=%d pending=%d",
        mode,
        stats["embedded"],
        stats["deleted"],
        stats["pending"],
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
