import { auth } from "@/lib/auth";
import { createRAGAgent } from "@/lib/agent";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const RAGFLOW_MCP_URL =
  process.env.RAGFLOW_MCP_URL || "http://localhost:9382/mcp/";

/**
 * Get or create the default chat session for a notebook.
 */
async function getOrCreateChatSession(notebookId: string) {
  // Try to find an active session
  let session = await prisma.chatSession.findFirst({
    where: {
      notebookId,
      status: "ACTIVE",
    },
    orderBy: { lastActivity: "desc" },
  });

  // Create one if none exists
  if (!session) {
    session = await prisma.chatSession.create({
      data: {
        notebookId,
        title: "Chat",
        status: "ACTIVE",
      },
    });
  }

  return session;
}

/**
 * Get the next message order for a session.
 */
async function getNextMessageOrder(sessionId: string): Promise<number> {
  const lastMessage = await prisma.chatMessage.findFirst({
    where: { sessionId },
    orderBy: { messageOrder: "desc" },
    select: { messageOrder: true },
  });
  return (lastMessage?.messageOrder ?? -1) + 1;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { messages, notebookId, datasetIds, documentIds } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid message format", { status: 400 });
    }

    if (!notebookId) {
      return new Response("notebookId is required", { status: 400 });
    }

    if (!datasetIds || !Array.isArray(datasetIds) || datasetIds.length === 0) {
      return new Response("datasetIds is required", { status: 400 });
    }

    // Get or create chat session for this notebook
    const chatSession = await getOrCreateChatSession(notebookId);

    // Get the latest user message
    const userMessage = messages[messages.length - 1];
    if (userMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    // Save user message to database
    const userMsgOrder = await getNextMessageOrder(chatSession.id);
    await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        notebookId,
        sender: "USER",
        content: userMessage.content,
        messageOrder: userMsgOrder,
      },
    });

    // Update session last activity
    await prisma.chatSession.update({
      where: { id: chatSession.id },
      data: { lastActivity: new Date() },
    });

    // Create agent
    const agent = await createRAGAgent({
      ragflowMcpUrl: RAGFLOW_MCP_URL,
      datasetIds,
      documentIds,
    });

    // Collect full response for saving
    let fullResponse = "";

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const agentStream = await agent.stream(
            { messages },
            {
              configurable: { thread_id: notebookId },
              streamMode: "messages",
            }
          );

          for await (const [message] of agentStream) {
            if (message.text) {
              fullResponse += message.text;
              // Vercel AI SDK data stream format
              const data = `0:${JSON.stringify(message.text)}\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          // Save assistant message to database
          const assistantMsgOrder = await getNextMessageOrder(chatSession.id);
          await prisma.chatMessage.create({
            data: {
              sessionId: chatSession.id,
              notebookId,
              sender: "ASSISTANT",
              content: fullResponse,
              messageOrder: assistantMsgOrder,
            },
          });

          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
        } catch (error) {
          console.error("Agent stream error:", error);
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";

          // Save error message
          const assistantMsgOrder = await getNextMessageOrder(chatSession.id);
          await prisma.chatMessage.create({
            data: {
              sessionId: chatSession.id,
              notebookId,
              sender: "ASSISTANT",
              content: `Error: ${errorMsg}`,
              messageOrder: assistantMsgOrder,
              metadata: { error: true },
            },
          });

          controller.enqueue(
            encoder.encode(`0:${JSON.stringify(`Error: ${errorMsg}`)}\n`)
          );
          controller.enqueue(encoder.encode(`d:{"finishReason":"error"}\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Vercel-AI-Data-Stream": "v1",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
