import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { NotebookList } from "./notebook-list";
import { UnifiedHeader } from "@/components/unified-header";
import { CreateNotebookDialog } from "./create-notebook-dialog";

import { Compass } from "lucide-react";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const notebooks = await prisma.notebook.findMany({
    where: { userId: session.user.id },
    include: {
      _count: {
        select: { sources: true, notes: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <div className="min-h-screen bg-secondary">
      {/* Header */}
      <UnifiedHeader
        theme="red"
        title="deepdive"
        actionButton={
          <Link
            href="/explore"
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-[#555] rounded text-[#ccc] hover:text-white hover:border-[#00D084] transition-colors"
          >
            <Compass className="h-4 w-4" />
            explore research-hub
          </Link>
        }
        user={session.user}
      />

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold font-mono tracking-tight">research notebooks</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Personalized knowledge bases and AI insights
            </p>
          </div>
          <CreateNotebookDialog />
        </div>

        <NotebookList notebooks={notebooks} />
      </main>
    </div>
  );
}
