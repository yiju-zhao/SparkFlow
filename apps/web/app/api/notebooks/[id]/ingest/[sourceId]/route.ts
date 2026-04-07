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
    const agentUrl = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

    const res = await fetch(`${agentUrl}/wiki/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        notebook_id: notebookId,
        source_id: sourceId,
        source_title: source.title,
        source_content: content,
        wiki_schema: source.notebook.wikiSchema || {},
        sparkflow_api_url: process.env.NEXTAUTH_URL || "http://localhost:3001",
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`Agent ingest failed: ${res.status} ${error}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Ingest failed";
    console.error("Wiki ingest failed:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
