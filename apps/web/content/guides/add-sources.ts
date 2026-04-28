import type { GuideDefinition } from "./types";

export const addSourcesGuide: GuideDefinition = {
  id: "add-sources",
  category: "deepdive",
  icon: "Upload",
  titleKey: "guides.addSources.title",
  summaryKey: "guides.addSources.summary",
  publicOnLanding: true,
  // Removed from the first-run tour — needs an existing notebook, which a
  // brand-new user does not have. The drawer's prereq hint covers that case.
  prereq: { hintKey: "guides.addSources.prereq", setupGuideId: "create-notebook" },
  // When the guide fully closes (Finish or user-close), return the page to
  // the exact state it was in before the demo started: close the dialog AND
  // wipe any transient state the guide changed along the way (view toggles,
  // URL text, upload menu, error banners).
  onExit: [
    { kind: "action", name: "close-add-source" },
    { kind: "action", name: "reset-add-source-state" },
  ],
  steps: [
    // 1 — Land in a notebook workspace and point at the Add Source button.
    // Triggers run in order: goto-last-notebook navigates to the most recent
    // notebook; close-add-source ensures the dialog is closed (important when
    // the user navigates BACK to step 1 from 2a). waitForSelector blocks the
    // render until we're actually inside a workspace.
    {
      route: "/deepdive",
      trigger: [
        { kind: "action", name: "goto-last-notebook" },
        { kind: "action", name: "close-add-source" },
      ],
      waitForSelector: { selector: '[data-guide="add-source-trigger"]', timeoutMs: 2000 },
      selector: '[data-guide="add-source-trigger"]',
      placement: "right",
      titleKey: "guides.addSources.step2.title",
      bodyKey: "guides.addSources.step2.body",
      advanceOn: "both",
    },
    // 2a — Open the dialog and show the file-picker view.
    {
      trigger: [
        { kind: "action", name: "open-add-source" },
        { kind: "action", name: "switch-to-files" },
      ],
      waitForSelector: { selector: '[data-guide="upload-button"]', timeoutMs: 1200 },
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step3.title",
      bodyKey: "guides.addSources.step3.body",
      advanceOn: "next",
    },
    // 2b — Highlight the Websites entry. Needs the file-picker view so the
    // Websites button itself is in the DOM (it's part of the file-picker row).
    {
      trigger: { kind: "action", name: "switch-to-files" },
      waitForSelector: { selector: '[data-guide="add-source-websites"]', timeoutMs: 800 },
      selector: '[data-guide="add-source-websites"]',
      placement: "top",
      titleKey: "guides.addSources.step4.title",
      bodyKey: "guides.addSources.step4.body",
      advanceOn: "next",
    },
    // 3 — Switch to the Websites view and point at the Insert button.
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
