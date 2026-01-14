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
    <NotebookLayout
      notebook={notebook}
      sources={notebook.sources}
      notes={notebook.notes}
    />
  );
}
