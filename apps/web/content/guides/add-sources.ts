import type { GuideDefinition } from "./types";

export const addSourcesGuide: GuideDefinition = {
  id: "add-sources",
  category: "deepdive",
  icon: "Upload",
  titleKey: "guides.addSources.title",
  summaryKey: "guides.addSources.summary",
  publicOnLanding: true,
  includeInFirstRunTour: true,
  firstRunTourOrder: 2,
  steps: [
    // 1 — Land the user inside a notebook workspace.
    // On /deepdive the NotebookActionsRegistrar registers `goto-last-notebook`,
    // which router.pushes into the most recent notebook; no-op if none exists.
    {
      route: "/deepdive",
      trigger: { kind: "action", name: "goto-last-notebook" },
      placement: "bottom",
      titleKey: "guides.addSources.step1.title",
      bodyKey: "guides.addSources.step1.body",
      advanceOn: "next",
    },
    // 2 — Point at the "Add Source" trigger in SourcesPanel.
    {
      selector: '[data-guide="add-source-trigger"]',
      placement: "right",
      titleKey: "guides.addSources.step2.title",
      bodyKey: "guides.addSources.step2.body",
      advanceOn: "both",
    },
    // 3 — Open the dialog programmatically and point at the Upload menu.
    {
      trigger: { kind: "action", name: "open-add-source" },
      waitForSelector: { selector: '[data-guide="upload-button"]', timeoutMs: 1200 },
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step3.title",
      bodyKey: "guides.addSources.step3.body",
      advanceOn: "next",
    },
    // 4 — Websites entry (URL import).
    {
      selector: '[data-guide="add-source-websites"]',
      placement: "top",
      titleKey: "guides.addSources.step4.title",
      bodyKey: "guides.addSources.step4.body",
      advanceOn: "next",
    },
    // 5 — Insert button. We do NOT auto-click — that would submit real data.
    {
      waitForSelector: { selector: '[data-guide="add-source-submit"]', timeoutMs: 800 },
      selector: '[data-guide="add-source-submit"]',
      placement: "top",
      titleKey: "guides.addSources.step5.title",
      bodyKey: "guides.addSources.step5.body",
      advanceOn: "next",
    },
  ],
};
