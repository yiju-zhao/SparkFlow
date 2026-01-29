import prisma from "@/lib/prisma";
import { promptOptimizer } from "@/lib/prompt-optimizer";
import { getNextMessageOrder } from "@/lib/utils/message-utils";
import { randomUUID } from "crypto";
import type { ChatSession, ChatMessage } from "@prisma/client";

interface GetOrCreateSessionOptions {
  sessionId?: string;
  newSession?: boolean;
  title?: string;
}

class ChatService {
  /**
   * Get or create a chat session for a notebook.
   */
  async getOrCreateSession(
    notebookId: string,
    options?: GetOrCreateSessionOptions
  ): Promise<ChatSession> {
    const { sessionId, newSession, title } = options || {};

    if (newSession) {
      // Create a brand new session
      const newId = sessionId || randomUUID();
      return prisma.chatSession.create({
        data: {
          id: newId,
          notebookId,
          title: title || "New Chat",
          status: "ACTIVE",
          ragflowAgentId: newId,
        },
      });
    }

    if (sessionId) {
      // Use specified session
      const session = await prisma.chatSession.findUnique({
        where: { id: sessionId },
      });
      if (!session) {
        throw new Error("Session not found");
      }
      // Backfill ragflowAgentId if missing
      if (!session.ragflowAgentId) {
        return prisma.chatSession.update({
          where: { id: session.id },
          data: { ragflowAgentId: session.id },
        });
      }
      return session;
    }

    // Resume or create default session
    let session = await prisma.chatSession.findFirst({
      where: { notebookId, status: "ACTIVE" },
      orderBy: { lastActivity: "desc" },
    });

    if (!session) {
      const newId = randomUUID();
      session = await prisma.chatSession.create({
        data: {
          id: newId,
          notebookId,
          title: "Chat",
          status: "ACTIVE",
          ragflowAgentId: newId,
        },
      });
    } else if (!session.ragflowAgentId) {
      session = await prisma.chatSession.update({
        where: { id: session.id },
        data: { ragflowAgentId: session.id },
      });
    }

    return session;
  }

  /**
   * Save a user message to the database.
   */
  async saveUserMessage(
    sessionId: string,
    notebookId: string,
    content: string
  ): Promise<ChatMessage> {
    const messageOrder = await getNextMessageOrder(sessionId);
    return prisma.chatMessage.create({
      data: {
        sessionId,
        notebookId,
        sender: "USER",
        content,
        messageOrder,
      },
    });
  }

  /**
   * Save an assistant message to the database.
   */
  async saveAssistantMessage(
    sessionId: string,
    notebookId: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<ChatMessage> {
    const messageOrder = await getNextMessageOrder(sessionId);
    return prisma.chatMessage.create({
      data: {
        sessionId,
        notebookId,
        sender: "ASSISTANT",
        content,
        messageOrder,
        ...(metadata && { metadata: metadata as object }),
      },
    });
  }

  /**
   * Update session last activity timestamp.
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    await prisma.chatSession.update({
      where: { id: sessionId },
      data: { lastActivity: new Date() },
    });
  }

  /**
   * Optimize a user prompt for better RAG search.
   */
  async optimizePrompt(content: string): Promise<string> {
    return promptOptimizer.optimize(content);
  }

  /**
   * Generate a session title from a message.
   */
  generateSessionTitle(content: string): string {
    if (!content) return "New Chat";
    const title = content.trim();
    return title.length > 50 ? `${title.substring(0, 50)}...` : title;
  }
}

export const chatService = new ChatService();
export { ChatService };
export type { GetOrCreateSessionOptions };
