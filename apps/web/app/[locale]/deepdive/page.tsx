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
      <div className="flex-1 overflow-y-auto bg-sf-bg">
        <main className="mx-auto max-w-[1280px] px-8 py-10">
          <header className="mb-8 flex items-end justify-between border-b border-sf-line pb-6">
            <div>
              <p className="sf-eyebrow">DEEPDIVE · LIBRARY</p>
              <h1 className="sf-h1 mt-2">{t("notebooks")}</h1>
              <p className="sf-lede mt-2 max-w-[58ch]">{t("notebooksSubtitle")}</p>
            </div>
            <div className="hidden md:flex items-center gap-5">
              <div className="text-right">
                <div className="font-extrabold text-sf-ink text-[32px] tabular-nums leading-none">
                  {notebooks.length.toLocaleString()}
                </div>
                <div className="sf-eyebrow mt-2">Notebooks</div>
              </div>
              <CreateNotebookDialog />
            </div>
          </header>

          <div className="md:hidden mb-6">
            <CreateNotebookDialog />
          </div>

          <NotebookList notebooks={notebooks} />
        </main>
      </div>
    </DeepdiveShell>
  );
}
