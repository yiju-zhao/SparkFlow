# SparkFlow

AI-powered research notebook with RAG (Retrieval-Augmented Generation) capabilities.

## Architecture

```
SparkFlow/
├── apps/
│   ├── web/          # Next.js 15 frontend (port 3001)
│   └── agent/        # FastAPI backend with LangGraph (port 8101)
└── todo.md           # Migration tracking
```

## Tech Stack

### Frontend (`apps/web`)
- **Framework**: Next.js 15 with App Router
- **UI**: Tailwind CSS v4, Shadcn/UI, Framer Motion
- **Auth**: NextAuth.js v5 with JWT
- **Database**: PostgreSQL with Prisma ORM
- **Styling**: Huawei Design System tokens

### Backend (`apps/agent`)
- **Framework**: FastAPI
- **AI**: LangGraph, LangChain, OpenAI
- **RAG**: RagFlow MCP integration
- **Auth**: JWT validation (shared secret with NextAuth)

## Getting Started

### Prerequisites
- Node.js 18+
- Python 3.11+
- PostgreSQL
- RagFlow instance (optional, for RAG features)

### Setup

1. **Clone and install dependencies**

```bash
# Frontend
cd apps/web
npm install
cp .env.example .env.local
# Edit .env.local with your values

# Backend
cd apps/agent
python -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your values
```

2. **Setup database**

```bash
cd apps/web
npx prisma generate
npx prisma db push
```

3. **Start development servers**

```bash
# Terminal 1: Frontend (port 3001)
cd apps/web
npm run dev

# Terminal 2: Backend (port 8101)
cd apps/agent
uvicorn app.main:app --reload --host 0.0.0.0 --port 8101
```

4. **Access the app**
- Frontend: http://localhost:3001
- Agent API: http://localhost:8101
- API Docs: http://localhost:8101/docs

## Environment Variables

### Frontend (`apps/web/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXTAUTH_SECRET` | JWT secret for auth | (required) |
| `NEXTAUTH_URL` | App URL | `http://localhost:3001` |
| `DATABASE_URL` | PostgreSQL connection | (required) |
| `AGENT_API_URL` | FastAPI server URL | `http://localhost:8101` |
| `RAGFLOW_BASE_URL` | RagFlow API URL | `http://localhost:9380` |
| `RAGFLOW_API_KEY` | RagFlow API key | (optional) |

### Backend (`apps/agent/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `GOOGLE_API_KEY` | Google API key | (optional) |
| `MCP_SERVER_URL` | RagFlow MCP URL | `http://localhost:9382/mcp/` |
| `JWT_SECRET` | Same as `NEXTAUTH_SECRET` | (required) |
| `HOST` | Server host | `0.0.0.0` |
| `PORT` | Server port | `8101` |

## Features

- **Notebooks**: Organize research into separate knowledge bases
- **Sources**: Upload documents (PDF, DOCX, TXT) or add webpages
- **Chat**: AI-powered Q&A with RAG retrieval
- **Notes**: Save insights with markdown support
- **Dark Mode**: System-aware theme switching

## Development

### Type Checking

```bash
cd apps/web
npx tsc --noEmit
```

### Linting

```bash
cd apps/web
npm run lint
```

## License

Private - All rights reserved.
