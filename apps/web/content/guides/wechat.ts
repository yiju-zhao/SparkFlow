import type { GuideDefinition } from "./types";

export const wechatGuide: GuideDefinition = {
  id: "wechat",
  category: "explore",
  icon: "MessageCircle",
  titleKey: "guides.wechat.title",
  summaryKey: "guides.wechat.summary",
  steps: [
    {
      selector: '[data-guide="wechat-nav"]',
      placement: "bottom",
      titleKey: "guides.wechat.step1.title",
      bodyKey: "guides.wechat.step1.body",
      route: "/explore",
    },
  ],
};
