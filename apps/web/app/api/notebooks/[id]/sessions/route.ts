import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/notebooks/[id]/sessions - List chat sessions
export async function GET(req: NextRequest, context: RouteContext) {
  const { id: notebookId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  const sessions = await prisma.chatSession.findMany({
    where: { notebookId },
    include: {
      _count: { select: { messages: true } },
    },
    orderBy: { lastActivity: "desc" },
  });

  return NextResponse.json(sessions);
}

// POST /api/notebooks/[id]/sessions - Create a chat session
export async function POST(req: NextRequest, context: RouteContext) {
  const { id: notebookId } = await context.params;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    return NextResponse.json({ error: "Notebook not found" }, { status: 404 });
  }

  try {
    const { title, id, ragflowAgentId } = await req.json();
    const sessionId = id || randomUUID();

    const chatSession = await prisma.chatSession.create({
      data: {
        id: sessionId,
        notebookId,
        title: title?.trim() || "New Chat",
        status: "ACTIVE",
        ragflowAgentId: ragflowAgentId || sessionId,
      },
    });

    return NextResponse.json(chatSession, { status: 201 });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { error: "Failed to create session" },
      { status: 500 }
    );
  }
}

