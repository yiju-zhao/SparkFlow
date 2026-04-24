import type { GuideDefinition } from "./types";

export const conferencesGuide: GuideDefinition = {
  id: "conferences",
  category: "explore",
  icon: "CalendarDays",
  titleKey: "guides.conferences.title",
  summaryKey: "guides.conferences.summary",
  steps: [
    {
      selector: '[data-guide="conferences-nav"]',
      placement: "bottom",
      titleKey: "guides.conferences.step1.title",
      bodyKey: "guides.conferences.step1.body",
      route: "/explore",
    },
  ],
};
