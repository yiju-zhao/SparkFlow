# SparkFlow

[![Version](https://img.shields.io/badge/version-0.4.0--beta-blue.svg)](https://github.com/yiju-zhao/SparkFlow)

AI-powered research notebook with RAG (Retrieval-Augmented Generation) capabilities.

## Architecture

```
SparkFlow/
├── apps/
│   ├── web/          # Next.js 15 frontend (port 3001)
│   └── agent/        # LangGraph dev server (port 2024)
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
- **Framework**: LangGraph Dev Server (LangGraph CLI)
- **AI**: LangGraph, LangChain, OpenAI
- **RAG**: RagFlow SDK integration

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
langgraph dev --host 0.0.0.0 --port 2024
```

4. **Access the app**
- Frontend: http://localhost:3001
- LangGraph API: http://localhost:2024

## Environment Variables

### Frontend (`apps/web/.env.local`)

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXTAUTH_SECRET` | JWT secret for auth | (required) |
| `NEXTAUTH_URL` | App URL | `http://localhost:3001` |
| `DATABASE_URL` | PostgreSQL connection | (required) |
| `NEXT_PUBLIC_LANGGRAPH_API_URL` | LangGraph server URL | `http://localhost:2024` |
| `RAGFLOW_BASE_URL` | RagFlow API URL | `http://localhost:9380` |
| `RAGFLOW_API_KEY` | RagFlow API key | (optional) |

### Backend (`apps/agent/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | (required) |
| `GOOGLE_API_KEY` | Google API key | (optional) |
| `RAGFLOW_BASE_URL` | RagFlow API URL | `http://localhost:9380` |
| `RAGFLOW_API_KEY` | RagFlow API key | (optional) |

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
