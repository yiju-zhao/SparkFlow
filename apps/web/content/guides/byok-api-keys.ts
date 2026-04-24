import type { GuideDefinition } from "./types";

export const byokApiKeysGuide: GuideDefinition = {
  id: "byok-api-keys",
  category: "account",
  icon: "KeyRound",
  titleKey: "guides.byokApiKeys.title",
  summaryKey: "guides.byokApiKeys.summary",
  includeInFirstRunTour: true,
  firstRunTourOrder: 3,
  steps: [
    {
      selector: '[data-guide="api-keys-section"]',
      placement: "top",
      titleKey: "guides.byokApiKeys.step1.title",
      bodyKey: "guides.byokApiKeys.step1.body",
      route: "/settings",
    },
  ],
};
