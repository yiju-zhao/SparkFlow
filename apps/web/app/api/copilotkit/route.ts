import {
  CopilotRuntime,
  ExperimentalEmptyAdapter,
  copilotRuntimeNextJSAppRouterEndpoint,
} from "@copilotkit/runtime";
import { LangGraphAgent } from "@copilotkit/runtime/langgraph";
import { MCPAppsMiddleware } from "@ag-ui/mcp-apps-middleware";
import { NextRequest } from "next/server";

const serviceAdapter = new ExperimentalEmptyAdapter();

function getLangGraphUrl(): string {
  const url =
    process.env.LANGGRAPH_API_URL || process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;

  if (!url) {
    throw new Error(
      "LangGraph backend URL is not configured. Set LANGGRAPH_API_URL or NEXT_PUBLIC_LANGGRAPH_API_URL to the reachable LangGraph server URL.",
    );
  }

  return url;
}

function createRuntime() {
  const hubAgent = new LangGraphAgent({
    deploymentUrl: getLangGraphUrl(),
    graphId: "hub",
  }).use(
    new MCPAppsMiddleware({
      mcpServers: [
        {
          type: "http",
          url: process.env.MCP_SERVER_URL || "http://localhost:3108/mcp",
          serverId: "hub-render-server",
        },
      ],
    }),
  );

  return new CopilotRuntime({
    agents: {
      hub: hubAgent,
    },
  });
}

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
      langGraphUrl:
        process.env.LANGGRAPH_API_URL ||
        process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ||
        "missing",
    });
  }

  try {
    const runtime = createRuntime();
    const { handleRequest } = copilotRuntimeNextJSAppRouterEndpoint({
      runtime,
      serviceAdapter,
      endpoint: "/api/copilotkit",
    });
    return await handleRequest(req);
  } catch (error) {
    console.error("[copilotkit] Route error:", error);
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to reach LangGraph backend",
      },
      { status: 503 },
    );
  }
};
