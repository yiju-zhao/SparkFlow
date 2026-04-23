import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import type { SearchRequest, SearchResult, SearchStatusResponse } from "@/lib/types/search";
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
    // Call the search workflow endpoint for all source types
    const workflowsUrl = process.env.WORKFLOWS_API_URL || "http://localhost:2027";
    const response = await fetch(`${workflowsUrl}/v1/workflows/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        source_type: sourceType,
        notebook_id: notebookId,
        domains: domains || [],
        model_provider: modelProvider || "openai",
        model_name: modelName || "gpt-4o-mini",
        top_k: 10,
      }),
    });

    let results: SearchResult[] = [];

    if (response.ok) {
      const data = await response.json();
      // The workflow returns { items, reasons } directly (no streaming, no langgraph envelope)
      const items = data?.items || [];
      const reasons = data?.reasons || {};

      if (Array.isArray(items)) {
        results = items.map((item: Record<string, unknown>) => ({
          id: (item.id as string | undefined) || (item.url as string | undefined) || "",
          title: (item.title as string | undefined) || "Untitled",
          snippet: (item.snippet as string | undefined) || (item.content as string | undefined) || "",
          meta: reasons[(item.id as string) || (item.url as string) || ""] || (item.meta as string | undefined) || "",
          url: (item.url as string | undefined) || undefined,
          sourceType: sourceType as SearchResult["sourceType"],
        }));
      }
    }

    task.results = results;
    task.status = "completed";
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Search failed";
  }
}
