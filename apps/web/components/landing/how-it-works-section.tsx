"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { SectionReveal } from "./section-reveal";

export function HowItWorksSection() {
  const t = useTranslations("landing.howItWorks");

  const steps = [
    {
      number: "1",
      title: t("step1.title"),
      description: t("step1.description"),
    },
    {
      number: "2",
      title: t("step2.title"),
      description: t("step2.description"),
    },
    {
      number: "3",
      title: t("step3.title"),
      description: t("step3.description"),
    },
  ];

  return (
    <section id="how-it-works" className="bg-secondary px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              {t("title")}
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>
        </SectionReveal>

        <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3">
          {steps.map((step, i) => (
            <SectionReveal key={step.number} delay={i * 0.15}>
              <Card className="card-hoverable h-full border-border">
                <CardContent className="p-6 pt-6">
                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent-red/10 text-2xl font-bold text-accent-red">
                    {step.number}
                  </div>
                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
