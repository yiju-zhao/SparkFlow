import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/prisma";
import { NotebookList } from "./notebook-list";
import { CreateNotebookDialog } from "./create-notebook-dialog";
import { ThemeToggle } from "@/components/theme-toggle";
import { LogoutButton } from "./logout-button";
import { Button } from "@/components/ui/button";
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
      <header className="sticky top-0 z-10 border-b border-border bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <h1 className="text-xl font-semibold">SparkFlow</h1>
          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" asChild className="font-medium px-4 shadow-sm hover:-translate-y-px transition-all">
              <Link href="/explore">
                <Compass className="h-4 w-4 mr-2" />
                Explore
              </Link>
            </Button>
            <span className="text-sm text-muted-foreground">
              {session.user.name || session.user.email}
            </span>
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">Inspiration</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your research notebooks and knowledge bases
            </p>
          </div>
          <CreateNotebookDialog />
        </div>

        <NotebookList notebooks={notebooks} />
      </main>
    </div>
  );
}
