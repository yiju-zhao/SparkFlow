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
    },
    // 2 — Open the dialog programmatically and highlight the Upload menu.
    {
      trigger: { kind: "action", name: "open-add-source" },
      waitForSelector: { selector: '[data-guide="upload-button"]', timeoutMs: 1200 },
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step3.title",
      bodyKey: "guides.addSources.step3.body",
      advanceOn: "next",
    },
    // 3 — Point at the Websites entry. advanceOn="both" so clicking the
    // button naturally advances to step 4 (where the view has switched
    // and the Insert button exists).
    {
      selector: '[data-guide="add-source-websites"]',
      placement: "top",
      titleKey: "guides.addSources.step4.title",
      bodyKey: "guides.addSources.step4.body",
      advanceOn: "both",
    },
    // 4 — Point at the Insert button. Fire the `switch-to-websites` action
    // first so the button is guaranteed to exist whether the user reached
    // here via Next (view still on file-picker) or by clicking Websites
    // (view already switched — the action is idempotent).
    {
      trigger: { kind: "action", name: "switch-to-websites" },
      waitForSelector: { selector: '[data-guide="add-source-submit"]', timeoutMs: 800 },
      selector: '[data-guide="add-source-submit"]',
      placement: "top",
      titleKey: "guides.addSources.step5.title",
      bodyKey: "guides.addSources.step5.body",
      advanceOn: "next",
    },
  ],
};
