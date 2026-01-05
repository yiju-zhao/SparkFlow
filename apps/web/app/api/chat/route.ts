import { auth } from "@/lib/auth";
import { NextRequest } from "next/server";

const AGENT_API_URL = process.env.AGENT_API_URL || "http://localhost:8101";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { messages, notebookId, sessionId, datasetIds, documentIds } = body;

    // Get the latest user message
    const latestMessage = messages[messages.length - 1];
    if (!latestMessage || latestMessage.role !== "user") {
      return new Response("Invalid message format", { status: 400 });
    }

    // Build request for FastAPI
    const agentRequest = {
      notebook_id: notebookId,
      session_id: sessionId,
      message: latestMessage.content,
      messages: messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role,
        content: m.content,
      })),
      dataset_ids: datasetIds || [],
      document_ids: documentIds || [],
    };

    // For now, create a simple streaming response
    // TODO: Connect to actual FastAPI endpoint with proper JWT
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Placeholder: simulate a response
          // TODO: Connect to FastAPI at ${AGENT_API_URL}/api/chat
          const response =
            "I understand you're asking about: " +
            latestMessage.content +
            "\n\nThis is a placeholder response. The chat will be connected to the FastAPI RAG agent once the environment is configured.";

          // Stream the response character by character (simulating streaming)
          for (let i = 0; i < response.length; i += 5) {
            const chunk = response.slice(i, i + 5);
            // Use Vercel AI SDK data stream format
            const data = `0:${JSON.stringify(chunk)}\n`;
            controller.enqueue(encoder.encode(data));
            await new Promise((resolve) => setTimeout(resolve, 20));
          }

          // Signal completion
          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          controller.error(error);
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
