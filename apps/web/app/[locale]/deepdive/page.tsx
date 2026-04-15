import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NotebookList } from "@/components/deepdive/notebook-list";
import { CreateNotebookDialog } from "@/components/deepdive/create-notebook-dialog";
import { DeepdiveShell } from "@/components/deepdive/deepdive-shell";

interface DeepdivePageProps {
  params: Promise<{ locale: string }>;
}

export default async function DeepdivePage({ params }: DeepdivePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("deepdive");
  const session = await auth();

  const notebooks = await prisma.notebook.findMany({
    where: { userId: session!.user!.id },
    include: {
      _count: {
        select: { sources: true, notes: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <DeepdiveShell user={session?.user}>
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-secondary">
        <main className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold font-mono tracking-tight">{t("notebooks")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("notebooksSubtitle")}</p>
            </div>
            <CreateNotebookDialog />
          </div>

          <NotebookList notebooks={notebooks} />
        </main>
      </div>
    </DeepdiveShell>
  );
}
