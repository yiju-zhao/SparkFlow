"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { GUIDES } from "@/content/guides";
import type { GuideStep } from "@/content/guides/types";
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
  const { isAuthenticated } = useGuides();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");
  const pathname = usePathname();
  const steps = firstRunSteps();

  useEffect(() => {
    if (tour.stage !== "running") return;
    const current = steps[tour.stepIndex];
    if (!current?.route) return;
    if (pathname && !pathname.includes(current.route)) {
      tour.navigate(current.route);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tour.stage, tour.stepIndex]);

  if (!isAuthenticated) return null;

  if (tour.stage === "welcome") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55">
        <div className="max-w-sm rounded-lg border border-border bg-background p-6 shadow-xl">
          <h2 className="mb-2 text-lg font-semibold">{t("welcomeTitle")}</h2>
          <p className="mb-4 text-sm text-muted-foreground">{t("welcomeBody")}</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={tour.skip} className="text-xs text-muted-foreground hover:text-foreground">
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
    );
  }

  if (tour.stage === "running" && steps.length > 0) {
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
        onClose={tour.skip}
        nextLabel={t("next")}
        prevLabel={t("prev")}
        closeLabel={t("close")}
        finishLabel={t("finish")}
      />
    );
  }

  return null;
}
