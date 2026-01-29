import { auth } from "@/lib/auth";
import { chatService } from "@/lib/services/chat-service";
import { streamResponse } from "@/lib/helpers/responses";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  type IncomingMessage = {
    role: "user" | "assistant";
    content: string;
  };

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

    // Get the latest user message
    const userMessage = messages[messages.length - 1] as IncomingMessage;
    if (userMessage.role !== "user") {
      return new Response("Last message must be from user", { status: 400 });
    }

    // Optimize prompt for better RAG search
    const optimizedQuery = await chatService.optimizePrompt(userMessage.content);

    // Get or create chat session using service
    const title = newSession
      ? chatService.generateSessionTitle(messages as IncomingMessage[])
      : undefined;

    const chatSession = await chatService.getOrCreateSession(notebookId, {
      sessionId,
      newSession,
      title,
    });

    // Save user message to database
    await chatService.saveUserMessage(
      chatSession.id,
      notebookId,
      userMessage.content
    );

    // Update session last activity
    await chatService.updateSessionActivity(chatSession.id);

    // Call the LangGraph agent
    const agentResponse = await chatService.callAgent(
      datasetId,
      chatSession.id,
      optimizedQuery,
      messages as IncomingMessage[],
      session.user.id
    );

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
            await chatService.saveAssistantMessage(
              chatSession.id,
              notebookId,
              fullResponse
            );
          }

          controller.close();
        } catch (error) {
          console.error("Stream error:", error);
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";

          // Save error message
          await chatService.saveAssistantMessage(
            chatSession.id,
            notebookId,
            `Error: ${errorMsg}`,
            { error: true }
          );

          controller.enqueue(
            encoder.encode(`0:${JSON.stringify(`Error: ${errorMsg}`)}\n`)
          );
          controller.enqueue(encoder.encode(`d:{"finishReason":"error"}\n`));
          controller.close();
        }
      },
    });

    return streamResponse(stream);
  } catch (error) {
    console.error("Chat API error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
