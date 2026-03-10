"use client";

import { useSetAIContext, type AIContext } from "./ai-context";

interface SetAIContextProps {
  context: AIContext;
}

/**
 * Component that sets AI context when mounted.
 * Place this at the top of a page to provide context to the AI assistant.
 */
export function SetAIContext({ context }: SetAIContextProps) {
  useSetAIContext(context);
  return null;
}
