// Shared formatters and constants for hub-ui components

export const DEFAULT_COLORS = [
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

export function formatNumber(value: unknown): string {
  if (value == null) return "\u2014";
  if (typeof value === "number") return new Intl.NumberFormat().format(value);
  return String(value);
}

export function formatColumnName(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatCellValue(value: unknown): string {
  if (value == null) return "-";
  if (typeof value === "boolean") return value ? "\u2713" : "\u2717";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function fillTemplate(
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
