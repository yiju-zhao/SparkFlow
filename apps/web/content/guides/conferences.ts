import type { GuideDefinition } from "./types";

export const conferencesGuide: GuideDefinition = {
  id: "conferences",
  category: "explore",
  icon: "CalendarDays",
  titleKey: "guides.conferences.title",
  summaryKey: "guides.conferences.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 3,
  steps: [
    // 1 — Filter by venue.
    {
      route: "/explore/conferences",
      waitForSelector: { selector: '[data-guide="conf-filter-venue"]', timeoutMs: 1500 },
      selector: '[data-guide="conf-filter-venue"]',
      placement: "bottom",
      titleKey: "guides.conferences.step1.title",
      bodyKey: "guides.conferences.step1.body",
      advanceOn: "next",
    },
    // 2 — Filter by year.
    {
      selector: '[data-guide="conf-filter-year"]',
      placement: "bottom",
      titleKey: "guides.conferences.step2.title",
      bodyKey: "guides.conferences.step2.body",
      advanceOn: "next",
    },
    // 3 — Drill into a conference card.
    {
      selector: '[data-guide="conf-card-click"]',
      placement: "top",
      titleKey: "guides.conferences.step3.title",
      bodyKey: "guides.conferences.step3.body",
      advanceOn: "both",
    },
  ],
};
