"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { GUIDES } from "@/content/guides";
import { Spotlight } from "./spotlight";
import { useGuides } from "./guide-provider";

export function ActiveGuidePlayer() {
  const { activeGuideId, closeGuide } = useGuides();
  const [stepIndex, setStepIndex] = useState(0);
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("guides.tour");
  const tGuides = useTranslations("guides");

  const guide = GUIDES.find((g) => g.id === activeGuideId) ?? null;

  useEffect(() => {
    setStepIndex(0);
  }, [activeGuideId]);

  useEffect(() => {
    if (!guide) return;
    const step = guide.steps[stepIndex];
    if (!step?.route) return;
    if (pathname && !pathname.includes(step.route)) {
      router.push(step.route);
    }
  }, [guide, stepIndex, pathname, router]);

  if (!guide) return null;
  const step = guide.steps[stepIndex];
  if (!step) return null;

  const stripPrefix = (k: string) => k.replace(/^guides\./, "");

  return (
    <Spotlight
      selector={step.selector}
      placement={step.placement}
      title={tGuides(stripPrefix(step.titleKey))}
      body={tGuides(stripPrefix(step.bodyKey))}
      stepIndex={stepIndex}
      totalSteps={guide.steps.length}
      onNext={() => {
        if (stepIndex === guide.steps.length - 1) {
          closeGuide();
        } else {
          setStepIndex(stepIndex + 1);
        }
      }}
      onPrev={stepIndex > 0 ? () => setStepIndex(stepIndex - 1) : undefined}
      onClose={closeGuide}
      nextLabel={t("next")}
      prevLabel={t("prev")}
      closeLabel={t("close")}
      finishLabel={t("finish")}
    />
  );
}
