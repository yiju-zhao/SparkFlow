/**
 * RAGFlow MCP tools loader.
 *
 * Connects to the RAGFlow MCP server and loads retrieval tools
 * for use with LangChain agents.
 */

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import type { ToolLoaderResult } from "../types";

export interface RagflowToolsOptions {
  /** URL of the RAGFlow MCP server */
  mcpUrl: string;
  /** List of dataset IDs to search */
  datasetIds: string[];
  /** Optional list of specific document IDs to search within */
  documentIds?: string[];
}

/**
 * Load retrieval tools from the RAGFlow MCP server.
 *
 * @param options - Configuration options
 * @returns Tools loaded from the MCP server
 *
 * @example
 * ```typescript
 * const { tools } = await loadRagflowTools({
 *   mcpUrl: "http://localhost:9382/mcp/",
 *   datasetIds: ["bc4177924a7a11f09eff238aa5c10c94"]
 * });
 * ```
 */
export async function loadRagflowTools(
  options: RagflowToolsOptions
): Promise<ToolLoaderResult> {
  const { mcpUrl, datasetIds, documentIds = [] } = options;

  console.log(`[loadRagflowTools] Connecting to MCP server: ${mcpUrl}`);
  console.log(`[loadRagflowTools] Dataset IDs: ${datasetIds.join(", ")}`);
  if (documentIds.length > 0) {
    console.log(`[loadRagflowTools] Document IDs: ${documentIds.join(", ")}`);
  }

  const mcpClient = new MultiServerMCPClient({
    ragflow: {
      transport: "http",
      url: mcpUrl,
    },
  });

  try {
    const tools = await mcpClient.getTools();
    console.log(
      `[loadRagflowTools] Retrieved ${tools.length} tools from MCP server`
    );

    return {
      tools,
      metadata: {
        datasetIds,
        documentIds,
        mcpUrl,
      },
    };
  } catch (error) {
    console.error(`[loadRagflowTools] Failed to connect to MCP server:`, error);
    throw error;
  }
}
