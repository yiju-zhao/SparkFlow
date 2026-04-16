import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import type { SearchRequest, SearchResult, SearchStatusResponse } from "@/lib/types/search";
import { getWikiContextForSearch } from "@/lib/services/wiki-context";
import modelsConfig from "@/config/models.json";

// In-memory task store (sufficient for single-server)
export const searchTasks = new Map<string, SearchStatusResponse & { notebookId: string }>();

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });
  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const body = (await req.json()) as SearchRequest;
  const { query, sourceType, domains } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Fetch user's search model preference
  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { searchModelProvider: true, searchModelName: true },
  });
  const searchModelProvider = userSettings?.searchModelProvider || modelsConfig.defaults.provider;
  const searchModelName = userSettings?.searchModelName || modelsConfig.defaults.searchModel;

  const taskId = uuidv4();
  searchTasks.set(taskId, {
    status: "searching",
    results: [],
    notebookId,
  });

  // Fire search in background
  performSearch(
    taskId,
    notebookId,
    query,
    sourceType,
    domains,
    searchModelProvider,
    searchModelName,
  ).catch((err) => {
    console.error(`[Search] Task ${taskId} failed:`, err);
    const task = searchTasks.get(taskId);
    if (task) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : "Search failed";
    }
  });

  return NextResponse.json({ taskId });
}

async function performSearch(
  taskId: string,
  notebookId: string,
  query: string,
  sourceType: string,
  domains?: string[],
  modelProvider?: string,
  modelName?: string,
) {
  const task = searchTasks.get(taskId);
  if (!task) return;

  try {
    // Fetch wiki context for the notebook (domain awareness)
    const wikiContext = await getWikiContextForSearch(notebookId);

    // Call the search agent for all source types
    const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
    const response = await fetch(`${agentUrl}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: "search",
        input: {
          messages: [{ role: "user", content: query }],
          iteration: 0,
        },
        config: {
          configurable: {
            source_type: sourceType,
            domains: domains || [],
            wiki_context: wikiContext,
            model_provider: modelProvider,
            model_name: modelName,
          },
        },
      }),
    });

    let results: SearchResult[] = [];

    if (response.ok) {
      const data = await response.json();
      // The agent's last message should be a JSON array of results
      const lastMessage = data?.output?.messages?.slice(-1)?.[0];
      const content = typeof lastMessage === "string" ? lastMessage : lastMessage?.content;
      if (content) {
        try {
          // Strip markdown code fences if the LLM wrapped them
          const cleaned = content
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/i, "")
            .trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            results = parsed.map((r: Record<string, unknown>) => ({
              id: (r.id as string | undefined) || (r.url as string | undefined) || "",
              title: (r.title as string | undefined) || "Untitled",
              snippet: (r.snippet as string | undefined) || "",
              meta: (r.meta as string | undefined) || "",
              url: (r.url as string | undefined) || undefined,
              sourceType: sourceType as SearchResult["sourceType"],
            }));
          }
        } catch {
          // Agent returned non-JSON, leave results empty
        }
      }
    }

    task.results = results;
    task.status = "completed";
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Search failed";
  }
}
