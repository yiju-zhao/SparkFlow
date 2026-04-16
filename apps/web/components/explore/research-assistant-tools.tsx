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
  render: ({ result, status }) => {
    if (status.type === "running") return <StatCardSkeleton />;
    if (!result) return null;
    return <StatCard data={result} />;
  },
});

// ─── show_table ─────────────────────────────────────────────────────────────

function TableToolRender({
  result,
  status,
}: {
  result?: TableData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <TableSkeleton />;
  if (!result) return null;
  return <DataTable data={result} onFollowUp={followUp} />;
}

export const ShowTableUI = makeAssistantToolUI<Record<string, unknown>, TableData>({
  toolName: "show_table",
  render: (props) => <TableToolRender result={props.result} status={props.status} />,
});

// ─── show_chart ─────────────────────────────────────────────────────────────

function ChartToolRender({
  result,
  status,
}: {
  result?: ChartData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <ChartSkeleton />;
  if (!result) return null;

  const chartType = result.chartType ?? result.type ?? "bar";
  if (chartType === "pie") {
    return <PieChart data={result} />;
  }
  return <BarChart data={result} onFollowUp={followUp} />;
}

export const ShowChartUI = makeAssistantToolUI<Record<string, unknown>, ChartData>({
  toolName: "show_chart",
  render: (props) => <ChartToolRender result={props.result} status={props.status} />,
});

// ─── show_select ─────────────────────────────────────────────────────────────

function SelectToolRender({
  result,
  status,
}: {
  result?: SelectValueData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return <SelectSkeleton />;
  if (!result) return null;
  return <SelectValue data={result} onFollowUp={followUp} />;
}

export const ShowSelectUI = makeAssistantToolUI<Record<string, unknown>, SelectValueData>({
  toolName: "show_select",
  render: (props) => <SelectToolRender result={props.result} status={props.status} />,
});

// ─── show_confirm ────────────────────────────────────────────────────────────

function ConfirmToolRender({
  result,
  status,
}: {
  result?: ConfirmActionData;
  status: { type: string };
}) {
  const followUp = useFollowUp();
  if (status.type === "running") return null;
  if (!result) return null;
  return <ConfirmAction data={result} onFollowUp={followUp} />;
}

export const ShowConfirmUI = makeAssistantToolUI<Record<string, unknown>, ConfirmActionData>({
  toolName: "show_confirm",
  render: (props) => <ConfirmToolRender result={props.result} status={props.status} />,
});

// ─── show_navigation ────────────────────────────────────────────────────────

export const ShowNavigationUI = makeAssistantToolUI<Record<string, unknown>, NavigationData>({
  toolName: "show_navigation",
  render: ({ result, status }) => {
    if (status.type === "running") return <NavigationSkeleton />;
    if (!result) return null;
    return <NavigationCards data={result} />;
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
