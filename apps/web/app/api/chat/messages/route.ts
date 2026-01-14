import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

type IncomingMessage = {
  sender: "USER" | "ASSISTANT";
  content: string;
  metadata?: Record<string, unknown>;
};

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { sessionId, notebookId, messages } = body;

    if (!sessionId) {
      return new Response("sessionId is required", { status: 400 });
    }

    if (!notebookId) {
      return new Response("notebookId is required", { status: 400 });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response("messages array is required", { status: 400 });
    }

    // Verify ownership via notebook relationship
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        notebook: {
          select: { id: true, userId: true },
        },
      },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (
      chatSession.notebookId !== notebookId ||
      chatSession.notebook.userId !== session.user.id
    ) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Find the next message order
    const lastMessage = await prisma.chatMessage.findFirst({
      where: { sessionId },
      orderBy: { messageOrder: "desc" },
      select: { messageOrder: true },
    });

    let nextOrder = (lastMessage?.messageOrder ?? -1) + 1;

    const createdMessages = await prisma.$transaction(
      (messages as IncomingMessage[]).map((msg) =>
        prisma.chatMessage.create({
          data: {
            sessionId,
            notebookId,
            sender: msg.sender,
            content: msg.content,
            metadata: msg.metadata
              ? JSON.parse(JSON.stringify(msg.metadata))
              : undefined,
            messageOrder: nextOrder++,
          },
        })
      )
    );

    // Update last activity timestamp
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastActivity: new Date() },
    });

    return NextResponse.json({ messages: createdMessages }, { status: 201 });
  } catch (error) {
    console.error("Save messages error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
