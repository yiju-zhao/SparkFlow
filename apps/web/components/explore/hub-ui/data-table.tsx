"use client";

import { useState } from "react";
import { formatColumnName, formatCellValue, fillTemplate } from "./helpers";

export interface TableData {
  title?: string;
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  rowDrilldownPromptTemplate?: string;
}

export function DataTable({
  data,
  onFollowUp,
}: {
  data: TableData;
  onFollowUp?: (message: string) => void;
}) {
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
    if (msg) onFollowUp?.(msg);
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
