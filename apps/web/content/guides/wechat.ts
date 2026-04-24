import type { GuideDefinition } from "./types";

export const wechatGuide: GuideDefinition = {
  id: "wechat",
  category: "explore",
  icon: "MessageCircle",
  titleKey: "guides.wechat.title",
  summaryKey: "guides.wechat.summary",
  steps: [
    // 1 — Source filter chips.
    {
      route: "/explore/social-media/wechat",
      waitForSelector: { selector: '[data-guide="wechat-sources-filter"]', timeoutMs: 1500 },
      selector: '[data-guide="wechat-sources-filter"]',
      placement: "bottom",
      titleKey: "guides.wechat.step1.title",
      bodyKey: "guides.wechat.step1.body",
      advanceOn: "next",
    },
    // 2 — Sort dropdown.
    {
      selector: '[data-guide="wechat-sort-select"]',
      placement: "bottom",
      titleKey: "guides.wechat.step2.title",
      bodyKey: "guides.wechat.step2.body",
      advanceOn: "next",
    },
    // 3 — First article row.
    {
      selector: '[data-guide="wechat-article-row"]',
      placement: "top",
      titleKey: "guides.wechat.step3.title",
      bodyKey: "guides.wechat.step3.body",
      advanceOn: "both",
    },
  ],
};
