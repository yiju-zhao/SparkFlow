"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { GUIDES } from "@/content/guides";
import type { GuideStep, GuideTrigger } from "@/content/guides/types";
import { Spotlight } from "./spotlight";
import { useFirstRunTour } from "./use-first-run-tour";
import { useGuides } from "./guide-provider";

function firstRunSteps(): Array<GuideStep & { guideId: string }> {
  return GUIDES.filter((g) => g.includeInFirstRunTour)
    .sort((a, b) => (a.firstRunTourOrder ?? 0) - (b.firstRunTourOrder ?? 0))
    .flatMap((g) => g.steps.slice(0, 1).map((s) => ({ ...s, guideId: g.id })));
}

export function FirstRunTour() {
  const tour = useFirstRunTour();
  const { isAuthenticated, runGuideAction } = useGuides();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");
  const pathname = usePathname();
  const steps = firstRunSteps();
  const [showSkipBanner, setShowSkipBanner] = useState(false);

  // Mirror the ActiveGuidePlayer setup loop: navigate, run triggers (single or
  // array), wait for the step's anchor, scroll it into view. Without this the
  // first-run step can land on the wrong page (e.g. add-sources pointing at
  // [data-guide="add-source-trigger"] which only exists inside a notebook
  // workspace, not on /deepdive).
  const setupSeq = useRef(0);
  useEffect(() => {
    if (tour.stage !== "running") return;
    const current = steps[tour.stepIndex];
    if (!current) return;
    const seq = ++setupSeq.current;
    let cancelled = false;

    async function run() {
      // 1. Route — strict-equal to locale-stripped pathname.
      if (current?.route && pathname) {
        const stripped = pathname.replace(/^\/(en|zh)(?=\/|$)/, "") || "/";
        if (stripped !== current.route) {
          tour.navigate(current.route);
        }
      }
      // 2. Triggers (single or array).
      if (current?.trigger) {
        const list: GuideTrigger[] = Array.isArray(current.trigger)
          ? current.trigger
          : [current.trigger];
        for (const trigger of list) {
          if (trigger.kind === "navigate") tour.navigate(trigger.route);
          else await runGuideAction(trigger.name);
        }
      }
      // 3. Wait for the anchor if the step asked.
      if (current?.waitForSelector) {
        const timeoutMs = current.waitForSelector.timeoutMs ?? 1000;
        const start = Date.now();
        while (!cancelled && seq === setupSeq.current && Date.now() - start < timeoutMs) {
          if (document.querySelector(current.waitForSelector.selector)) break;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      // 4. Scroll the target into the viewport.
      if (!cancelled && seq === setupSeq.current && current?.selector) {
        const el = document.querySelector(current.selector);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
        }
      }
    }
    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.stage, tour.stepIndex]);

  if (!isAuthenticated) return null;

  async function handleSkip() {
    setShowSkipBanner(true);
    await tour.skip();
    window.setTimeout(() => setShowSkipBanner(false), 4000);
  }

  return (
    <>
      {tour.stage === "welcome" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
          <div className="max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
            <h2 className="mb-2 text-lg font-semibold">{t("welcomeTitle")}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{t("welcomeBody")}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {t("skip")}
              </button>
              <button
                type="button"
                onClick={tour.start}
                className="rounded bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-600"
              >
                {t("start")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {tour.stage === "running" && steps.length > 0
        ? (() => {
            const current = steps[tour.stepIndex] ?? steps[steps.length - 1];
            const stripPrefix = (k: string) => k.replace(/^guides\./, "");
            return (
              <Spotlight
                selector={current.selector}
                placement={current.placement}
                title={tGuides(stripPrefix(current.titleKey))}
                body={tGuides(stripPrefix(current.bodyKey))}
                stepIndex={tour.stepIndex}
                totalSteps={steps.length}
                onNext={() => (tour.stepIndex === steps.length - 1 ? tour.finish() : tour.next())}
                onPrev={tour.stepIndex > 0 ? tour.prev : undefined}
                onClose={handleSkip}
                nextLabel={t("next")}
                prevLabel={t("prev")}
                closeLabel={t("close")}
                finishLabel={t("finish")}
              />
            );
          })()
        : null}
      {showSkipBanner ? (
        <div className="fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg border border-border bg-background px-4 py-2 text-xs shadow-lg">
          {t("skipToast")}
        </div>
      ) : null}
    </>
  );
}
