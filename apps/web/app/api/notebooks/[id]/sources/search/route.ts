import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { v4 as uuidv4 } from "uuid";
import type { SearchRequest, SearchResult, SearchStatusResponse } from "@/lib/types/search";
import { searchWechatArticles } from "@/lib/services/wechat-client";
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
    select: {
      searchModelProvider: true,
      searchModelName: true,
      wechatExcludedSourceIds: true,
    },
  });
  const searchModelProvider = userSettings?.searchModelProvider || modelsConfig.defaults.provider;
  const searchModelName = userSettings?.searchModelName || modelsConfig.defaults.searchModel;

  const taskId = uuidv4();
  searchTasks.set(taskId, {
    status: "searching",
    results: [],
    notebookId,
  });

  const wechatExcludedSourceIds = userSettings?.wechatExcludedSourceIds || [];

  // Fire search in background
  performSearch(
    taskId,
    query,
    sourceType,
    domains,
    searchModelProvider,
    searchModelName,
    wechatExcludedSourceIds,
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
  query: string,
  sourceType: string,
  domains?: string[],
  modelProvider?: string,
  modelName?: string,
  wechatExcludedSourceIds: number[] = [],
) {
  const task = searchTasks.get(taskId);
  if (!task) return;

  try {
    let results: SearchResult[] = [];

    if (sourceType === "web") {
      // Call LangGraph agent for web search
      const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
      const response = await fetch(`${agentUrl}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistant_id: "agent",
          input: {
            messages: [
              {
                role: "user",
                content: JSON.stringify({
                  action: "search",
                  query,
                  sourceType: "web",
                  domains: domains || [],
                }),
              },
            ],
          },
          config: {
            configurable: {
              search_mode: true,
              model_provider: modelProvider,
              model_name: modelName,
            },
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const lastMessage = data?.output?.messages?.slice(-1)?.[0];
        if (lastMessage?.content) {
          try {
            const parsed = JSON.parse(lastMessage.content);
            if (Array.isArray(parsed)) {
              results = parsed.map((r: any) => ({
                id: r.url || r.id || uuidv4(),
                title: r.title || "Untitled",
                snippet: r.content || r.snippet || "",
                meta:
                  new URL(r.url || "").hostname +
                  (r.published_date ? ` · ${r.published_date}` : ""),
                url: r.url,
                sourceType: "web" as const,
              }));
            }
          } catch {
            // Agent returned non-JSON, skip
          }
        }
      }
    } else if (sourceType === "publication") {
      // Search SparkFlow publications via Prisma
      const publications = await prisma.publication.findMany({
        where: {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { abstract: { contains: query, mode: "insensitive" } },
          ],
        },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { instance: { include: { venue: true } } },
      });

      results = publications.map((pub) => ({
        id: pub.id,
        title: pub.title,
        snippet: pub.abstract?.slice(0, 200) || "",
        meta: [pub.instance?.venue?.name, pub.authors?.slice(0, 3).join(", ")]
          .filter(Boolean)
          .join(" · "),
        url: pub.pdfUrl || undefined,
        sourceType: "publication" as const,
      }));
    } else if (sourceType === "wechat") {
      // Search WeChat articles via external DB
      const articles = await searchWechatArticles(query, 10, wechatExcludedSourceIds);

      results = articles.map((article) => ({
        id: String(article.id),
        title: article.title,
        snippet: article.content_text?.slice(0, 200) || "",
        meta: [
          "WeChat",
          article.source_name || article.author,
          article.publish_time ? new Date(article.publish_time).toLocaleDateString() : null,
        ]
          .filter(Boolean)
          .join(" · "),
        url: article.original_url || undefined,
        sourceType: "wechat" as const,
      }));
    }

    task.results = results;
    task.status = "completed";
  } catch (err) {
    task.status = "failed";
    task.error = err instanceof Error ? err.message : "Search failed";
  }
}
