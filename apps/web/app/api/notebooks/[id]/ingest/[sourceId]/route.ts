import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; sourceId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId, sourceId } = await params;

  const source = await prisma.source.findUnique({
    where: { id: sourceId },
    include: { notebook: { select: { userId: true, wikiSchema: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const content = source.markdownContent || source.content;
  if (!content) {
    return NextResponse.json(
      { error: "Source has no content to ingest" },
      { status: 400 }
    );
  }

  try {
    const agentUrl =
      process.env.LANGGRAPH_API_URL ||
      process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
      "http://localhost:2024";

    // Step 1: Create a thread for the ingest conversation
    const threadRes = await fetch(`${agentUrl}/threads`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    if (!threadRes.ok) {
      throw new Error(`Failed to create thread: ${threadRes.status}`);
    }

    const thread = await threadRes.json();
    const threadId = thread.thread_id;

    // Step 2: Send ingest message to the agent via runs API
    // Truncate content if too long (keep first 30k chars for LLM context)
    const truncatedContent =
      content.length > 30000
        ? content.slice(0, 30000) + "\n\n[... content truncated for processing ...]"
        : content;

    const ingestMessage = `Please ingest this source into the wiki.

Source ID: ${sourceId}
Source Title: ${source.title}

---
${truncatedContent}
---

Read the current wiki index, then:
1. Create a summary page for this source
2. Create or update entity and concept pages as needed
3. Update the index page
4. Log the ingest`;

    const runRes = await fetch(`${agentUrl}/threads/${threadId}/runs/wait`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assistant_id: "agent",
        input: {
          messages: [{ role: "human", content: ingestMessage }],
        },
        context: {
          notebook_id: notebookId,
          wiki_schema: source.notebook.wikiSchema || {},
          model_provider: process.env.DEFAULT_MODEL_PROVIDER || "openai",
          model_name: process.env.DEFAULT_MODEL_NAME || "gpt-4o",
        },
      }),
    });

    if (!runRes.ok) {
      const errorText = await runRes.text();
      throw new Error(`Agent run failed: ${runRes.status} ${errorText}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Ingest failed";
    console.error("Wiki ingest failed:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
