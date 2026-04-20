"use client";

import { FileSearch, Globe, GraduationCap, Calendar, FileText, KeyRound } from "lucide-react";
import { SectionReveal } from "./section-reveal";

const features = [
  {
    icon: FileSearch,
    title: "Smart Document Parsing",
    description:
      "MinerU parses PDFs and extracts text, tables, and images with AI-powered document understanding.",
  },
  {
    icon: Globe,
    title: "Web Page Import",
    description:
      "Crawl any webpage into the notebook. Content is cleaned, chunked, and made searchable.",
  },
  {
    icon: GraduationCap,
    title: "Academic Search",
    description: "Query conferences and publications to surface papers relevant to your topic.",
  },
  {
    icon: Calendar,
    title: "Conference Tracking",
    description: "Browse sessions, track schedules, and discover presentations aligned with your interests.",
  },
  {
    icon: FileText,
    title: "Citation-Backed AI",
    description: "Every answer includes precise citations back to the original source material.",
  },
  {
    icon: KeyRound,
    title: "Bring Your Own Key",
    description: "Plug in OpenAI, Anthropic, Gemini, or a compatible API. Keys encrypted at rest.",
  },
];

export function SecondaryFeaturesSection() {
  return (
    <section className="bg-sf-bg px-6 py-24">
      <div className="mx-auto max-w-[1200px]">
        <SectionReveal>
          <div className="mb-12 max-w-3xl">
            <p className="sf-eyebrow">COMPLETE TOOLKIT</p>
            <h2 className="sf-h1 mt-2">Everything you need for modern research</h2>
            <p className="sf-lede mt-4">
              Tuned for quiet, data-dense workflows — no visual noise between you and the paper.
            </p>
          </div>
        </SectionReveal>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <SectionReveal key={feature.title} delay={i * 0.08}>
              <div className="sf-card card-hoverable h-full">
                <div className="sf-icon-tile mb-5">
                  <feature.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
                </div>
                <h3 className="sf-h3 mb-2 text-[17px]">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-sf-ink-3">{feature.description}</p>
              </div>
            </SectionReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
