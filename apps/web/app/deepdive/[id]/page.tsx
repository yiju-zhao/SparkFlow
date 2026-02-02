import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { NotebookLayout } from "./notebook-layout";

interface NotebookPageProps {
  params: Promise<{ id: string }>;
}

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { id } = await params;

  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const [notebook, sources, notes, chatSessions] = await Promise.all([
    prisma.notebook.findFirst({
      where: {
        id,
        userId: session.user.id,
      },
    }),
    prisma.source.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session.user.id },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session.user.id },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.chatSession.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session.user.id },
        status: { in: ["ACTIVE", "CLOSED"] },
      },
      orderBy: { lastActivity: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    }),
  ]);

  if (!notebook) {
    notFound();
  }

  // Preload messages for the first (most recent) session to avoid client-side fetch lag
  const firstSession = chatSessions[0];
  const initialMessages = firstSession
    ? await prisma.chatMessage.findMany({
        where: { sessionId: firstSession.id },
        orderBy: { messageOrder: "asc" },
        select: { id: true, sender: true, content: true },
      })
    : [];

  return (
    <NotebookLayout
      notebook={notebook}
      sources={sources}
      notes={notes}
      initialChatSessions={chatSessions}
      initialMessages={initialMessages}
    />
  );
}
