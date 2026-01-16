import type { Message } from "@langchain/langgraph-sdk";

// Define tool call types to match the Python agent
export type RetrieveDocumentsToolCall = {
    name: "retrieve_documents";
    args: { query: string };
    id?: string;
};

export type AgentToolCalls = RetrieveDocumentsToolCall;

export interface AgentState {
    messages: Message<AgentToolCalls>[];
    dataset_ids?: string[];
    notebook_id?: string;
}
