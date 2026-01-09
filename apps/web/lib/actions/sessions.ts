"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function getSessions(notebookId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  return prisma.chatSession.findMany({
    where: { notebookId },
    include: {
      _count: { select: { messages: true } },
    },
    orderBy: { lastActivity: "desc" },
  });
}

export async function createSession(notebookId: string, title?: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  const chatSession = await prisma.chatSession.create({
    data: {
      notebookId,
      title: title?.trim() || "New Chat",
      status: "ACTIVE",
    },
  });

  revalidatePath(`/deepdive/${notebookId}`);
  return chatSession;
}

export async function getOrCreateActiveSession(notebookId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify notebook ownership
  const notebook = await prisma.notebook.findFirst({
    where: { id: notebookId, userId: session.user.id },
  });

  if (!notebook) {
    throw new Error("Notebook not found");
  }

  // Find existing active session
  let chatSession = await prisma.chatSession.findFirst({
    where: {
      notebookId,
      status: "ACTIVE",
    },
    orderBy: { lastActivity: "desc" },
  });

  // Create new if none exists
  if (!chatSession) {
    chatSession = await prisma.chatSession.create({
      data: {
        notebookId,
        title: "New Chat",
        status: "ACTIVE",
      },
    });
  }

  return chatSession;
}

export async function closeSession(sessionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { notebook: true },
  });

  if (!chatSession || chatSession.notebook.userId !== session.user.id) {
    throw new Error("Session not found");
  }

  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: {
      status: "CLOSED",
      endedAt: new Date(),
    },
  });

  revalidatePath(`/deepdive/${chatSession.notebookId}`);
  return updated;
}

export async function archiveSession(sessionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { notebook: true },
  });

  if (!chatSession || chatSession.notebook.userId !== session.user.id) {
    throw new Error("Session not found");
  }

  const updated = await prisma.chatSession.update({
    where: { id: sessionId },
    data: { status: "ARCHIVED" },
  });

  revalidatePath(`/deepdive/${chatSession.notebookId}`);
  return updated;
}

export async function updateSessionActivity(sessionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { notebook: true },
  });

  if (!chatSession || chatSession.notebook.userId !== session.user.id) {
    throw new Error("Session not found");
  }

  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { lastActivity: new Date() },
  });
}

export async function saveMessage(
  sessionId: string,
  notebookId: string,
  sender: "USER" | "ASSISTANT",
  content: string,
  metadata?: Record<string, unknown>
) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { notebook: true },
  });

  if (!chatSession || chatSession.notebook.userId !== session.user.id) {
    throw new Error("Session not found");
  }

  // Get next message order
  const lastMessage = await prisma.chatMessage.findFirst({
    where: { sessionId },
    orderBy: { messageOrder: "desc" },
  });

  const message = await prisma.chatMessage.create({
    data: {
      sessionId,
      notebookId,
      sender,
      content,
      metadata: metadata ? JSON.parse(JSON.stringify(metadata)) : undefined,
      messageOrder: (lastMessage?.messageOrder || 0) + 1,
    },
  });

  // Update session activity
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { lastActivity: new Date() },
  });

  return message;
}

export async function getSessionMessages(sessionId: string) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Verify ownership
  const chatSession = await prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { notebook: true },
  });

  if (!chatSession || chatSession.notebook.userId !== session.user.id) {
    throw new Error("Session not found");
  }

  return prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { messageOrder: "asc" },
  });
}
