"""
Query Matcher Service - FastAPI Application

Matches user queries against conference sessions/publications using LOTUS semantic operators.
"""

import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes import jobs
from services.lotus_matcher import LotusMatcher


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize services on startup."""
    # Initialize LOTUS matcher (lazy - will configure on first use)
    app.state.matcher = LotusMatcher()
    yield
    # Cleanup on shutdown
    app.state.matcher = None


app = FastAPI(
    title="Query Matcher Service",
    description="Semantic matching service for conference sessions and publications",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(jobs.router, prefix="/api/jobs", tags=["jobs"])


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "matcher"}
