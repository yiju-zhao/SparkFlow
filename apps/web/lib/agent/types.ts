/**
 * Shared types for agent configuration.
 */

import type { StructuredToolInterface } from "@langchain/core/tools";
import type { BaseCheckpointSaver } from "@langchain/langgraph";

export interface AgentConfig {
  /** Model identifier (e.g., "gpt-5", "claude-sonnet-4-5-20250929") */
  model: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Tools available to the agent */
  tools: StructuredToolInterface[];
  /** Optional checkpointer for memory persistence */
  checkpointer?: BaseCheckpointSaver;
}

export interface ToolLoaderResult {
  tools: StructuredToolInterface[];
  metadata?: Record<string, unknown>;
}
