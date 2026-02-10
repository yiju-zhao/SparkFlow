"use client";

import { Badge } from "@/components/ui/badge";
import { SectionReveal } from "./section-reveal";

const features = [
  {
    badge: "Deep Dive",
    title: "Agentic AI-Powered Research Notebooks",
    description:
      "Upload documents and webpages, then chat with your sources using RAG-powered Agentic AI. Every answer is grounded in your research with precise citations.",
  },
  {
    badge: "Explore",
    title: "Conference & Publication Explorer",
    description:
      "Browse academic conferences, discover sessions, and find relevant publications. Add sources directly to your notebooks for deeper analysis.",
  },
  {
    badge: "Insights",
    title: "Smart Summarization & Notes",
    description:
      "Automatically generate summaries, extract key findings, and organize your notes. SparkFlow connects the dots across all your research materials.",
  },
];

export function CoreFeaturesSection() {
  return (
    <section id="features" className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Built for Researchers
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Powerful tools designed to accelerate your research workflow
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
                      {feature.badge} Preview
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
