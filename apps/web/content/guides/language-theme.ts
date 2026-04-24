import type { GuideDefinition } from "./types";

export const languageThemeGuide: GuideDefinition = {
  id: "language-theme",
  category: "account",
  icon: "Languages",
  titleKey: "guides.languageTheme.title",
  summaryKey: "guides.languageTheme.summary",
  steps: [
    {
      selector: '[data-guide="language-switcher"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step1.title",
      bodyKey: "guides.languageTheme.step1.body",
    },
    {
      selector: '[data-guide="theme-toggle"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step2.title",
      bodyKey: "guides.languageTheme.step2.body",
    },
  ],
};
