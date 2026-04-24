import type { GuideDefinition } from "./types";

export const chatWithAiGuide: GuideDefinition = {
  id: "chat-with-ai",
  category: "deepdive",
  icon: "MessageSquare",
  titleKey: "guides.chatWithAi.title",
  summaryKey: "guides.chatWithAi.summary",
  publicOnLanding: true,
  includeInFirstRunTour: true,
  firstRunTourOrder: 4,
  steps: [
    // 1 — Point at the chat input. Takes the user to a notebook workspace first.
    {
      route: "/deepdive",
      trigger: { kind: "action", name: "goto-last-notebook" },
      waitForSelector: { selector: '[data-guide="chat-input"]', timeoutMs: 1500 },
      selector: '[data-guide="chat-input"]',
      placement: "top",
      titleKey: "guides.chatWithAi.step1.title",
      bodyKey: "guides.chatWithAi.step1.body",
      advanceOn: "next",
    },
    // 2 — Point at the send button.
    {
      selector: '[data-guide="chat-send-button"]',
      placement: "left",
      titleKey: "guides.chatWithAi.step2.title",
      bodyKey: "guides.chatWithAi.step2.body",
      advanceOn: "next",
    },
    // 3 — Point at the chat history button.
    {
      selector: '[data-guide="chat-history-button"]',
      placement: "bottom",
      titleKey: "guides.chatWithAi.step3.title",
      bodyKey: "guides.chatWithAi.step3.body",
      advanceOn: "next",
    },
  ],
};
