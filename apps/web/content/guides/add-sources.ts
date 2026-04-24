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
    {
      selector: '[data-guide="upload-button"]',
      placement: "bottom",
      titleKey: "guides.addSources.step1.title",
      bodyKey: "guides.addSources.step1.body",
    },
  ],
};
