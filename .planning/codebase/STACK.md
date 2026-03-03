# Technology Stack

**Analysis Date:** 2025-06-23

## Languages

**Primary:**
- TypeScript 5 - Frontend application code (apps/web)
- Python 3 - Agent service (apps/agent)

**Secondary:**
- Prisma Schema DSL - Database schema definition
- JSON - Configuration files and API responses
- SQL - Database queries (handled by Prisma ORM)

## Runtime

**Environment:**
- Node.js 20+ - Frontend runtime
- Python 3.9+ - Agent service runtime

**Package Managers:**
- npm - Frontend dependencies
- pip - Python dependencies

## Frameworks

**Core:**
- Next.js 16.1.6 - Frontend framework (React 19.2.3)
- LangGraph - Python agent framework
- Deep Agents - Agent skill system

**Testing:**
- No test framework detected in configuration

**Build/Dev:**
- Docker - Container orchestration
- Prisma - Database ORM and migration tool
- Tailwind CSS 4 - Styling framework
- ESLint - Code linting
- TypeScript - Type checking

## Key Dependencies

**Critical:**
- @prisma/client 7.3.0 - Database ORM client
- next-auth 5.0.0-beta.30 - Authentication
- openai 6.17.0 - OpenAI API client
- @langchain/langgraph_sdk 1.5.3 - LangGraph client
- @langchain/core 1.1.13 - LangChain core components

**Infrastructure:**
- aws-sdk/client-s3 3.970.0 - S3/MinIO client
- pg 8.16.3 - PostgreSQL client
- ragflow-sdk - RAGFlow Python client

## Configuration

**Environment:**
- Environment variables configuration in .env files
- Multiple service configurations (web, agent, database, storage, AI services)
- Docker Compose orchestration for development infrastructure

**Build:**
- Next.js configuration in apps/web
- TypeScript configuration in apps/web/tsconfig.json
- Tailwind CSS configuration via PostCSS
- Prisma schema in apps/web/prisma/schema.prisma

## Platform Requirements

**Development:**
- Node.js 20+
- Python 3.9+
- Docker for infrastructure services
- PostgreSQL 12+
- MinIO or AWS S3-compatible storage

**Production:**
- Container deployment via Docker Compose
- Database: PostgreSQL
- Object Storage: S3-compatible (MinIO or AWS)
- AI Services: OpenAI API
- RAG Service: RagFlow
- Web Crawler: Crawl4AI
- PDF Parser: MineRU

---

*Stack analysis: 2025-06-23*