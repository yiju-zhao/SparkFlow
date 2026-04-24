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
    // 1 — Land in a notebook workspace and point at the Add Source button.
    // The /deepdive list page mounts NotebookActionsRegistrar which registers
    // `goto-last-notebook` → router.pushes into the most recent notebook.
    {
      route: "/deepdive",
      trigger: { kind: "action", name: "goto-last-notebook" },
      selector: '[data-guide="add-source-trigger"]',
      placement: "right",
      titleKey: "guides.addSources.step2.title",
      bodyKey: "guides.addSources.step2.body",
      advanceOn: "both",
      counterLabel: "1 / 3",
    },
    // 2a — Open the dialog programmatically and highlight the Upload menu.
    // Emphasize-only (advanceOn:"next") — clicking Upload opens a Popover
    // that would otherwise hijack the ring.
    {
      trigger: { kind: "action", name: "open-add-source" },
      waitForSelector: { selector: '[data-guide="upload-button"]', timeoutMs: 1200 },
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step3.title",
      bodyKey: "guides.addSources.step3.body",
      advanceOn: "next",
      counterLabel: "2a / 3",
    },
    // 2b — Alternative entry via Websites. Emphasize-only — clicking the real
    // button switches the view, which would remove the very button we are
    // highlighting.
    {
      selector: '[data-guide="add-source-websites"]',
      placement: "top",
      titleKey: "guides.addSources.step4.title",
      bodyKey: "guides.addSources.step4.body",
      advanceOn: "next",
      counterLabel: "2b-1 / 3",
    },
    // 3 — Point at the Insert button. Programmatically switch to the Websites
    // view first so the button is guaranteed to be in the DOM regardless of
    // which path the user took.
    {
      trigger: { kind: "action", name: "switch-to-websites" },
      waitForSelector: { selector: '[data-guide="add-source-submit"]', timeoutMs: 800 },
      selector: '[data-guide="add-source-submit"]',
      placement: "top",
      titleKey: "guides.addSources.step5.title",
      bodyKey: "guides.addSources.step5.body",
      advanceOn: "next",
      counterLabel: "2b-2 / 3",
    },
  ],
};
