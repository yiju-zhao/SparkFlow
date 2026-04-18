"use client";

import { useTranslations } from "next-intl";
import { SectionReveal } from "./section-reveal";

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  const steps = [
    { number: "01", title: t("step1.title"), description: t("step1.description") },
    { number: "02", title: t("step2.title"), description: t("step2.description") },
    { number: "03", title: t("step3.title"), description: t("step3.description") },
  ];

  return (
    <section id="how-it-works" className="bg-sf-bg-alt border-y border-sf-line px-6 py-24">
      <div className="mx-auto max-w-[1200px]">
        <SectionReveal>
          <div className="mb-12 flex flex-col items-start gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="sf-eyebrow">HOW IT WORKS</p>
              <h2 className="sf-h1 mt-2 max-w-[18ch]">{t("title")}</h2>
            </div>
            <p className="sf-lede md:max-w-[42ch]">{t("subtitle")}</p>
          </div>
        </SectionReveal>

        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
          {steps.map((step, i) => (
            <SectionReveal key={step.number} delay={i * 0.12}>
              <div className="sf-card card-hoverable h-full relative overflow-hidden">
                <span className="sf-eyebrow absolute right-5 top-4 text-sf-ink-4">
                  {step.number}
                </span>
                <div className="sf-icon-tile mb-5">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    aria-hidden
                  >
                    <path d="M12 2v20M2 12h20" />
                  </svg>
                </div>
                <h3 className="sf-h3 mb-2">{step.title}</h3>
                <p className="text-sm leading-relaxed text-sf-ink-3">{step.description}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
