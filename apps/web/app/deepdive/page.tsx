import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { NotebookList } from "./notebook-list";
import { UserNav } from "@/components/user-nav";
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
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="shrink-0 border-b border-border bg-background">
        <div className="mx-auto grid h-16 max-w-6xl grid-cols-3 items-center px-6">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-red">
              <span className="text-sm font-bold text-white">S</span>
            </div>
            <span className="text-lg font-semibold">SparkFlow</span>
          </Link>

          {/* Center: empty */}
          <div />

          {/* Right: Explore link + User */}
          <div className="flex items-center justify-end gap-3">
            <Link
              href="/explore"
              className="flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Compass className="h-4 w-4" />
              research-hub
            </Link>
            {session.user && <UserNav user={session.user} />}
          </div>
        </div>
      </header>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-secondary">
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold font-mono tracking-tight">
                research notebooks
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Personalized knowledge bases and AI insights
              </p>
            </div>
            <CreateNotebookDialog />
          </div>

          <NotebookList notebooks={notebooks} />
        </main>
      </div>
    </div>
  );
}
