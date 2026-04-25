import type { GuideDefinition } from "./types";

export const matcherGuide: GuideDefinition = {
  id: "matcher",
  category: "explore",
  icon: "Target",
  titleKey: "guides.matcher.title",
  summaryKey: "guides.matcher.summary",
  steps: [
    // 1 — Point at the upload dropzone / query preview.
    {
      route: "/explore/toolbox/matcher",
      waitForSelector: { selector: '[data-guide="matcher-upload-dropzone"]', timeoutMs: 2000 },
      selector: '[data-guide="matcher-upload-dropzone"]',
      placement: "top",
      titleKey: "guides.matcher.step1.title",
      bodyKey: "guides.matcher.step1.body",
      advanceOn: "next",
    },
    // 2 — Outro centered: we deliberately stop at step-0 of the wizard;
    // reaching the config / run steps would mean half-driving a real backend
    // job, which we avoid.
    {
      placement: "top",
      titleKey: "guides.matcher.step2.title",
      bodyKey: "guides.matcher.step2.body",
      advanceOn: "next",
    },
  ],
};
