"use client";

import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useGuides } from "./guide-provider";

export function FloatingGuideButton() {
  const { drawerOpen, setDrawerOpen } = useGuides();
  const t = useTranslations("guides.button");

  if (drawerOpen) return null;

  return (
    <button
      type="button"
      aria-label={t("openGuides")}
      onClick={() => setDrawerOpen(true)}
      className="fixed right-5 bottom-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500 text-white shadow-lg transition hover:bg-indigo-600 hover:scale-105"
    >
      <HelpCircle className="h-5 w-5" />
    </button>
  );
}
