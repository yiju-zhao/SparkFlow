"use client";

import { useTranslations } from "next-intl";
import { SectionReveal } from "./section-reveal";

export function CoreFeaturesSection() {
  const t = useTranslations("landing.features");

  const features = [
    {
      badge: t("deepdive.badge"),
      title: t("deepdive.title"),
      description: t("deepdive.description"),
      accent: "sf-badge-blue",
    },
    {
      badge: t("explore.badge"),
      title: t("explore.title"),
      description: t("explore.description"),
      accent: "sf-badge-black",
    },
    {
      badge: t("insights.badge"),
      title: t("insights.title"),
      description: t("insights.description"),
      accent: "sf-badge-soft",
    },
  ];

  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-[1200px]">
        <SectionReveal>
          <div className="mb-16 max-w-3xl">
            <p className="sf-eyebrow">CORE FEATURES</p>
            <h2 className="sf-h1 mt-2">{t("coreTitle")}</h2>
            <p className="sf-lede mt-4">{t("coreSubtitle")}</p>
          </div>
        </SectionReveal>

        <div className="flex flex-col gap-24">
          {features.map((feature, i) => {
            const isReversed = i % 2 !== 0;
            return (
              <div
                key={feature.badge}
                className={`flex flex-col items-center gap-10 md:flex-row ${isReversed ? "md:flex-row-reverse" : ""}`}
              >
                <SectionReveal direction={isReversed ? "right" : "left"} className="flex-1">
                  <span className={`sf-badge ${feature.accent} mb-5`}>{feature.badge}</span>
                  <h3 className="sf-h2 mb-4">{feature.title}</h3>
                  <p className="text-[16px] leading-relaxed text-sf-ink-3 max-w-[52ch]">
                    {feature.description}
                  </p>
                </SectionReveal>

                <SectionReveal direction={isReversed ? "left" : "right"} className="flex-1">
                  <div className="aspect-[4/3] w-full overflow-hidden rounded-[14px] border border-sf-line bg-sf-surface">
                    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-sf-accent-soft via-sf-surface to-sf-bg-alt text-sf-ink-4">
                      <span className="sf-icon-tile h-14 w-14">
                        <svg
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          aria-hidden
                        >
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <path d="M3 9h18" />
                        </svg>
                      </span>
                      <span className="sf-eyebrow">
                        {feature.badge} · {t("preview")}
                      </span>
                    </div>
                  </div>
                </SectionReveal>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
