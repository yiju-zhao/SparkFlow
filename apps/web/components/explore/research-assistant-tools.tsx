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
// declared in apps/langgraph/tools/hub_ui.py but apps/langgraph/agents/
// hub.py's tool_node intentionally SKIPS dispatch for them (the comment
// reads "client renders; no ToolMessage produced"). Result: these
// makeAssistantToolUI handlers never receive `result` — only `args` from
// the LLM's tool_call.
//
// The LLM passes args in Python's snake_case (`chart_type`,
// `drilldown_prompt_template`, ...) because that's the parameter name in
// the @tool function. The hub-ui components expect camelCase. Convert at
// the boundary so both shapes work — `result` (if a future change starts
// dispatching) wins; otherwise fall back to normalized args.
function snakeToCamelKey(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => (c as string).toUpperCase());
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
    const data = result ?? normalizeFrontendArgs<StatCardData>(args);
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
  const data = result ?? normalizeFrontendArgs<TableData>(args);
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
  const data = result ?? normalizeFrontendArgs<ChartData>(args);
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
  const data = result ?? normalizeFrontendArgs<SelectValueData>(args);
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
  const data = result ?? normalizeFrontendArgs<ConfirmActionData>(args);
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
    const data = result ?? normalizeFrontendArgs<NavigationData>(args);
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
