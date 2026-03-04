"use client";

import { Card, CardContent } from "@/components/ui/card";
import { SectionReveal } from "./section-reveal";

const steps = [
  {
    number: "1",
    title: "Upload Sources",
    description:
      "Import PDFs, documents, and webpages into your research notebook. SparkFlow automatically chunks and indexes everything for retrieval.",
  },
  {
    number: "2",
    title: "Explore Conferences",
    description:
      "Browse publications and sessions from academic conferences. Discover relevant research and add it directly to your notebook.",
  },
  {
    number: "3",
    title: "Get Agentic AI Insights",
    description:
      "Chat with your sources using Agentic AI that cites its answers. Ask questions, summarize findings, and uncover connections across your research.",
  },
];

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="bg-secondary px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              How It Works
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              Get started with SparkFlow in three simple steps
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
