"use client";

import { useComponent } from "@copilotkit/react-core/v2";
import { z } from "zod/v3";
import { GenerativeTable } from "./generative-table";
import { GenerativeChart } from "./generative-chart";

// Re-define schemas using Zod 3-compatible pattern for CopilotKit
// CopilotKit expects Zod 3 ZodType interface
// Using z.any() for record values to avoid deep type instantiation issues
const TableSchema = z.object({
  title: z.string().describe("The title displayed above the table"),
  columns: z
    .array(
      z.object({
        key: z.string(),
        label: z.string(),
        type: z.enum(["string", "number", "date"]).optional(),
      })
    )
    .describe("Column definitions for the table"),
  rows: z.array(z.record(z.string(), z.any())).describe("Array of row data objects"),
  rowLinkPrefix: z.string().optional().describe("URL prefix for row click navigation"),
  pageSize: z.number().optional().default(10).describe("Number of rows per page"),
});

const ChartSchema = z.object({
  title: z.string().describe("The title displayed above the chart"),
  chartType: z.enum(["bar", "line", "pie"]).describe("The type of chart to render"),
  data: z
    .array(
      z.object({
        label: z.string().describe("The label for this data point"),
        value: z.number().describe("The numeric value for this data point"),
      })
    )
    .describe("Array of data points with labels and values"),
});

// Type assertion to avoid deep type instantiation issues with useComponent
type AnyZodSchema = z.ZodType<any, any, any>;

/**
 * Hook that registers generative UI components with CopilotKit.
 *
 * Call this hook inside a component that is wrapped by CopilotKitProvider
 * to enable the AI assistant to render tables and charts inline in chat.
 *
 * @example
 * ```tsx
 * function ResearchAssistantPanel() {
 *   useGenerativeComponents();
 *   return <CopilotChat />;
 * }
 * ```
 */
export function useGenerativeComponents() {
  // Register table component for displaying session/conference data
  useComponent({
    name: "showTable",
    description:
      "Display a table with session or conference data. Use this when presenting structured data like search results, session lists, or venue information.",
    parameters: TableSchema as AnyZodSchema,
    render: GenerativeTable,
  });

  // Register chart component for data visualization
  useComponent({
    name: "showChart",
    description:
      "Display a chart (bar, line, or pie) with data from the research hub. Use this to visualize trends, distributions, or comparisons.",
    parameters: ChartSchema as AnyZodSchema,
    render: GenerativeChart,
  });
}

// Re-export components for direct use if needed
export { GenerativeTable };
export { GenerativeChart };
// Export schemas with CopilotKit-compatible naming
export const GenerativeTablePropsSchema = TableSchema;
export const GenerativeChartPropsSchema = ChartSchema;
