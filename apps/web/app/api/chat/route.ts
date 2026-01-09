import { auth } from "@/lib/auth";
import { createRAGAgent } from "@/lib/agent";
import { NextRequest } from "next/server";

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:9382/mcp/";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const body = await req.json();
    const { messages, sessionId } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response("Invalid message format", { status: 400 });
    }

    const agent = await createRAGAgent(MCP_SERVER_URL);

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const agentStream = await agent.stream(
            { messages },
            {
              configurable: { thread_id: sessionId || session.user!.id },
              streamMode: "messages",
            }
          );

          for await (const [message] of agentStream) {
            if (message.text) {
              // Vercel AI SDK data stream format
              const data = `0:${JSON.stringify(message.text)}\n`;
              controller.enqueue(encoder.encode(data));
            }
          }

          controller.enqueue(encoder.encode(`d:{"finishReason":"stop"}\n`));
          controller.close();
        } catch (error) {
          console.error("Agent stream error:", error);
          const errorMsg = error instanceof Error ? error.message : "Unknown error";
          controller.enqueue(encoder.encode(`0:${JSON.stringify(`Error: ${errorMsg}`)}\n`));
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
