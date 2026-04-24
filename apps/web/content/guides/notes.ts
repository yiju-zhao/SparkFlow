import type { GuideDefinition } from "./types";

export const notesGuide: GuideDefinition = {
  id: "notes",
  category: "deepdive",
  icon: "NotebookPen",
  titleKey: "guides.notes.title",
  summaryKey: "guides.notes.summary",
  steps: [
    {
      selector: '[data-guide="notes-panel"]',
      placement: "left",
      titleKey: "guides.notes.step1.title",
      bodyKey: "guides.notes.step1.body",
      route: "/deepdive",
    },
  ],
};
