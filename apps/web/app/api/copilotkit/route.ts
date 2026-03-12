import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { BuiltInAgent } from "@copilotkit/runtime/v2";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { NextRequest } from "next/server";

const agent = new BuiltInAgent({
  model: "openai/gpt-4o",
  prompt: `You are a conference research assistant with access to a database of academic conferences, sessions, and publications.

You can:
- Query conferences, sessions, and publications using natural language
- Generate tables to display structured data
- Create charts (bar, line, pie) to visualize trends
- Answer questions about specific conferences or sessions

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
    default: agent
  }
});

const serviceAdapter = new ExperimentalEmptyAdapter();

export const POST = async (req: NextRequest) => {
  const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
    runtime,
    serviceAdapter,
    endpoint: "/api/copilotkit",
  });
  return handleRequest(req);
};
