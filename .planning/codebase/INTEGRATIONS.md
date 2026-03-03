# External Integrations

**Analysis Date:** 2025-06-23

## APIs & External Services

**AI/ML Providers:**
- OpenAI - LLM inference (gpt-4, text-embedding-3-small)
  - SDK: openai ^6.17.0
  - Auth: OPENAI_API_KEY env var

**RAG Services:**
- RagFlow - Document chunking, indexing, retrieval
  - SDK: Custom ragflow-client (apps/web/lib/ragflow-client.ts), ragflow-sdk
  - Endpoint: http://localhost:9380 (default)
  - Auth: RAGFLOW_API_KEY env var
  - Features: Dataset management, document upload, chunk retrieval

**Document Processing:**
- Crawl4AI - Webpage-to-markdown conversion
  - Endpoint: http://localhost:11235 (default)
  - Auth: API key (CRAWL4AI_API_KEY)
  - Used in: webpage-processor.ts

- MineRU - PDF parsing and image extraction
  - Endpoint: http://localhost:8000 (default)
  - Used in: pdf-processor.ts for extracting text and images

**Data Storage**

**Databases:**
- PostgreSQL - Primary database
  - Connection: DATABASE_URL env var
  - Client: Prisma ORM with @prisma/client
  - Models: User, Notebook, Source, Chunk, ChatSession, ChatMessage

**File Storage:**
- MinIO - S3-compatible object storage
  - Endpoint: http://localhost:9002 (default)
  - Client: @aws-sdk/client-s3
  - Bucket: sparkflow-images (default)
  - Used for: Images extracted from PDFs

**Caching:**
- None detected (uses database caching via Prisma)

## Authentication & Identity

**Auth Provider:**
- NextAuth.js 5 - Custom authentication implementation
  - Implementation: Server actions, sessions
  - Strategy: JWT-based
  - Environment: NEXTAUTH_SECRET, NEXTAUTH_URL

## Monitoring & Observability

**Error Tracking:**
- Not detected in configuration

**Logs:**
- Console logging in applications
- Docker Compose logs for infrastructure services

## CI/CD & Deployment

**Hosting:**
- Local development: Docker Compose
- Production: Not specified (containers likely)

**CI Pipeline:**
- Not detected in configuration

## Environment Configuration

**Required env vars:**
- NEXTAUTH_SECRET - JWT secret
- NEXTAUTH_URL - NextAuth callback URL
- DATABASE_URL - PostgreSQL connection string
- S3_ENDPOINT - MinIO endpoint
- S3_ACCESS_KEY - MinIO access key
- S3_SECRET_KEY - MinIO secret key
- S3_BUCKET_NAME - Storage bucket name
- OPENAI_API_KEY - OpenAI API key
- RAGFLOW_BASE_URL - RagFlow endpoint
- RAGFLOW_API_KEY - RagFlow API key
- NEXT_PUBLIC_LANGGRAPH_API_URL - LangGraph server URL
- CRAWL4AI_BASE_URL - Crawl4AI endpoint
- MINERU_BASE_URL - MineRU endpoint

**Secrets location:**
- .env files in apps/web/ and apps/agent/
- Not committed to version control

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

---

*Integration audit: 2025-06-23*