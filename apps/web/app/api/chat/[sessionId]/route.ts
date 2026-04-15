import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

interface RouteParams {
  params: Promise<{ sessionId: string }>;
}

function getLangGraphApiUrl(): string | null {
  return process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || null;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resolvedParams = await params;
  const { sessionId } = resolvedParams;

  if (!sessionId) {
    return new Response("sessionId is required", { status: 400 });
  }

  try {
    // Verify session belongs to user (via notebook -> user)
    // Or just check if user has access to notebook.
    // Simplified check: Access if session exists and user owns notebook or is shared?
    // Assuming owner for now.
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        notebook: {
          select: { userId: true },
        },
      },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (chatSession.notebook.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    const messages = await prisma.chatMessage.findMany({
      where: { sessionId },
      orderBy: { messageOrder: "asc" },
      select: {
        id: true,
        sender: true,
        content: true,
        createdAt: true,
      },
    });

    // Transform for frontend
    const formattedMessages = messages.map(
      (msg: { id: string; sender: string; content: string; createdAt: Date }) => ({
        id: msg.id,
        role: msg.sender === "USER" ? "user" : "assistant",
        content: msg.content,
        createdAt: msg.createdAt,
      }),
    );

    return NextResponse.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching chat history:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resolvedParams = await params;
  const { sessionId } = resolvedParams;

  if (!sessionId) {
    return new Response("sessionId is required", { status: 400 });
  }

  try {
    // Verify ownership
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        notebook: { select: { userId: true } },
      },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (chatSession.notebook.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    // Clear agent memory for this session
    try {
      const langGraphUrl = getLangGraphApiUrl();
      if (langGraphUrl) {
        await fetch(`${langGraphUrl}/threads/${sessionId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${session.user.id}`,
          },
        });
      } else {
        console.warn(
          "Skipping agent memory cleanup because NEXT_PUBLIC_LANGGRAPH_API_URL is not configured.",
        );
      }
    } catch (agentError) {
      // Log but don't fail - agent memory cleanup is best-effort
      console.warn("Failed to clear agent memory:", agentError);
    }

    // Delete session (messages cascade delete via schema)
    await prisma.chatSession.delete({
      where: { id: sessionId },
    });

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Error deleting chat session:", error);
    return new Response("Internal server error", { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const resolvedParams = await params;
  const { sessionId } = resolvedParams;

  if (!sessionId) {
    return new Response("sessionId is required", { status: 400 });
  }

  try {
    const { langgraphThreadId } = await req.json();

    if (!langgraphThreadId) {
      return new Response("langgraphThreadId is required", {
        status: 400,
      });
    }

    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: { notebook: { select: { userId: true } } },
    });

    if (!chatSession) {
      return new Response("Session not found", { status: 404 });
    }

    if (chatSession.notebook.userId !== session.user.id) {
      return new Response("Unauthorized", { status: 403 });
    }

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { langgraphThreadId },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Error updating session:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
