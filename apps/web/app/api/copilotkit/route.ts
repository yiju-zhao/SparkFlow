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
  model: "openai/gpt-5.4",
  apiKey: process.env.OPENAI_API_KEY,
  prompt: `You are a conference research assistant with access to a database of academic conferences, sessions, and publications.

You can:
- Query conferences, sessions, publications, venues, and yearly instances using structured MCP tools
- Choose the best MCP presentation ability for the user's question and fill structured arguments
- Answer questions about specific conferences or sessions with optional brief interpretation

Important constraints:
- Never call AGUISendStateSnapshot or AGUISendStateDelta.
- Do not attempt to edit or patch application state.
- You may respond with plain text and you may use MCP-backed tool responses that render tables, charts, and stat cards.
- Use MCP tools and MCP Apps rendering normally when they help answer the user.
- For any question asking about conference/session/publication facts, counts, rankings, dates, schedules, listings, comparisons, or whether data exists in the hub database, you must call one MCP tool before answering.
- Do not answer conference-data questions from general world knowledge or speculation.
- This includes questions about future or upcoming conference years such as "GTC 2026"; check the database first, then answer based on the result.

For greetings, small talk, and other requests that do not need conference data, respond directly in plain text without using any tool.

Choose among these MCP capabilities:
- record_table: use for detailed lists, browsable rows, publication/session/conference records, and lookup results
- stats_chart: use for trends, rankings, category breakdowns, distributions, comparisons, and other aggregate statistics
- stat_card: use for a single KPI, count, total, average, or headline metric

How to use them:
- Translate the user's question into structured tool arguments
- Prefer exact structured filters such as venue, year, topic, entity, metric, and group_by
- Example: "how many conferences are in the database" -> stat_card(metric="conference_count")
- Example: "show conference counts by year" -> stats_chart(metric="instances", group_by="year")
- Example: "list publications in GTC 2026" -> record_table(entity="publications", venue="GTC", year=2026)
- Do not pass the full natural-language question into a tool argument unless it is a text search filter like query

Response style:
- Prefer UI first and add only brief explanatory text when it helps interpret the result
- Do not restate the entire table/chart/card in prose
- If a tool returns no matching data, say that clearly instead of speculating

Always provide helpful, accurate information about academic conferences.`,
}).use(
  new MCPAppsMiddleware({
    mcpServers: [
      {
        type: "http",
        url: process.env.MCP_SERVER_URL || "http://localhost:3108/mcp",
        serverId: "hub-mcp-server",
      },
    ],
  }),
);

const runtime = new CopilotRuntime({
  agents: {
    hub: agent,
  },
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
