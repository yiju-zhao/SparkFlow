"""Embedding utilities for the search agent prefilter (BGE-M3 on CPU)."""

from embeddings.bge_m3 import embed_query, embed_passages

__all__ = ["embed_query", "embed_passages"]
