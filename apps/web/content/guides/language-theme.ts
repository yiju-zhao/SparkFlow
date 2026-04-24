import type { GuideDefinition } from "./types";

export const languageThemeGuide: GuideDefinition = {
  id: "language-theme",
  category: "account",
  icon: "Languages",
  titleKey: "guides.languageTheme.title",
  summaryKey: "guides.languageTheme.summary",
  // Make sure both menus are closed when the guide ends, whichever step was
  // showing.
  onExit: [
    { kind: "action", name: "locale-menu:close" },
    { kind: "action", name: "theme-menu:close" },
  ],
  steps: [
    // 1 — Point at the language trigger.
    {
      trigger: [
        { kind: "action", name: "locale-menu:close" },
        { kind: "action", name: "theme-menu:close" },
      ],
      selector: '[data-guide="language-switcher"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step1.title",
      bodyKey: "guides.languageTheme.step1.body",
      advanceOn: "both",
    },
    // 2 — Open the language menu and point at the options.
    {
      trigger: [
        { kind: "action", name: "theme-menu:close" },
        { kind: "action", name: "locale-menu:open" },
      ],
      waitForSelector: { selector: '[data-guide="locale-menu-content"]', timeoutMs: 800 },
      selector: '[data-guide="locale-menu-content"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step2.title",
      bodyKey: "guides.languageTheme.step2.body",
      advanceOn: "next",
    },
    // 3 — Close the language menu, point at the theme trigger.
    {
      trigger: { kind: "action", name: "locale-menu:close" },
      selector: '[data-guide="theme-toggle"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step3.title",
      bodyKey: "guides.languageTheme.step3.body",
      advanceOn: "both",
    },
    // 4 — Open the theme menu and point at the options.
    {
      trigger: [
        { kind: "action", name: "locale-menu:close" },
        { kind: "action", name: "theme-menu:open" },
      ],
      waitForSelector: { selector: '[data-guide="theme-menu-content"]', timeoutMs: 800 },
      selector: '[data-guide="theme-menu-content"]',
      placement: "bottom",
      titleKey: "guides.languageTheme.step4.title",
      bodyKey: "guides.languageTheme.step4.body",
      advanceOn: "next",
    },
  ],
};
