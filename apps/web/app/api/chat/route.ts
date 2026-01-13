import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { NextRequest } from "next/server";

const AGENT_API_URL =
  process.env.AGENT_API_URL || "http://localhost:8000";

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
    const { messages, notebookId, datasetId, sessionId, newSession } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid message format", { status: 400 });
    }

    if (!notebookId) {
      return new Response("notebookId is required", { status: 400 });
    }

    if (!datasetId) {
      return new Response("datasetId is required", { status: 400 });
    }

    // Determine which session to use
    let chatSession;
    if (newSession) {
      // Create a brand new session
      chatSession = await prisma.chatSession.create({
        data: {
          notebookId,
          title: "New Chat",
          status: "ACTIVE",
        },
      });
    } else if (sessionId) {
      // Use specified session
      chatSession = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!chatSession) {
        return new Response("Session not found", { status: 404 });
      }
    } else {
      // Resume or create default session
      chatSession = await getOrCreateChatSession(notebookId);
    }

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

    // Proxy request to FastAPI agent backend
    const agentResponse = await fetch(`${AGENT_API_URL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forward auth token for backend validation
        Authorization: `Bearer ${session.user.id}`,
      },
      body: JSON.stringify({
        dataset_id: datasetId,
        session_id: chatSession.id,
        message: userMessage.content,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role,
          content: m.content,
        })),
      }),
    });

    if (!agentResponse.ok) {
      const errorText = await agentResponse.text();
      console.error("Agent API error:", errorText);
      return new Response(`Agent error: ${errorText}`, {
        status: agentResponse.status,
      });
    }

    // Stream the response from the agent backend
    const agentBody = agentResponse.body;
    if (!agentBody) {
      return new Response("No response from agent", { status: 500 });
    }

    // Collect full response for saving to DB
    let fullResponse = "";
    const reader = agentBody.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Emit session ID first so frontend knows which session this is
          controller.enqueue(
            encoder.encode(`d:${JSON.stringify({ sessionId: chatSession.id })}\n`)
          );

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });

            // Parse SSE data to extract text for DB saving
            const lines = chunk.split("\n");
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data !== "[DONE]") {
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text" && parsed.text) {
                      fullResponse += parsed.text;
                    }
                  } catch {
                    // Not JSON, skip
                  }
                }
              }
            }

            // Forward to client in Vercel AI SDK format
            // Convert SSE text events to Vercel AI SDK format
            const convertedChunks: string[] = [];
            for (const line of lines) {
              if (line.startsWith("data: ")) {
                const data = line.slice(6);
                if (data === "[DONE]") {
                  convertedChunks.push(`d:{"finishReason":"stop"}\n`);
                } else {
                  try {
                    const parsed = JSON.parse(data);
                    if (parsed.type === "text" && parsed.text) {
                      convertedChunks.push(`0:${JSON.stringify(parsed.text)}\n`);
                    } else if (parsed.type === "error") {
                      convertedChunks.push(`0:${JSON.stringify(`Error: ${parsed.error}`)}\n`);
                    }
                  } catch {
                    // Not JSON, skip
                  }
                }
              }
            }

            if (convertedChunks.length > 0) {
              controller.enqueue(encoder.encode(convertedChunks.join("")));
            }
          }

          // Save assistant message to database
          if (fullResponse) {
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
          }

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
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
