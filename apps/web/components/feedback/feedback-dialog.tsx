"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Bug, Lightbulb, Sparkles, Loader2, CheckCircle2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type FeedbackType = "BUG" | "FEATURE" | "IMPROVEMENT";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MAX_MESSAGE = 5000;

export function FeedbackDialog({ open, onOpenChange }: FeedbackDialogProps) {
  const t = useTranslations("feedback");

  const [type, setType] = useState<FeedbackType>("BUG");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setType("BUG");
      setTitle("");
      setMessage("");
      setSubmitted(false);
      setError(null);
      setSubmitting(false);
    }
    onOpenChange(next);
  }

  const trimmedMessage = message.trim();
  const canSubmit = trimmedMessage.length >= 5 && trimmedMessage.length <= MAX_MESSAGE && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          title: title.trim() || null,
          message: trimmedMessage,
          pageUrl: typeof window !== "undefined" ? window.location.href : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || `Request failed (${res.status})`);
      }
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  const types: Array<{ value: FeedbackType; label: string; icon: typeof Bug; tint: string }> = [
    { value: "BUG", label: t("type.bug"), icon: Bug, tint: "text-rose-500" },
    { value: "FEATURE", label: t("type.feature"), icon: Sparkles, tint: "text-violet-500" },
    { value: "IMPROVEMENT", label: t("type.improvement"), icon: Lightbulb, tint: "text-amber-500" },
  ];

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-sm font-medium">{t("successTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("successBody")}</p>
            <Button className="mt-2" onClick={() => handleOpenChange(false)}>
              {t("done")}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="text-sm">{t("typeLabel")}</Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {types.map((opt) => {
                  const Icon = opt.icon;
                  const active = type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setType(opt.value)}
                      aria-pressed={active}
                      className={cn(
                        "flex flex-col items-center gap-1.5 rounded-md border px-2 py-3 text-xs font-medium transition",
                        active
                          ? "border-primary bg-primary/5 text-foreground shadow-xs"
                          : "border-input text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <Icon className={cn("h-4 w-4", active ? opt.tint : "")} />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label htmlFor="feedback-title" className="text-sm">
                {t("titleLabel")}{" "}
                <span className="text-muted-foreground">({t("optional")})</span>
              </Label>
              <Input
                id="feedback-title"
                className="mt-1"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("titlePlaceholder")}
                maxLength={200}
              />
            </div>

            <div>
              <Label htmlFor="feedback-message" className="text-sm">
                {t("messageLabel")}
              </Label>
              <Textarea
                id="feedback-message"
                className="mt-1 min-h-32"
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE))}
                placeholder={
                  type === "BUG"
                    ? t("messagePlaceholderBug")
                    : type === "FEATURE"
                      ? t("messagePlaceholderFeature")
                      : t("messagePlaceholderImprovement")
                }
              />
              <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                <span>{trimmedMessage.length < 5 ? t("hintMinChars") : ""}</span>
                <span>
                  {message.length} / {MAX_MESSAGE}
                </span>
              </div>
            </div>

            {error ? (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <DialogFooter className="gap-2 sm:gap-2">
              <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={submitting}>
                {t("cancel")}
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {submitting ? t("submitting") : t("submit")}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
