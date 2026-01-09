import { createAgent } from "langchain";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const SYSTEM_PROMPT = `You are an assistant for question-answering tasks.
Use the retrieval tools to search for relevant context before answering.
If you don't know the answer, just say that you don't know.
Be comprehensive, cite sources using [Document Name] format, and use markdown formatting.`;

let checkpointer: PostgresSaver | null = null;
let mcpClient: MultiServerMCPClient | null = null;

async function getCheckpointer() {
  if (!checkpointer) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    checkpointer = PostgresSaver.fromConnString(dbUrl);
    await checkpointer.setup();
  }
  return checkpointer;
}

async function getMCPClient(mcpServerUrl: string) {
  if (!mcpClient) {
    mcpClient = new MultiServerMCPClient({
      ragflow: {
        transport: "sse",
        url: mcpServerUrl,
      },
    });
  }
  return mcpClient;
}

export async function createRAGAgent(mcpServerUrl: string) {
  const client = await getMCPClient(mcpServerUrl);
  const tools = await client.getTools();
  const cp = await getCheckpointer();

  return createAgent({
    model: "gpt-5",
    tools,
    systemPrompt: SYSTEM_PROMPT,
    checkpointer: cp,
  });
}
