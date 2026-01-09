import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import prisma from "@/lib/prisma";
import { StudioLayout } from "./studio-layout";

interface StudioPageProps {
  params: Promise<{ id: string }>;
}

export default async function StudioPage({ params }: StudioPageProps) {
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
        where: { status: "ACTIVE" },
        take: 1,
        orderBy: { lastActivity: "desc" },
      },
    },
  });

  if (!notebook) {
    notFound();
  }

  return (
    <StudioLayout
      notebook={notebook}
      sources={notebook.sources}
      notes={notebook.notes}
      activeSession={notebook.chatSessions[0] || null}
    />
  );
}
