"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus } from "lucide-react";

import { FeedbackDialog } from "./feedback-dialog";

interface FloatingFeedbackButtonProps {
  isAuthenticated: boolean;
}

export function FloatingFeedbackButton({ isAuthenticated }: FloatingFeedbackButtonProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("feedback");

  // Only show feedback to signed-in users (matches the API auth gate).
  if (!isAuthenticated) return null;

  return (
    <>
      <button
        type="button"
        aria-label={t("openButton")}
        title={t("openButton")}
        onClick={() => setOpen(true)}
        className="fixed right-20 bottom-5 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition hover:scale-105 hover:bg-emerald-600"
      >
        <MessageSquarePlus className="h-5 w-5" />
      </button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
