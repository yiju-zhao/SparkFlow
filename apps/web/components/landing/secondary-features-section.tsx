"use client";

import {
  FileSearch,
  Globe,
  GraduationCap,
  Calendar,
  FileText,
  Moon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SectionReveal } from "./section-reveal";

const features = [
  {
    icon: FileSearch,
    title: "Smart Document Parsing",
    description:
      "Automatically parse PDFs, extract text, tables, and images with Agentic AI-powered document understanding.",
  },
  {
    icon: Globe,
    title: "Web Page Import",
    description:
      "Crawl and import any webpage as a research source. Content is cleaned, chunked, and made searchable.",
  },
  {
    icon: GraduationCap,
    title: "Academic Search",
    description:
      "Search across conferences and publications to find papers relevant to your research topics.",
  },
  {
    icon: Calendar,
    title: "Conference Tracking",
    description:
      "Browse conference sessions, track schedules, and discover presentations aligned with your interests.",
  },
  {
    icon: FileText,
    title: "Citation-Backed Agentic AI",
    description:
      "Every Agentic AI response includes precise citations back to your source materials for full traceability.",
  },
  {
    icon: Moon,
    title: "Dark Mode",
    description:
      "A premium dark theme designed for late-night research sessions with reduced eye strain.",
  },
];

export function SecondaryFeaturesSection() {
  return (
    <section className="bg-secondary px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <SectionReveal>
          <div className="mb-16 text-center">
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
              Everything You Need
            </h2>
            <p className="mx-auto max-w-2xl text-muted-foreground">
              A complete toolkit for modern research workflows
            </p>
          </div>
        </SectionReveal>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <SectionReveal key={feature.title} delay={i * 0.1}>
              <Card className="card-hoverable h-full border-border">
                <CardContent className="p-6 pt-6">
                  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-accent-red/10">
                    <feature.icon className="h-5 w-5 text-accent-red" />
                  </div>
                  <h3 className="mb-2 text-base font-semibold">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
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
