import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/notebooks/[id]/messages
 *
 * Fetch chat messages for a notebook.
 * Returns messages from the active chat session, ordered by messageOrder.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  try {
    // Verify user owns this notebook
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: session.user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
    }

    // Get the active chat session
    const chatSession = await prisma.chatSession.findFirst({
      where: {
        notebookId,
        status: "ACTIVE",
      },
      orderBy: { lastActivity: "desc" },
    });

    if (!chatSession) {
      // No chat session yet - return empty array
      return NextResponse.json({ messages: [] });
    }

    // Fetch messages
    const messages = await prisma.chatMessage.findMany({
      where: { sessionId: chatSession.id },
      orderBy: { messageOrder: "asc" },
      select: {
        id: true,
        sender: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
    });

    // Transform to frontend format
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      role: msg.sender.toLowerCase() as "user" | "assistant",
      content: msg.content,
      metadata: msg.metadata,
      createdAt: msg.createdAt.toISOString(),
    }));

    return NextResponse.json({ messages: formattedMessages });
  } catch (error) {
    console.error("Fetch messages error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/notebooks/[id]/messages
 *
 * Clear chat history for a notebook.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: notebookId } = await params;

  try {
    // Verify user owns this notebook
    const notebook = await prisma.notebook.findFirst({
      where: {
        id: notebookId,
        userId: session.user.id,
      },
    });

    if (!notebook) {
      return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
    }

    // Delete all messages for this notebook
    await prisma.chatMessage.deleteMany({
      where: { notebookId },
    });

    // Close existing sessions and create a fresh one
    await prisma.chatSession.updateMany({
      where: { notebookId, status: "ACTIVE" },
      data: { status: "CLOSED", endedAt: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Clear messages error:", error);
    return NextResponse.json(
      { error: "Failed to clear messages" },
      { status: 500 }
    );
  }
}
