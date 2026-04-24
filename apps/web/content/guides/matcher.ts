import type { GuideDefinition } from "./types";

export const matcherGuide: GuideDefinition = {
  id: "matcher",
  category: "explore",
  icon: "Target",
  titleKey: "guides.matcher.title",
  summaryKey: "guides.matcher.summary",
  steps: [
    {
      selector: '[data-guide="matcher-nav"]',
      placement: "bottom",
      titleKey: "guides.matcher.step1.title",
      bodyKey: "guides.matcher.step1.body",
      route: "/explore",
    },
  ],
};
