/**
 * Agent module - Modular agent creation framework.
 *
 * Provides a scalable approach to creating agents with different
 * tools, prompts, and memory configurations.
 *
 * Structure:
 * - prompts/  - System prompts for different agent types
 * - tools/    - Tool loaders for different capabilities
 * - types.ts  - Shared type definitions
 * - index.ts  - Agent factory and exports
 */

import { createAgent } from "langchain";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import type { AgentConfig } from "./types";

// Re-export modules
export * from "./types";
export * from "./prompts";
export * from "./tools";

let checkpointer: PostgresSaver | null = null;

/**
 * Get or create the PostgreSQL checkpointer for memory persistence.
 */
export async function getPostgresCheckpointer(): Promise<PostgresSaver> {
  if (!checkpointer) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    checkpointer = PostgresSaver.fromConnString(dbUrl);
    await checkpointer.setup();
    console.log("[getPostgresCheckpointer] Checkpointer initialized");
  }
  return checkpointer;
}

/**
 * Initialize a LangChain agent with the given configuration.
 *
 * This is the core factory function that all agent types use.
 * It provides a consistent approach to agent creation with
 * configurable tools, prompts, and memory.
 *
 * @param config - Agent configuration
 * @returns Configured LangChain agent
 *
 * @example
 * ```typescript
 * // Create a RAG agent
 * const { tools } = await loadRagflowTools({ mcpUrl, datasetIds });
 * const checkpointer = await getPostgresCheckpointer();
 *
 * const agent = await initAgent({
 *   model: "gpt-5",
 *   systemPrompt: RAG_SYSTEM_PROMPT,
 *   tools,
 *   checkpointer,
 * });
 * ```
 */
export async function initAgent(config: AgentConfig) {
  const { model, systemPrompt, tools, checkpointer } = config;

  console.log(`[initAgent] Creating agent with model: ${model}`);
  console.log(`[initAgent] Tools: ${tools.map((t) => t.name).join(", ")}`);

  return createAgent({
    model,
    tools,
    systemPrompt,
    checkpointer,
  });
}

// ============================================================================
// Pre-configured agent factories
// ============================================================================

import { RAG_SYSTEM_PROMPT } from "./prompts";
import { loadRagflowTools } from "./tools";

export interface CreateRAGAgentOptions {
  /** URL of the RAGFlow MCP server */
  ragflowMcpUrl: string;
  /** List of dataset IDs to search */
  datasetIds: string[];
  /** Optional list of specific document IDs to search within */
  documentIds?: string[];
  /** Model to use (default: "gpt-5") */
  model?: string;
}

/**
 * Create a pre-configured RAG agent with RAGFlow tools.
 *
 * This is a convenience function that combines:
 * - RAGFlow MCP tools
 * - RAG system prompt
 * - PostgreSQL memory persistence
 *
 * @param options - Configuration options
 * @returns Configured RAG agent
 *
 * @example
 * ```typescript
 * const agent = await createRAGAgent({
 *   ragflowMcpUrl: "http://localhost:9382/mcp/",
 *   datasetIds: ["bc4177924a7a11f09eff238aa5c10c94"]
 * });
 *
 * const result = await agent.invoke({
 *   messages: [{ role: "user", content: "What is RAG?" }]
 * });
 * ```
 */
export async function createRAGAgent(options: CreateRAGAgentOptions) {
  const {
    ragflowMcpUrl,
    datasetIds,
    documentIds,
    model = "gpt-5",
  } = options;

  // Load tools
  const { tools } = await loadRagflowTools({
    mcpUrl: ragflowMcpUrl,
    datasetIds,
    documentIds,
  });

  // Get checkpointer
  const checkpointer = await getPostgresCheckpointer();

  // Initialize agent
  return initAgent({
    model,
    systemPrompt: RAG_SYSTEM_PROMPT,
    tools,
    checkpointer,
  });
}
