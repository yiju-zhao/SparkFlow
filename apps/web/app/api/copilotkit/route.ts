import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { NextRequest } from "next/server";

const hubAgent = new LangGraphAgent({
  deploymentUrl:
    process.env.LANGGRAPH_API_URL ||
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
    "http://localhost:2024",
  graphId: "hub",
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url: process.env.MCP_SERVER_URL || "http://localhost:3108/mcp",
        serverId: "hub-render-server",
      },
      {
        type: "http",
        url: process.env.TOOLBOX_SERVER_URL || "http://localhost:5000",
        serverId: "hub-toolbox-server",
      },
    ],
  }),
);

const runtime = new CopilotRuntime({
  agents: {
    hub: hubAgent,
  },
});

const serviceAdapter = new ExperimentalEmptyAdapter();

export const POST = async (req: NextRequest) => {
  if (process.env.NODE_ENV !== "production") {
    const body = (await req
      .clone()
      .json()
      .catch(() => null)) as {
      agentName?: string;
      messages?: Array<{ role?: string; content?: unknown }>;
    } | null;

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
