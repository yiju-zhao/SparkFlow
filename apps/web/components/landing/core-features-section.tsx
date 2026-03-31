"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { SectionReveal } from "./section-reveal";

export function CoreFeaturesSection() {
  const t = useTranslations("landing.features");

  const features = [
    {
      badge: t("deepdive.badge"),
      title: t("deepdive.title"),
      description: t("deepdive.description"),
    },
    {
      badge: t("explore.badge"),
      title: t("explore.title"),
      description: t("explore.description"),
    },
    {
      badge: t("insights.badge"),
      title: t("insights.title"),
      description: t("insights.description"),
    },
  ];

  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("coreTitle")}
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {t("coreSubtitle")}
            </p>
          </div>
        </SectionReveal>

        <div className="flex flex-col gap-20">
          {features.map((feature, i) => {
            const isReversed = i % 2 !== 0;
            return (
              <div
                key={feature.badge}
                className={`flex flex-col items-center gap-10 md:flex-row ${isReversed ? "md:flex-row-reverse" : ""}`}
              >
                {/* Text */}
                <SectionReveal
                  direction={isReversed ? "right" : "left"}
                  className="flex-1"
                >
                  <Badge
                    variant="secondary"
                    className="mb-4 text-xs font-medium tracking-wide text-accent-red"
                  >
                    {feature.badge}
                  </Badge>
                  <h3 className="mb-3 text-2xl font-bold">{feature.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">
                    {feature.description}
                  </p>
                </SectionReveal>

                {/* Screenshot Placeholder */}
                <SectionReveal
                  direction={isReversed ? "left" : "right"}
                  className="flex-1"
                >
                  <div className="aspect-[4/3] w-full rounded-xl border border-border bg-secondary shadow-huawei-sm">
                    <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                      {feature.badge} {t("preview")}
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
