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
    // 1 — Navigate to settings + open the API Keys section.
    {
      route: "/settings",
      trigger: { kind: "action", name: "settings:open-api-keys" },
      waitForSelector: { selector: '[data-guide="settings-nav-api-keys"]', timeoutMs: 1500 },
      selector: '[data-guide="settings-nav-api-keys"]',
      placement: "right",
      titleKey: "guides.byokApiKeys.step1.title",
      bodyKey: "guides.byokApiKeys.step1.body",
      advanceOn: "both",
    },
    // 2 — Point at the first provider card (OpenAI).
    {
      trigger: { kind: "action", name: "settings:open-api-keys" },
      waitForSelector: { selector: '[data-guide="provider-card-openai"]', timeoutMs: 1200 },
      selector: '[data-guide="provider-card-openai"]',
      placement: "top",
      titleKey: "guides.byokApiKeys.step2.title",
      bodyKey: "guides.byokApiKeys.step2.body",
      advanceOn: "next",
    },
    // 3 — Re-use the existing security-notice anchor as the "paste + save"
    //      overview. We never point at specific key input elements, let alone
    //      prefill them.
    {
      selector: '[data-guide="api-keys-section"]',
      placement: "bottom",
      titleKey: "guides.byokApiKeys.step3.title",
      bodyKey: "guides.byokApiKeys.step3.body",
      advanceOn: "next",
    },
  ],
};
