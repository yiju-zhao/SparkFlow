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

  const notebook = await prisma.notebook.findFirst({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      sources: {
        orderBy: { createdAt: "desc" },
      },
      notes: {
        orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
      },
      chatSessions: {
        where: { status: { in: ["ACTIVE", "CLOSED"] } },
        orderBy: { lastActivity: "desc" },
        include: {
          _count: { select: { messages: true } },
        },
      },
    },
  });

  if (!notebook) {
    notFound();
  }

  // Preload messages for the first (most recent) session to avoid client-side fetch lag
  const firstSession = notebook.chatSessions[0];
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
      sources={notebook.sources}
      notes={notebook.notes}
      initialChatSessions={notebook.chatSessions}
      initialMessages={initialMessages}
    />
  );
}
