"use client";

import { makeAssistantToolUI, useThreadRuntime } from "@assistant-ui/react";
import {
  StatCard,
  StatCardSkeleton,
  DataTable,
  TableSkeleton,
  BarChart,
  PieChart,
  ChartSkeleton,
  SelectValue,
  SelectSkeleton,
  ConfirmAction,
  NavigationCards,
  NavigationSkeleton,
} from "./hub-ui";
import type {
  StatCardData,
  TableData,
  ChartData,
  SelectValueData,
  ConfirmActionData,
  NavigationData,
} from "./hub-ui";

// Hub frontend tools (show_chart / show_table / show_stat_card / etc.) are
// dispatched server-side now (apps/langgraph/agents/hub.py's tool_node
// runs them so a ToolMessage is produced — that's what unlocks
// assistant-ui's composer between turns). Each tool returns a camelCase
// dict. LangChain serializes the ToolMessage's content as a JSON STRING,
// which assistant-ui's converter forwards to render() as `result`.
//
// So `result` typically arrives as a string we need to JSON.parse, OR as
// an already-parsed object if a future converter version handles that
// for us. If parsing fails or the field is missing entirely, fall back
// to normalizing the LLM's tool_call args (snake_case → camelCase) so
// the UI still renders.
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
}

function parseResult<T extends object>(result: unknown): T | undefined {
  if (result == null) return undefined;
  if (typeof result === "string") {
    try {
      return JSON.parse(result) as T;
    } catch {
      return undefined;
    }
  }
  if (typeof result === "object") return result as T;
  return undefined;
}

function normalizeFrontendArgs<T extends object>(args: Record<string, unknown> | undefined): T {
  if (!args) return {} as T;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(args)) {
    out[snakeToCamelKey(k)] = v;
  }
  // show_navigation's prompt accepts `pages: [{ title, url, description }]`,
  // but NavigationCards renders from `pages: [{ title, path, description }]`.
  // Rename per page so the component receives what it expects.
  if (Array.isArray(out.pages)) {
    out.pages = (out.pages as Array<Record<string, unknown>>).map((p) => {
      const np: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(p)) {
        np[snakeToCamelKey(pk)] = pv;
      }
      if (np.url && !np.path) np.path = np.url;
      return np;
    });
  }
  return out as T;
}

// Combined: prefer parsed-tool-result, fall back to normalized args.
function pickToolData<T extends object>(
  result: unknown,
  args: Record<string, unknown> | undefined,
): T {
  return parseResult<T>(result) ?? normalizeFrontendArgs<T>(args);
}

// Helper hook: returns a callback that appends a user follow-up message
function useFollowUp() {
  const runtime = useThreadRuntime();
  return (message: string) => {
    runtime.append({
      role: "user",
      content: [{ type: "text", text: message }],
    });
  };
}

// ─── show_stat_card ─────────────────────────────────────────────────────────

export const ShowStatCardUI = makeAssistantToolUI<Record<string, unknown>, StatCardData>({
  toolName: "show_stat_card",
  render: ({ args, result, status }) => {
    if (status.type === "running") return <StatCardSkeleton />;
    const data = pickToolData<StatCardData>(result, args);
    if (!data || Object.keys(data).length === 0) return null;
    return <StatCard data={data} />;
  },
});

// ─── show_table ─────────────────────────────────────────────────────────────

function TableToolRender({
  args,
  result,
  status,
}: {
  args?: Record<string, unknown>;
  result?: TableData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <TableSkeleton />;
  const data = pickToolData<TableData>(result, args);
  if (!data || Object.keys(data).length === 0) return null;
  return <DataTable data={data} onFollowUp={followUp} />;
}

export const ShowTableUI = makeAssistantToolUI<Record<string, unknown>, TableData>({
  toolName: "show_table",
  render: (props) => (
    <TableToolRender args={props.args} result={props.result} status={props.status} />
  ),
});

// ─── show_chart ─────────────────────────────────────────────────────────────

function ChartToolRender({
  args,
  result,
  status,
}: {
  args?: Record<string, unknown>;
  result?: ChartData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <ChartSkeleton />;
  const data = pickToolData<ChartData>(result, args);
  if (!data || Object.keys(data).length === 0) return null;

  const chartType = data.chartType ?? data.type ?? "bar";
  if (chartType === "pie") {
    return <PieChart data={data} />;
  }
  return <BarChart data={data} onFollowUp={followUp} />;
}

export const ShowChartUI = makeAssistantToolUI<Record<string, unknown>, ChartData>({
  toolName: "show_chart",
  render: (props) => (
    <ChartToolRender args={props.args} result={props.result} status={props.status} />
  ),
});

// ─── show_select ─────────────────────────────────────────────────────────────

function SelectToolRender({
  args,
  result,
  status,
}: {
  args?: Record<string, unknown>;
  result?: SelectValueData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <SelectSkeleton />;
  const data = pickToolData<SelectValueData>(result, args);
  if (!data || Object.keys(data).length === 0) return null;
  return <SelectValue data={data} onFollowUp={followUp} />;
}

export const ShowSelectUI = makeAssistantToolUI<Record<string, unknown>, SelectValueData>({
  toolName: "show_select",
  render: (props) => (
    <SelectToolRender args={props.args} result={props.result} status={props.status} />
  ),
});

// ─── show_confirm ────────────────────────────────────────────────────────────

function ConfirmToolRender({
  args,
  result,
  status,
}: {
  args?: Record<string, unknown>;
  result?: ConfirmActionData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return null;
  const data = pickToolData<ConfirmActionData>(result, args);
  if (!data || Object.keys(data).length === 0) return null;
  return <ConfirmAction data={data} onFollowUp={followUp} />;
}

export const ShowConfirmUI = makeAssistantToolUI<Record<string, unknown>, ConfirmActionData>({
  toolName: "show_confirm",
  render: (props) => (
    <ConfirmToolRender args={props.args} result={props.result} status={props.status} />
  ),
});

// ─── show_navigation ────────────────────────────────────────────────────────

export const ShowNavigationUI = makeAssistantToolUI<Record<string, unknown>, NavigationData>({
  toolName: "show_navigation",
  render: ({ args, result, status }) => {
    if (status.type === "running") return <NavigationSkeleton />;
    const data = pickToolData<NavigationData>(result, args);
    if (!data || !data.pages || data.pages.length === 0) return null;
    return <NavigationCards data={data} />;
  },
});

// ─── Registry component ─────────────────────────────────────────────────────

/**
 * Place inside the AssistantRuntimeProvider tree to register all hub tool UIs.
 */
export function HubToolUIs() {
  return (
    <>
      <ShowStatCardUI />
      <ShowTableUI />
      <ShowChartUI />
      <ShowSelectUI />
      <ShowConfirmUI />
      <ShowNavigationUI />
    </>
  );
}
