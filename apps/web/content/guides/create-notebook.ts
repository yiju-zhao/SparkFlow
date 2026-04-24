import type { GuideDefinition } from "./types";

export const createNotebookGuide: GuideDefinition = {
  id: "create-notebook",
  category: "deepdive",
  icon: "FolderPlus",
  titleKey: "guides.createNotebook.title",
  summaryKey: "guides.createNotebook.summary",
  publicOnLanding: true,
  includeInFirstRunTour: true,
  firstRunTourOrder: 1,
  onExit: { kind: "action", name: "close-create-notebook" },
  steps: [
    // 1 — Point at the "New Notebook" trigger button.
    {
      route: "/deepdive",
      trigger: { kind: "action", name: "close-create-notebook" },
      selector: '[data-guide="new-notebook-button"]',
      placement: "bottom",
      titleKey: "guides.createNotebook.step1.title",
      bodyKey: "guides.createNotebook.step1.body",
      advanceOn: "both",
    },
    // 2 — Open the dialog and point at the Name field.
    {
      trigger: { kind: "action", name: "open-create-notebook" },
      waitForSelector: { selector: '[data-guide="notebook-name-field"]', timeoutMs: 1200 },
      selector: '[data-guide="notebook-name-field"]',
      placement: "bottom",
      titleKey: "guides.createNotebook.step2.title",
      bodyKey: "guides.createNotebook.step2.body",
      advanceOn: "next",
    },
    // 3 — Point at the optional description field.
    {
      selector: '[data-guide="notebook-description-field"]',
      placement: "top",
      titleKey: "guides.createNotebook.step3.title",
      bodyKey: "guides.createNotebook.step3.body",
      advanceOn: "next",
    },
    // 4 — Point at the Create button. No auto-click — submitting creates a DB row.
    {
      selector: '[data-guide="notebook-create-button"]',
      placement: "top",
      titleKey: "guides.createNotebook.step4.title",
      bodyKey: "guides.createNotebook.step4.body",
      advanceOn: "next",
    },
  ],
};
