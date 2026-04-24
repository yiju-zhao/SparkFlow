import type { GuideDefinition } from "./types";

export const wikiGraphGuide: GuideDefinition = {
  id: "wiki-graph",
  category: "deepdive",
  icon: "Network",
  titleKey: "guides.wikiGraph.title",
  summaryKey: "guides.wikiGraph.summary",
  steps: [
    {
      selector: '[data-guide="wiki-panel"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step1.title",
      bodyKey: "guides.wikiGraph.step1.body",
      route: "/deepdive",
    },
  ],
};
