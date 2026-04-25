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
    // 1 — Navigate to Settings and show where API Keys lives in the sidebar.
    {
      route: "/settings",
      trigger: { kind: "action", name: "settings:open-api-keys" },
      waitForSelector: { selector: '[data-guide="settings-nav-api-keys"]', timeoutMs: 1500 },
      selector: '[data-guide="settings-nav-api-keys"]',
      placement: "right",
      titleKey: "guides.byokApiKeys.step1.title",
      bodyKey: "guides.byokApiKeys.step1.body",
    },
    // 2 — Ring moves from the sidebar into the provider-card grid. Body covers
    //      the full workflow: pick a provider (or Custom for OpenAI-compatible
    //      endpoints), paste your key, Save.
    {
      trigger: { kind: "action", name: "settings:open-api-keys" },
      waitForSelector: { selector: '[data-guide="provider-card-openai"]', timeoutMs: 1200 },
      selector: '[data-guide="provider-card-openai"]',
      placement: "top",
      titleKey: "guides.byokApiKeys.step2.title",
      bodyKey: "guides.byokApiKeys.step2.body",
    },
  ],
};
