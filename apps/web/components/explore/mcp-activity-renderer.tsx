"use client";

import { useState, type ReactNode } from "react";
import type { ActivityMessage } from "@copilotkit/shared";

// ------------------------------------------------------------------
// Types matching MCP server payloads
// ------------------------------------------------------------------

interface McpActivityContent {
  result: {
    content?: Array<{ type: string; text: string }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };
  resourceUri: string;
  serverHash: string;
  serverId?: string;
  toolInput?: Record<string, unknown>;
}

interface StatCardData {
  title?: string;
  value?: string | number;
  subtitle?: string;
}

interface TableData {
  title?: string;
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  rowDrilldownPromptTemplate?: string;
}

interface ChartData {
  title?: string;
  subtitle?: string;
  chartType?: "bar" | "line" | "pie";
  type?: "bar" | "line" | "pie";
  labels?: string[];
  values?: number[];
  colors?: string[];
  drilldownPromptTemplate?: string;
}

interface SelectValueData {
  title?: string;
  field?: string;
  instruction?: string;
  confirmLabel?: string;
  continuePromptTemplate?: string;
  cancelPrompt?: string;
  options?: Array<{
    label?: string;
    value?: string;
    count?: number;
    description?: string;
  }>;
}

interface ConfirmActionData {
  title?: string;
  summary?: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  continueMessage?: string;
  cancelMessage?: string;
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------

function extractPayload(content: McpActivityContent): Record<string, unknown> {
  const { result } = content;
  if (result.structuredContent) return result.structuredContent;
  if (Array.isArray(result.content)) {
    for (const block of result.content) {
      if (block.type === "text" && block.text) {
        try {
          const parsed = JSON.parse(block.text);
          if (parsed?.structuredContent) return parsed.structuredContent;
          if (parsed && typeof parsed === "object") return parsed;
        } catch {
          /* not JSON */
        }
      }
    }
  }
  return {};
}

function formatNumber(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  return String(value);
}

function formatColumnName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fillTemplate(
  template: string | undefined,
  row: Record<string, unknown>,
  title?: string,
): string {
  if (!template) return "";
  let result = template.replaceAll("{{title}}", String(title ?? ""));
  for (const [key, value] of Object.entries(row)) {
    result = result.replaceAll(`{{${key}}}`, String(value ?? ""));
  }
  return result;
}

let submitCounter = 0;
function emitWorkflowSubmit(content: string) {
  submitCounter += 1;
  window.postMessage(
    {
      type: "sparkflow.workflow.submit",
      workflowId: `mcp-activity-${Date.now()}-${submitCounter}`,
      source: "mcp-activity-renderer",
      content,
    },
    "*",
  );
}

const DEFAULT_COLORS = [
  "#00D084",
  "#3B82F6",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#EC4899",
  "#10B981",
  "#F97316",
  "#6366F1",
  "#14B8A6",
  "#D946EF",
];

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function StatCard({ data }: { data: StatCardData }) {
  return (
    <div className="rounded-2xl border border-border p-4.5 bg-gradient-to-br from-[#00D084]/8 to-blue-500/4">
      {data.title && (
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2.5">
          {data.title}
        </div>
      )}
      <div className="text-4xl font-bold leading-none mb-2">{formatNumber(data.value)}</div>
      {data.subtitle && <div className="text-xs text-muted-foreground">{data.subtitle}</div>}
    </div>
  );
}

function DataTable({ data }: { data: TableData }) {
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const rows = data.rows ?? [];
  const columns = data.columns ?? (rows.length > 0 ? Object.keys(rows[0]) : []);

  const sorted = [...rows].sort((a, b) => {
    if (sortCol === null) return 0;
    const col = columns[sortCol];
    const va = a[col];
    const vb = b[col];
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp =
      typeof va === "number" && typeof vb === "number"
        ? va - vb
        : String(va).localeCompare(String(vb));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (idx: number) => {
    if (sortCol === idx) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortCol(idx);
      setSortDir("asc");
    }
  };

  const handleRowClick = (row: Record<string, unknown>) => {
    if (!data.rowDrilldownPromptTemplate) return;
    const msg = fillTemplate(data.rowDrilldownPromptTemplate, row, data.title);
    if (msg) emitWorkflowSubmit(msg);
  };

  if (rows.length === 0) {
    return <div className="text-center py-6 text-muted-foreground text-sm">No data to display</div>;
  }

  return (
    <div>
      {data.title && <div className="text-base font-semibold mb-3">{data.title}</div>}
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={col}
                  onClick={() => toggleSort(i)}
                  className="text-left font-medium px-3 py-2.5 bg-muted border-b-2 border-border cursor-pointer select-none hover:bg-accent transition-colors"
                >
                  {formatColumnName(col)}
                  {sortCol === i && (sortDir === "asc" ? " \u2191" : " \u2193")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, ri) => (
              <tr
                key={ri}
                onClick={() => handleRowClick(row)}
                className={`border-b border-border hover:bg-muted/50 ${data.rowDrilldownPromptTemplate ? "cursor-pointer" : ""}`}
              >
                {columns.map((col) => (
                  <td key={col} className="px-3 py-2.5">
                    {formatCellValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "boolean") return value ? "\u2713" : "\u2717";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function BarChart({ data }: { data: ChartData }) {
  const labels = data.labels ?? [];
  const values = data.values ?? [];
  const colors = data.colors ?? DEFAULT_COLORS;
  const maxValue = Math.max(...values, 1);

  const handleBarClick = (label: string, value: number) => {
    if (!data.drilldownPromptTemplate) return;
    const msg = data.drilldownPromptTemplate
      .replaceAll("{{label}}", label)
      .replaceAll("{{value}}", String(value))
      .replaceAll("{{title}}", data.title ?? "");
    if (msg) emitWorkflowSubmit(msg);
  };

  return (
    <div>
      {data.title && <div className="text-base font-semibold mb-1 text-center">{data.title}</div>}
      {data.subtitle && (
        <div className="text-xs text-muted-foreground mb-3 text-center">{data.subtitle}</div>
      )}
      <div className="space-y-2">
        {labels.map((label, i) => {
          const pct = (values[i] / maxValue) * 100;
          const color = colors[i % colors.length];
          return (
            <div
              key={i}
              className={data.drilldownPromptTemplate ? "cursor-pointer" : ""}
              onClick={() => handleBarClick(label, values[i])}
            >
              <div className="flex items-center justify-between text-xs mb-0.5">
                <span className="truncate mr-2">{label}</span>
                <span className="font-medium shrink-0">{formatNumber(values[i])}</span>
              </div>
              <div className="h-5 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full rounded transition-all duration-500"
                  style={{ width: `${pct}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieChart({ data }: { data: ChartData }) {
  const labels = data.labels ?? [];
  const values = data.values ?? [];
  const colors = data.colors ?? DEFAULT_COLORS;
  const total = values.reduce((s, v) => s + v, 0) || 1;

  return (
    <div>
      {data.title && <div className="text-base font-semibold mb-3 text-center">{data.title}</div>}
      <div className="space-y-1.5">
        {labels.map((label, i) => {
          const pct = ((values[i] / total) * 100).toFixed(1);
          const color = colors[i % colors.length];
          return (
            <div key={i} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: color }} />
              <span className="truncate flex-1">{label}</span>
              <span className="font-medium">{formatNumber(values[i])}</span>
              <span className="text-muted-foreground w-12 text-right">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChartRenderer({ data }: { data: ChartData }) {
  const chartType = data.chartType ?? data.type ?? "bar";
  if (chartType === "pie") return <PieChart data={data} />;
  return <BarChart data={data} />;
}

function SelectValue({ data }: { data: SelectValueData }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleConfirm = () => {
    if (!selected) return;
    setSubmitted(true);
    const opt = data.options?.find((o) => (o.value ?? o.label) === selected);
    const msg =
      fillTemplate(data.continuePromptTemplate, {
        value: selected,
        label: opt?.label ?? selected,
        field: data.field ?? "value",
      }) || `Continue the previous request using ${data.field ?? "value"} = "${selected}".`;
    emitWorkflowSubmit(msg);
  };

  const handleCancel = () => {
    if (!data.cancelPrompt) return;
    setSubmitted(true);
    emitWorkflowSubmit(data.cancelPrompt);
  };

  return (
    <div className="rounded-2xl border border-border p-4 bg-gradient-to-b from-[#00D084]/6 to-transparent">
      <div className="text-base font-semibold mb-2">{data.title ?? "Select a value"}</div>
      {data.instruction && (
        <div className="text-xs text-muted-foreground mb-3">{data.instruction}</div>
      )}
      <div className="space-y-2">
        {(data.options ?? []).map((opt) => {
          const val = opt.value ?? opt.label ?? "";
          const isActive = selected === val;
          return (
            <button
              key={val}
              type="button"
              disabled={submitted}
              onClick={() => setSelected(val)}
              className={`w-full text-left rounded-xl border p-2.5 transition-colors ${
                isActive
                  ? "border-[#00D084] bg-[#00D084]/8"
                  : "border-border bg-background hover:bg-muted/50"
              } ${submitted ? "opacity-60" : ""}`}
            >
              <div className="text-sm font-medium">{opt.label ?? opt.value}</div>
              {(opt.count != null || opt.description) && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {opt.count != null && `${opt.count} matches`}
                  {opt.count != null && opt.description && " \u00b7 "}
                  {opt.description}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          {submitted
            ? `Confirmed: ${selected}`
            : selected
              ? `Selected: ${selected}`
              : "Choose one option"}
        </div>
        <div className="flex gap-2">
          {data.cancelPrompt && (
            <button
              type="button"
              disabled={submitted}
              onClick={handleCancel}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            disabled={!selected || submitted}
            onClick={handleConfirm}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-[#00D084] hover:bg-[#00B872] disabled:opacity-50"
          >
            {data.confirmLabel ?? "Use Selection"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmAction({ data }: { data: ConfirmActionData }) {
  const [responded, setResponded] = useState(false);

  const handleConfirm = () => {
    setResponded(true);
    const msg = data.continueMessage ?? "Continue.";
    emitWorkflowSubmit(msg);
  };

  const handleCancel = () => {
    setResponded(true);
    const msg = data.cancelMessage ?? "Cancel the action.";
    emitWorkflowSubmit(msg);
  };

  return (
    <div className="rounded-2xl border border-border p-4 bg-gradient-to-b from-blue-500/5 to-transparent">
      <div className="text-base font-semibold mb-2">{data.title ?? "Confirm"}</div>
      {data.summary && <div className="text-sm leading-relaxed mb-2.5">{data.summary}</div>}
      {data.details && data.details.length > 0 && (
        <ul className="text-xs text-muted-foreground list-disc pl-4 mb-3 space-y-0.5">
          {data.details.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={responded}
          onClick={handleConfirm}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white bg-[#00D084] hover:bg-[#00B872] disabled:opacity-50"
        >
          {data.confirmLabel ?? "Continue"}
        </button>
        <button
          type="button"
          disabled={responded}
          onClick={handleCancel}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-muted hover:bg-muted/80 disabled:opacity-50"
        >
          {data.cancelLabel ?? "Cancel"}
        </button>
      </div>
      {responded && <div className="text-xs text-muted-foreground mt-2">Response sent.</div>}
    </div>
  );
}

// ------------------------------------------------------------------
// Router
// ------------------------------------------------------------------

const RENDERERS: Record<string, (payload: Record<string, unknown>) => ReactNode> = {
  "ui://stat-card": (p) => <StatCard data={p as unknown as StatCardData} />,
  "ui://table": (p) => <DataTable data={p as unknown as TableData} />,
  "ui://chart": (p) => <ChartRenderer data={p as unknown as ChartData} />,
  "ui://select-value": (p) => <SelectValue data={p as unknown as SelectValueData} />,
  "ui://confirm-action": (p) => <ConfirmAction data={p as unknown as ConfirmActionData} />,
};

// ------------------------------------------------------------------
// Public component
// ------------------------------------------------------------------

export function McpActivityRenderer({ message }: { message: ActivityMessage }) {
  const content = message.content as unknown as McpActivityContent | undefined;
  if (!content?.resourceUri || !content?.result) return null;

  const renderer = RENDERERS[content.resourceUri];
  if (!renderer) return null;

  const payload = extractPayload(content);
  if (content.result.isError) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        Tool error: {JSON.stringify(payload)}
      </div>
    );
  }

  return <div className="w-full">{renderer(payload)}</div>;
}
