import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { NotebookList } from "@/components/deepdive/notebook-list";
import { CreateNotebookDialog } from "@/components/deepdive/create-notebook-dialog";
import { DeepdiveShell } from "@/components/deepdive/deepdive-shell";
import { NotebookActionsRegistrar } from "@/components/deepdive/notebook-actions-registrar";
import {
  Archive,
  Clock,
  Folder,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Users,
} from "lucide-react";

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

  const sideNav = [
    { label: "All Notebooks", icon: Folder, count: notebooks.length, active: true },
    { label: "Recent", icon: Clock, count: notebooks.length },
    { label: "Shared", icon: Users, count: 0, disabled: true },
    { label: "Archived", icon: Archive, count: 0, disabled: true },
  ];

  return (
    <DeepdiveShell user={session?.user}>
      <NotebookActionsRegistrar notebookIds={notebooks.map((n) => n.id)} />
      <div className="flex-1 overflow-y-auto bg-sf-bg">
        <div className="flex min-h-full">
          {/* Left sidebar — Library */}
          <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-sf-line bg-sf-surface sticky top-0 h-[calc(100vh-64px)]">
            <div className="px-6 py-6">
              <h2 className="text-[17px] font-bold text-sf-accent">Library</h2>
              <p className="text-xs text-sf-ink-4 mt-1">Manage research</p>
            </div>
            <nav className="flex flex-col gap-1 px-3">
              {sideNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    disabled={item.disabled}
                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[6px] text-sm transition-colors ${
                      item.active
                        ? "bg-sf-accent-soft text-sf-accent font-semibold"
                        : item.disabled
                          ? "text-sf-ink-4 opacity-60 cursor-not-allowed"
                          : "text-sf-ink-2 hover:bg-sf-bg-alt"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                      {item.label}
                    </span>
                    <span className="font-mono text-[11px] tabular-nums text-sf-ink-4">
                      {item.count}
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 p-8 lg:p-10 min-w-0">
            <div className="max-w-[1400px] mx-auto">
              {/* Title section */}
              <section className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h1 className="text-[40px] md:text-[48px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03]">
                    {t("notebooks")}
                  </h1>
                  <p className="text-sf-ink-3 max-w-xl mt-4 leading-relaxed">
                    {t("notebooksSubtitle")}
                  </p>
                </div>
                <CreateNotebookDialog />
              </section>

              {/* Search + Filter + Sort row */}
              <section className="mb-8 flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-sf-ink-4 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search notebooks, tags, or sources…"
                    className="w-full h-11 pl-10 pr-4 bg-sf-surface border border-sf-line-strong rounded-[6px] text-sm text-sf-ink placeholder:text-sf-ink-4 focus:outline-none focus:ring-2 focus:ring-sf-accent focus:border-sf-accent transition-all"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="h-11 px-4 border border-sf-line-strong bg-sf-surface text-sm font-semibold text-sf-ink-2 flex items-center gap-2 hover:bg-sf-bg-alt rounded-[6px] transition-colors"
                  >
                    <SlidersHorizontal className="h-4 w-4 text-sf-ink-3" />
                    Filter
                  </button>
                  <button
                    type="button"
                    className="h-11 px-4 border border-sf-line-strong bg-sf-surface text-sm font-semibold text-sf-ink-2 flex items-center gap-2 hover:bg-sf-bg-alt rounded-[6px] transition-colors"
                  >
                    <ArrowUpDown className="h-4 w-4 text-sf-ink-3" />
                    Sort
                  </button>
                </div>
              </section>

              {/* Notebook grid */}
              <NotebookList notebooks={notebooks} />
            </div>
          </main>
        </div>
      </div>
    </DeepdiveShell>
  );
}
