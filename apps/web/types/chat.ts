/**
 * Chat-related types for the agent integration.
 * Moved from components/chat/types.ts
 */

import type { Message } from "@langchain/langgraph-sdk";

/**
 * Tool call for document retrieval.
 */
export interface RetrieveDocumentsToolCall {
  name: "retrieve_documents";
  args: { query: string };
  id?: string;
}

/**
 * Union type for all agent tool calls.
 */
export type AgentToolCalls = RetrieveDocumentsToolCall;

/**
 * Agent state as received from the LangGraph backend.
 */
export interface AgentState {
  messages: Message<AgentToolCalls>[];
  dataset_ids?: string[];
  notebook_id?: string;
}

/**
 * Incoming message format for chat API.
 */
export interface IncomingMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Streaming event types from the agent.
 */
export type StreamEventType = "text" | "error" | "done";

/**
 * Parsed streaming event from the agent.
 */
export interface StreamEvent {
  type: StreamEventType;
  text?: string;
  error?: string;
}
