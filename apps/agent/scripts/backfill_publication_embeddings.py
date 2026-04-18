"""Backfill BGE-M3 title + abstract embeddings for Publications (main SparkFlow DB).

Prereq: run `prisma migrate deploy` in apps/web so the migration
`20260418000000_add_publication_embeddings` has enabled pgvector and added the
columns + HNSW indexes.

Usage:
    uv run python apps/agent/scripts/backfill_publication_embeddings.py
    uv run python apps/agent/scripts/backfill_publication_embeddings.py --batch 32 --limit 5000

Env:
    DATABASE_URL    main SparkFlow Postgres DSN

Idempotent: only touches rows where the target embedding IS NULL.
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
logger = logging.getLogger("backfill_pubs")

ABSTRACT_SNIPPET_CHARS = 4000


def _format_vector(vec: list[float]) -> str:
    if len(vec) != EMBED_DIM:
        raise ValueError(f"Expected {EMBED_DIM}-d vector, got {len(vec)}")
    return "[" + ",".join(f"{v:.7f}" for v in vec) + "]"


async def backfill(batch_size: int, hard_limit: int | None) -> int:
    dsn = os.environ["DATABASE_URL"]
    total = 0
    with psycopg.connect(dsn, autocommit=False) as conn:
        while True:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, title, LEFT(COALESCE(abstract, ''), %s)
                      FROM "publications"
                     WHERE "titleEmbedding" IS NULL
                        OR "abstractEmbedding" IS NULL
                     ORDER BY id
                     LIMIT %s
                       FOR UPDATE SKIP LOCKED
                    """,
                    (ABSTRACT_SNIPPET_CHARS, batch_size),
                )
                rows = cur.fetchall()

            if not rows:
                conn.commit()
                break

            ids = [r[0] for r in rows]
            titles = [r[1] or "" for r in rows]
            abstracts = [r[2] or "" for r in rows]

            title_vecs = await embed_passages(titles, batch_size=batch_size, max_length=128)
            abstract_vecs = await embed_passages(
                abstracts, batch_size=batch_size, max_length=1024
            )

            with conn.cursor() as cur:
                for pub_id, tvec, avec in zip(ids, title_vecs, abstract_vecs):
                    cur.execute(
                        """
                        UPDATE "publications"
                           SET "titleEmbedding"    = %s::vector,
                               "abstractEmbedding" = %s::vector
                         WHERE id = %s
                        """,
                        (_format_vector(tvec), _format_vector(avec), pub_id),
                    )
            conn.commit()

            total += len(rows)
            logger.info("Embedded %d publications (total %d)", len(rows), total)

            if hard_limit is not None and total >= hard_limit:
                break

    return total


def main() -> int:
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch", type=int, default=16)
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    total = asyncio.run(backfill(args.batch, args.limit))
    logger.info("Done. Embedded %d publications.", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
