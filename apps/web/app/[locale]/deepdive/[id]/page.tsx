import { auth } from "@/lib/auth";
import { notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { NotebookLayout } from "@/components/deepdive/notebook-layout";
import { DeepdiveShell } from "@/components/deepdive/deepdive-shell";

interface NotebookPageProps {
  params: Promise<{ id: string }>;
}

export default async function NotebookPage({ params }: NotebookPageProps) {
  const { id } = await params;

  const session = await auth();

  const [notebook, sources, notes, chatSessions, wikiPages, notebookGraph] = await Promise.all([
    prisma.notebook.findFirst({
      where: {
        id,
        userId: session!.user!.id,
      },
    }),
    prisma.source.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session!.user!.id },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.note.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session!.user!.id },
      },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.chatSession.findMany({
      where: {
        notebookId: id,
        notebook: { userId: session!.user!.id },
        status: { in: ["ACTIVE", "CLOSED"] },
      },
      orderBy: { lastActivity: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    }),
    prisma.wikiPage.findMany({
      where: { notebookId: id },
      select: {
        id: true,
        slug: true,
        title: true,
        pageType: true,
        sourceRefs: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.notebookGraph.findUnique({
      where: { notebookId: id },
      select: { graphData: true },
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

  // Transform data in RSC to minimize client-side serialization (Vercel best practice: server-serialization)
  const transformedSessions = chatSessions.map((s) => ({
    id: s.id,
    title: s.title,
    lastActivity: s.lastActivity.toISOString(),
    langgraphThreadId: s.langgraphThreadId,
    _count: { messages: s._count?.messages ?? 0 },
  }));

  const transformedMessages = initialMessages.map((m) => ({
    id: m.id,
    role: m.sender === "USER" ? ("user" as const) : ("assistant" as const),
    content: m.content,
  }));

  return (
    <DeepdiveShell user={session?.user} breadcrumb={{ label: notebook.name }}>
      <NotebookLayout
        notebook={notebook}
        sources={sources}
        notes={notes}
        initialChatSessions={transformedSessions}
        initialMessages={transformedMessages}
        wikiPages={wikiPages.map((p) => ({
          ...p,
          updatedAt: p.updatedAt.toISOString(),
        }))}
        graphData={notebookGraph?.graphData || null}
      />
    </DeepdiveShell>
  );
}
