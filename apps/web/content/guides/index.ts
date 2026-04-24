import type { GuideDefinition } from "./types";
import { createNotebookGuide } from "./create-notebook";
import { addSourcesGuide } from "./add-sources";
import { byokApiKeysGuide } from "./byok-api-keys";
import { chatWithAiGuide } from "./chat-with-ai";
import { wikiGraphGuide } from "./wiki-graph";
import { notesGuide } from "./notes";
import { conferencesGuide } from "./conferences";
import { matcherGuide } from "./matcher";
import { wechatGuide } from "./wechat";
import { languageThemeGuide } from "./language-theme";

export const GUIDES: GuideDefinition[] = [
  createNotebookGuide,
  addSourcesGuide,
  byokApiKeysGuide,
  chatWithAiGuide,
  wikiGraphGuide,
  notesGuide,
  conferencesGuide,
  matcherGuide,
  wechatGuide,
  languageThemeGuide,
];
