"""
SparkFlow FastAPI Agent Server
Main entry point for the RAG agent API
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(
    title="SparkFlow Agent API",
    description="RAG-powered agent for SparkFlow notebooks",
    version="1.0.0"
)

# CORS configuration for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",  # Next.js development
        os.getenv("NEXTJS_URL", "http://localhost:3001"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "service": "sparkflow-agent"}

@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": "SparkFlow Agent API",
        "version": "1.0.0",
        "docs": "/docs"
    }

# Import and include routers here
# from app.api import chat
# app.include_router(chat.router, prefix="/api", tags=["chat"])
