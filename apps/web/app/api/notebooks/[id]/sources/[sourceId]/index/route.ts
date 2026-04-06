import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST: Trigger PageIndex indexing for a source.
 * Called after source processing is complete (status = READY).
 * Calls the Python agent's indexing endpoint.
 */
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
    include: { notebook: { select: { userId: true } } },
  });

  if (!source || source.notebook.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!source.markdownContent && !source.content) {
    return NextResponse.json(
      { error: "Source has no content to index" },
      { status: 400 }
    );
  }

  try {
    const agentUrl =
      process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";
    const content = source.markdownContent || source.content || "";

    const res = await fetch(`${agentUrl}/index`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source_id: sourceId,
        content,
        title: source.title,
        source_type: source.sourceType,
      }),
    });

    if (!res.ok) {
      throw new Error(`Agent indexing failed: ${res.status}`);
    }

    const indexData = await res.json();

    await prisma.source.update({
      where: { id: sourceId },
      data: { indexData },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Indexing failed";

    await prisma.source.update({
      where: { id: sourceId },
      data: {
        status: "PARTIAL",
        errorMessage: `Indexing failed: ${errorMessage}`,
      },
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
