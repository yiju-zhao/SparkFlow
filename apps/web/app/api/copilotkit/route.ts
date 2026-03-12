import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const agent = new BuiltInAgent({
  model: "openai/gpt-4o",
  apiKey: process.env.OPENAI_API_KEY,
  prompt: `You are a conference research assistant with access to a database of academic conferences, sessions, and publications.

You can:
- Query conferences, sessions, and publications using natural language
- Generate tables to display structured data
- Create charts (bar, line, pie) to visualize trends
- Answer questions about specific conferences or sessions

Important constraints:
- Never call AGUISendStateSnapshot or AGUISendStateDelta.
- Do not attempt to edit or patch application state.
- You may respond with plain text and you may use MCP-backed tool responses that render tables and charts.
- Use MCP tools and MCP Apps rendering normally when they help answer the user.

For greetings, small talk, and other requests that do not need conference data, respond directly in plain text without using any tool.

When displaying data:
- Use the query_conferences tool to search the database
- Tables and charts will be rendered automatically based on your response

Always provide helpful, accurate information about academic conferences.`,
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url: process.env.MCP_SERVER_URL || "http://localhost:3108/mcp",
        serverId: "hub-mcp-server"
      }
    ]
  })
);

const runtime = new CopilotRuntime({
  agents: {
    hub: agent
  }
});

const serviceAdapter = new ExperimentalEmptyAdapter();

export const POST = async (req: NextRequest) => {
  if (!process.env.OPENAI_API_KEY) {
    console.error("[copilotkit] Missing OPENAI_API_KEY for hub BuiltInAgent");
    return NextResponse.json(
      { error: "Hub agent is not configured: OPENAI_API_KEY is missing." },
      { status: 500 },
    );
  }

  if (process.env.NODE_ENV !== "production") {
    const body = await req
      .clone()
      .json()
      .catch(() => null) as
      | {
          agentName?: string;
          messages?: Array<{ role?: string; content?: unknown }>;
        }
      | null;

    const lastMessage = body?.messages?.at(-1);
    console.log("[copilotkit] Incoming request", {
      agentName: body?.agentName ?? "unknown",
      messageCount: body?.messages?.length ?? 0,
      lastRole: lastMessage?.role ?? "unknown",
      lastContentType: Array.isArray(lastMessage?.content)
        ? "array"
        : typeof lastMessage?.content,
    });
  }

  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
