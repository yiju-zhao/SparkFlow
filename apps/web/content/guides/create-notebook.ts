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
  steps: [
    {
      selector: '[data-guide="new-notebook-button"]',
      placement: "bottom",
      titleKey: "guides.createNotebook.step1.title",
      bodyKey: "guides.createNotebook.step1.body",
      route: "/deepdive",
    },
  ],
};
