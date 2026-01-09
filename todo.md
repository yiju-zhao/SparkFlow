Refactor Agent: Python/LangGraph to TypeScript/LangChain

 Overview

 Migrate the RAG agent from Python/LangGraph (FastAPI backend) to TypeScript/LangChain.js (directly in Next.js API route). This eliminates the separate Python service and simplifies the architecture significantly.

 Current State:
 Frontend (Next.js) → Proxy API Route → FastAPI (Python) → LangGraph Agent → MCP Server (RAGFlow)

 Target State:
 Frontend (Next.js) → API Route (LangChain.js Agent) → MCP Server (RAGFlow)

 Design Decisions

 - Simplicity: Use createAgent built-in ReAct loop (no custom grading/planning prompts)
 - Model: GPT-5 (latest flagship)
 - Memory: PostgreSQL-backed persistence (survives restarts)

 Key Changes
 ┌─────────────────┬───────────────────────────────────┬──────────────────────────────┐
 │    Component    │         Current (Python)          │       New (TypeScript)       │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ Agent Framework │ LangGraph SparkFlowRAGAgent class │ LangChain.js createAgent()   │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ MCP Integration │ langchain-mcp-adapters (Python)   │ @langchain/mcp-adapters (JS) │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ Model           │ gpt-4o                            │ gpt-5                        │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ Runtime         │ FastAPI + uvicorn                 │ Next.js API route            │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ Memory          │ In-memory MemorySaver             │ PostgresSaver (persistent)   │
 ├─────────────────┼───────────────────────────────────┼──────────────────────────────┤
 │ Streaming       │ Custom SSE via FastAPI            │ LangChain streaming + AI SDK │
 └─────────────────┴───────────────────────────────────┴──────────────────────────────┘
 Implementation Steps

 Step 1: Install Dependencies

 cd apps/web
 npm install langchain @langchain/core @langchain/openai @langchain/langgraph @langchain/langgraph-checkpoint-postgres @langchain/mcp-adapters zod

 Step 2: Create Agent Module

 Create apps/web/lib/agent/index.ts:

 import { createAgent } from "langchain";
 import { MultiServerMCPClient } from "@langchain/mcp-adapters";
 import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

 const SYSTEM_PROMPT = `You are an assistant for question-answering tasks.
 Use the retrieval tools to search for relevant context before answering.
 If you don't know the answer, just say that you don't know.
 Be comprehensive, cite sources using [Document Name] format, and use markdown formatting.`;

 let checkpointer: PostgresSaver | null = null;

 async function getCheckpointer() {
   if (!checkpointer) {
     const dbUrl = process.env.DATABASE_URL!;
     checkpointer = PostgresSaver.fromConnString(dbUrl);
     await checkpointer.setup();
   }
   return checkpointer;
 }

 export async function createRAGAgent(mcpServerUrl: string) {
   const client = new MultiServerMCPClient({
     ragflow: {
       transport: "sse",
       url: mcpServerUrl,
     },
   });

   const tools = await client.getTools();
   const cp = await getCheckpointer();

   return createAgent({
     model: "gpt-5",
     tools,
     systemPrompt: SYSTEM_PROMPT,
     checkpointer: cp,
   });
 }

 Step 3: Update Chat API Route

 Rewrite apps/web/app/api/chat/route.ts:

 import { auth } from "@/lib/auth";
 import { createRAGAgent } from "@/lib/agent";
 import { NextRequest } from "next/server";

 const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:9382/mcp/";

 export async function POST(req: NextRequest) {
   const session = await auth();
   if (!session?.user?.id) {
     return new Response("Unauthorized", { status: 401 });
   }

   const { messages, sessionId } = await req.json();
   const agent = await createRAGAgent(MCP_SERVER_URL);

   const encoder = new TextEncoder();
   const stream = new ReadableStream({
     async start(controller) {
       try {
         const agentStream = await agent.stream(
           { messages },
           {
             configurable: { thread_id: sessionId || session.user.id },
             streamMode: "messages"
           }
         );

         for await (const [message] of agentStream) {
           if (message.text) {
             // Vercel AI SDK format
             const data = `0:${JSON.stringify(message.text)}\n`;
             controller.enqueue(encoder.encode(data));
           }
         }

         controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
         controller.close();
       } catch (error) {
         console.error("Agent stream error:", error);
         controller.error(error);
       }
     },
   });

   return new Response(stream, {
     headers: {
       "Content-Type": "text/plain; charset=utf-8",
       "X-Vercel-AI-Data-Stream": "v1",
     },
   });
 }

 Step 4: Environment Variables

 Ensure apps/web/.env.local has:
 OPENAI_API_KEY=your_openai_key
 MCP_SERVER_URL=http://localhost:9382/mcp/
 DATABASE_URL=postgresql://user:pass@localhost:5433/sparkflow

 Step 5: Remove Python Agent Service

 After verification:
 - Remove apps/agent/ directory
 - Update docker-compose.yml to remove agent service
 - Remove AGENT_API_URL environment variable

 Files to Modify/Create
 ┌────────────────────────────────┬───────────────────────────────────────────┐
 │              File              │                  Action                   │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ apps/web/package.json          │ Add LangChain dependencies                │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ apps/web/lib/agent/index.ts    │ Create - Agent factory with PostgresSaver │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ apps/web/app/api/chat/route.ts │ Rewrite with LangChain agent              │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ apps/web/.env.local            │ Ensure MCP_SERVER_URL set                 │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ apps/agent/                    │ Delete after migration verified           │
 ├────────────────────────────────┼───────────────────────────────────────────┤
 │ docker-compose.yml             │ Remove agent service                      │
 └────────────────────────────────┴───────────────────────────────────────────┘
 Verification

 1. Checkpointer Setup: Run agent once to create checkpoint tables in PostgreSQL
 2. Integration Test:
   - Start RAGFlow MCP server locally
   - Send chat request via curl: curl -X POST http://localhost:3001/api/chat -d '{"messages":[{"role":"user","content":"test"}]}'
   - Verify streaming response
 3. Memory Test:
   - Send message mentioning your name
   - In new request with same sessionId, ask "what's my name?"
   - Verify agent remembers
 4. E2E Test:
   - Use chat panel in browser
   - Ask questions that trigger RAG retrieval
   - Verify citations and markdown formatting