import type { GuideDefinition } from "./types";

export const wikiGraphGuide: GuideDefinition = {
  id: "wiki-graph",
  category: "deepdive",
  icon: "Network",
  titleKey: "guides.wikiGraph.title",
  summaryKey: "guides.wikiGraph.summary",
  steps: [
    // 1 — Make sure we're in a notebook on the Wiki tab, then highlight the tab.
    {
      route: "/deepdive",
      trigger: [
        { kind: "action", name: "goto-last-notebook" },
        { kind: "action", name: "switch-to-wiki" },
      ],
      waitForSelector: { selector: '[data-guide="wiki-panel"]', timeoutMs: 1500 },
      selector: '[data-guide="wiki-panel"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step1.title",
      bodyKey: "guides.wikiGraph.step1.body",
      advanceOn: "both",
    },
    // 2 — Point at the Knowledge Base section (pages list).
    {
      trigger: { kind: "action", name: "switch-to-wiki" },
      selector: '[data-guide="wiki-pages-section"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step2.title",
      bodyKey: "guides.wikiGraph.step2.body",
      advanceOn: "next",
    },
    // 3 — Point at the Relationship Graph section.
    {
      selector: '[data-guide="wiki-graph-section"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step3.title",
      bodyKey: "guides.wikiGraph.step3.body",
      advanceOn: "next",
    },
    // 4 — Point at the fullscreen expand button.
    {
      selector: '[data-guide="wiki-graph-expand"]',
      placement: "left",
      titleKey: "guides.wikiGraph.step4.title",
      bodyKey: "guides.wikiGraph.step4.body",
      advanceOn: "next",
    },
  ],
};
