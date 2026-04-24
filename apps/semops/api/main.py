"""
SemOps Service - FastAPI Application

Pure semantic-operator library. Exposes `/api/operators/*` for workflow
callers (apps/agent/workflows) to invoke LOTUS-backed semantic primitives.
Matcher-specific orchestration moved to apps/agent/workflows/matcher/
in the P5 refactor.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import operators

logger = logging.getLogger(__name__)


@asynccontextmanager
async def _lifespan(_app: FastAPI):
    """Warm up the LOTUS rank pool at startup; shut it down cleanly at exit."""
    from services._pool import get_pool, shutdown_pool

    try:
        get_pool()  # Triggers init_worker() in each subprocess.
        logger.info("semops lifespan: rank pool warmed up")
    except Exception as exc:  # noqa: BLE001
        logger.warning("semops lifespan: pool warm-up failed: %s", exc)
    try:
        yield
    finally:
        shutdown_pool()
        logger.info("semops lifespan: rank pool shut down")


app = FastAPI(
    lifespan=_lifespan,
    title="SemOps Service",
    description="Semantic operator library (sem_rank etc.) backing SparkFlow workflows",
    version="2.0.0",
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(operators.router, prefix="/api/operators", tags=["operators"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "semops"}
