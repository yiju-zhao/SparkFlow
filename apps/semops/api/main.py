"""
SemOps Service - FastAPI Application

Pure semantic-operator library. Exposes `/api/operators/*` for workflow
callers (apps/agent/workflows) to invoke LOTUS-backed semantic primitives.
Matcher-specific orchestration moved to apps/agent/workflows/matcher/
in the P5 refactor.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import operators


app = FastAPI(
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
