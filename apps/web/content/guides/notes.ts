import type { GuideDefinition } from "./types";

export const notesGuide: GuideDefinition = {
  id: "notes",
  category: "deepdive",
  icon: "NotebookPen",
  titleKey: "guides.notes.title",
  summaryKey: "guides.notes.summary",
  onExit: { kind: "action", name: "close-create-note" },
  steps: [
    // 1 — Arrive at the Notes tab. close-create-note ensures the dialog is shut
    // when the user steps back to step 1 from a later step.
    {
      route: "/deepdive",
      trigger: [
        { kind: "action", name: "goto-last-notebook" },
        { kind: "action", name: "switch-to-notes" },
        { kind: "action", name: "close-create-note" },
      ],
      waitForSelector: { selector: '[data-guide="notes-panel"]', timeoutMs: 1500 },
      selector: '[data-guide="notes-panel"]',
      placement: "left",
      titleKey: "guides.notes.step1.title",
      bodyKey: "guides.notes.step1.body",
      advanceOn: "both",
    },
    // 2 — Point at the New Note button. close-create-note lets Back from step 3
    // reset the dialog so the button appears again.
    {
      trigger: [
        { kind: "action", name: "switch-to-notes" },
        { kind: "action", name: "close-create-note" },
      ],
      waitForSelector: { selector: '[data-guide="notes-new-button"]', timeoutMs: 800 },
      selector: '[data-guide="notes-new-button"]',
      placement: "bottom",
      titleKey: "guides.notes.step2.title",
      bodyKey: "guides.notes.step2.body",
      advanceOn: "both",
    },
    // 3 — Open the create-note dialog and point at the title field.
    {
      trigger: { kind: "action", name: "open-create-note" },
      waitForSelector: { selector: '[data-guide="note-title-field"]', timeoutMs: 1200 },
      selector: '[data-guide="note-title-field"]',
      placement: "bottom",
      titleKey: "guides.notes.step3.title",
      bodyKey: "guides.notes.step3.body",
      advanceOn: "next",
    },
    // 4 — Point at the content textarea.
    {
      selector: '[data-guide="note-content-field"]',
      placement: "top",
      titleKey: "guides.notes.step4.title",
      bodyKey: "guides.notes.step4.body",
      advanceOn: "next",
    },
    // 5 — Point at the Create button. No auto-click — saving persists a note.
    {
      selector: '[data-guide="note-create-button"]',
      placement: "top",
      titleKey: "guides.notes.step5.title",
      bodyKey: "guides.notes.step5.body",
      advanceOn: "next",
    },
  ],
};
