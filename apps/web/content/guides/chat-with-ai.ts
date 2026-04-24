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
    {
      selector: '[data-guide="chat-input"]',
      placement: "top",
      titleKey: "guides.chatWithAi.step1.title",
      bodyKey: "guides.chatWithAi.step1.body",
      route: "/deepdive",
    },
  ],
};
