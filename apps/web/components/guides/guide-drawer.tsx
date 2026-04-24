"use client";

import { useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "framer-motion";
import { X, Play, BookOpen, EyeOff, Search as SearchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import type { GuideCategory, GuideDefinition } from "@/content/guides/types";
import { useGuides } from "./guide-provider";

const CATEGORY_ORDER: GuideCategory[] = ["deepdive", "explore", "account"];

function filterGuides(guides: GuideDefinition[], q: string, dismissed: string[]) {
  const normalized = q.trim().toLowerCase();
  return guides.filter((g) => {
    if (!normalized && dismissed.includes(g.id)) return false;
    if (!normalized) return true;
    return (
      g.id.toLowerCase().includes(normalized) ||
      g.titleKey.toLowerCase().includes(normalized) ||
      g.summaryKey.toLowerCase().includes(normalized)
    );
  });
}

export function GuideDrawer() {
  const t = useTranslations("guides");
  const { drawerOpen, setDrawerOpen, dismissedGuides, dismissGuide, openGuide, resetTour } = useGuides();
  const [q, setQ] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = useMemo(() => filterGuides(GUIDES, q, dismissedGuides), [q, dismissedGuides]);
  const grouped = useMemo(() => {
    const map = new Map<GuideCategory, GuideDefinition[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    for (const g of visible) map.get(g.category)?.push(g);
    return map;
  }, [visible]);

  return (
    <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen} modal={false}>
      <AnimatePresence>
        {drawerOpen ? (
          <Dialog.Portal forceMount>
            <Dialog.Content asChild>
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 28, stiffness: 260 }}
                className="fixed top-0 right-0 bottom-0 z-40 flex w-[420px] max-w-full flex-col border-l border-border bg-background shadow-2xl"
              >
                <header className="flex items-center justify-between border-b border-border p-4">
                  <Dialog.Title className="flex items-center gap-2 text-sm font-semibold">
                    <BookOpen className="h-4 w-4" /> {t("drawer.title")}
                  </Dialog.Title>
                  <Dialog.Close asChild>
                    <button aria-label={t("drawer.close")} className="text-muted-foreground hover:text-foreground">
                      <X className="h-4 w-4" />
                    </button>
                  </Dialog.Close>
                </header>

                <div className="border-b border-border p-3">
                  <div className="flex items-center gap-2 rounded border border-border bg-muted/20 px-2 py-1 text-sm">
                    <SearchIcon className="h-4 w-4 opacity-60" />
                    <input
                      aria-label={t("drawer.search")}
                      placeholder={t("drawer.search")}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="w-full bg-transparent outline-none"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-2">
                  {CATEGORY_ORDER.map((cat) => {
                    const items = grouped.get(cat) ?? [];
                    if (items.length === 0) return null;
                    return (
                      <section key={cat} className="mb-4">
                        <h3 className="mb-2 px-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                          {t(`category.${cat}`)} <span className="opacity-60">({items.length})</span>
                        </h3>
                        <ul className="flex flex-col gap-1">
                          {items.map((g) => (
                            <li key={g.id} className="rounded border border-transparent hover:border-border">
                              <button
                                type="button"
                                onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                                className="flex w-full items-start gap-2 px-2 py-2 text-left text-sm"
                              >
                                <span className="mt-0.5 text-base">📘</span>
                                <span className="flex-1">
                                  <span className="block font-medium">{t(g.titleKey.replace(/^guides\./, ""))}</span>
                                  <span className="block text-xs text-muted-foreground">{t(g.summaryKey.replace(/^guides\./, ""))}</span>
                                </span>
                              </button>
                              {expandedId === g.id ? (
                                <div className="flex gap-2 border-t border-border bg-muted/10 px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrawerOpen(false);
                                      openGuide(g.id);
                                    }}
                                    className="flex items-center gap-1 rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600"
                                  >
                                    <Play className="h-3 w-3" /> {t("action.play")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedId(g.id)}
                                    className="flex items-center gap-1 rounded border border-border px-2 py-1 text-xs"
                                  >
                                    <BookOpen className="h-3 w-3" /> {t("action.read")}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => dismissGuide(g.id)}
                                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                                  >
                                    <EyeOff className="h-3 w-3" /> {t("action.dismiss")}
                                  </button>
                                </div>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      </section>
                    );
                  })}
                </div>

                <footer className="border-t border-border p-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await resetTour();
                      setDrawerOpen(false);
                    }}
                    className="w-full rounded border border-border px-3 py-2 text-xs hover:bg-muted/40"
                  >
                    {t("drawer.replayTour")}
                  </button>
                </footer>
              </motion.aside>
            </Dialog.Content>
          </Dialog.Portal>
        ) : null}
      </AnimatePresence>
    </Dialog.Root>
  );
}
