"""BGE-M3 dense embeddings on CPU.

BGE-M3 produces 1024-d multilingual (EN + ZH + 100 more) dense vectors trained
for cosine similarity. We use only the dense head and ignore sparse/multi-vector
to keep the backend simple (single pgvector column, cosine index).

The model is loaded lazily on first use and kept in the Python process for the
lifetime of the LangGraph worker. Keep this a singleton; FlagEmbedding's
BGEM3FlagModel is NOT thread-safe for concurrent encode() calls when `use_fp16`
is enabled on CPU, so callers should serialize via `asyncio.Lock` if needed.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Sequence

logger = logging.getLogger(__name__)

MODEL_NAME = os.getenv("BGE_M3_MODEL", "BAAI/bge-m3")
EMBED_DIM = 1024

_model = None
_lock = asyncio.Lock()


def _load_model():
    """Load FlagEmbedding's BGEM3FlagModel. CPU, fp32 (fp16 is unstable on CPU)."""
    global _model
    if _model is not None:
        return _model
    from FlagEmbedding import BGEM3FlagModel

    logger.info("Loading BGE-M3 model %s (CPU)", MODEL_NAME)
    _model = BGEM3FlagModel(MODEL_NAME, use_fp16=False)
    return _model


def _encode_sync(texts: Sequence[str], batch_size: int, max_length: int) -> list[list[float]]:
    model = _load_model()
    output = model.encode(
        list(texts),
        batch_size=batch_size,
        max_length=max_length,
        return_dense=True,
        return_sparse=False,
        return_colbert_vecs=False,
    )
    vectors = output["dense_vecs"]
    # FlagEmbedding returns a numpy array; convert to plain lists for JSON/DB.
    return [list(map(float, v)) for v in vectors]


async def embed_query(text: str) -> list[float]:
    """Embed a single user query. Returns a 1024-d list of floats."""
    async with _lock:
        [vec] = await asyncio.to_thread(_encode_sync, [text], 1, 512)
    return vec


async def embed_passages(
    texts: Sequence[str], *, batch_size: int = 16, max_length: int = 1024
) -> list[list[float]]:
    """Embed a batch of passages (titles or article bodies).

    Called from the backfill script; not on the hot path. `max_length` caps
    tokens — BGE-M3 supports up to 8192 but CPU latency scales roughly linearly,
    so 1024 is a good default for article bodies.
    """
    if not texts:
        return []
    async with _lock:
        return await asyncio.to_thread(_encode_sync, texts, batch_size, max_length)
