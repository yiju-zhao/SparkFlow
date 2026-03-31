---
phase: quick
plan: 8
type: execute
wave: 1
depends_on: []
files_modified:
  - README.md
autonomous: true
requirements: [quick-8]

must_haves:
  truths:
    - "README accurately describes Next.js 16 + React 19 stack (not Next.js 15)"
    - "README lists all three apps (web, agent, matcher)"
    - "README documents all major features including Explore/Research Hub, Toolbox, generative UI, i18n"
    - "README documents all Docker services including MinerU"
    - "README includes a professional future roadmap section"
    - "README lists all three LangGraph agents (rag, rag_gemini, hub)"
  artifacts:
    - path: "README.md"
      provides: "Complete, accurate project documentation"
      min_lines: 120
  key_links: []
---

<objective>
Rewrite README.md to accurately reflect the current SparkFlow codebase state, including correct framework versions, all features, complete architecture, Docker services, and a professional future roadmap.

Purpose: The current README references Next.js 15, omits major features (Research Hub, Toolbox, generative UI, i18n), is missing apps/matcher, and lacks a roadmap. An accurate README is essential for onboarding and project presentation.
Output: Updated README.md
</objective>

<execution_context>
@/Users/eason/.claude/get-shit-done/workflows/execute-plan.md
@/Users/eason/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@README.md
@.claude/CLAUDE.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite README.md with accurate codebase state and roadmap</name>
  <files>README.md</files>
  <action>
Rewrite README.md completely. Use the following structure and content:

**Header:**
- Project name "SparkFlow" with version badge (0.5.0-beta)
- Tagline: AI-powered research platform with generative UI, RAG notebooks, and conference discovery
- Brief 2-3 sentence description highlighting the core value proposition: generative UI where AI creates dynamic interactive interfaces on demand

**Architecture:**
- Update ASCII tree to show all three apps: apps/web (Next.js 16, port 3001), apps/agent (LangGraph Python agents, port 2024), apps/matcher (standalone Python matcher service)
- Show key directories within apps/web: app/(app) routes, components, lib, prisma

**Tech Stack (two subsections):**
- Frontend: Next.js ^16.1.6, React ^19.2.4, TypeScript ^5, Tailwind CSS v4, Shadcn/UI, Framer Motion, CopilotKit (generative UI), next-intl (i18n: en/zh), Prisma ^7.3.0, NextAuth v5, ECharts + Recharts, Zod ^4.3.5, ExcelJS
- Backend: LangGraph Python agent service, LangChain, OpenAI + Google Gemini, RagFlow SDK, psycopg3

**AI Agents table:**
- rag_agent (graphs/rag_agent.py) - Document RAG queries via OpenAI
- rag_agent_gemini (graphs/rag_agent_gemini.py) - Document RAG queries via Gemini
- hub_agent (graphs/hub_agent.py) - Conference/session discovery with generative UI

**Features section (with brief descriptions):**
- DeepDive Notebooks: AI research notebooks with RAG-powered Q&A, document upload (PDF/DOCX/TXT), webpage ingestion, markdown notes
- Research Hub (Explore): Conference discovery with Overview, Conferences, Publications, Sessions views
- Generative UI: AI assistant creates dynamic tables and charts on demand via CopilotKit
- Toolbox: Query matching tool with Excel import, match history, S3 result storage
- Internationalization: English and Chinese via next-intl
- Admin Panel: Conference/venue/publication management
- Auth: NextAuth.js v5 with JWT, login/signup flows
- Dark Mode: System-aware theme switching

**Infrastructure / Docker Services table:**
| Service | Purpose | Port |
- PostgreSQL 17-alpine: Primary database | 5433
- MinIO: S3-compatible object storage | 9004/9005
- Crawl4AI: Webpage-to-markdown conversion | 9000
- RagFlow: RAG pipeline (chunking, retrieval) | 9380
- MinerU: PDF extraction service | (external)

**Getting Started section:**
- Prerequisites: Node.js 18+, Python 3.11+, Docker (for infrastructure services)
- Setup steps: clone, install deps (frontend npm install, backend pip install), copy .env.example files, docker compose up for infra, prisma generate + db push, start dev servers
- Access URLs: Frontend http://localhost:3001, LangGraph API http://localhost:2024

**Environment Variables section:**
- Frontend table: NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL, NEXT_PUBLIC_LANGGRAPH_API_URL, RAGFLOW_BASE_URL, RAGFLOW_API_KEY, S3_ENDPOINT, S3_ACCESS_KEY, S3_SECRET_KEY, S3_BUCKET
- Backend table: OPENAI_API_KEY, GOOGLE_API_KEY, RAGFLOW_BASE_URL, RAGFLOW_API_KEY

**Database Models section:**
- Brief list of key models: User, Notebook, Source, Chunk, ChatSession, ChatMessage, Note, Venue, Instance, Publication, ConferenceSession, MatchJob

**Development section:**
- Commands for type checking (npx tsc --noEmit), linting (npm run lint), prisma commands

**Roadmap section (professional, forward-looking):**
Use a clean format with phase indicators:
- Phase 1: Foundation and Data - COMPLETE - Core data models, admin panel, conference/publication management
- Phase 2: Research Hub - COMPLETE - Explore interface, generative UI components, AI-powered conference discovery
- Phase 3: Notebook Integration - PLANNED - Connect Research Hub discoveries to RAG notebook for deep analysis, source import flow from Hub to Notebook
- Phase 4: Polish and Enhancement - PLANNED - UI/UX refinement, performance optimization, extended i18n coverage

**License:** Private - All rights reserved.

Do NOT include emojis anywhere in the README. Use clean, professional markdown formatting throughout. Keep descriptions concise but informative.
  </action>
  <verify>
    <automated>head -5 README.md | grep -q "16" && grep -q "matcher" README.md && grep -q "Roadmap" README.md && grep -q "generative" README.md && grep -q "i18n\|Internationalization\|next-intl" README.md && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>README.md accurately reflects Next.js 16, all three apps (web/agent/matcher), all features (Research Hub, Toolbox, generative UI, i18n), all Docker services, all three agents, and includes a professional roadmap section</done>
</task>

</tasks>

<verification>
- README references Next.js 16 (not 15)
- All three apps listed in architecture
- All three LangGraph agents documented
- Features section covers: DeepDive, Research Hub, Generative UI, Toolbox, i18n, Admin, Auth, Dark Mode
- Docker services table includes PostgreSQL, MinIO, Crawl4AI, RagFlow, MinerU
- Roadmap section present with 4 phases
- No stale or incorrect information remains
</verification>

<success_criteria>
README.md is comprehensive, accurate, and professionally formatted. All current features, services, and architecture are documented. Future roadmap provides clear project direction.
</success_criteria>

<output>
After completion, create `.planning/quick/8-update-readme-file-based-on-current-code/8-SUMMARY.md`
</output>
