"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronUp, ChevronDown, ExternalLink } from "lucide-react";

// Zod schema for AI-generated table props
export const GenerativeTablePropsSchema = z.object({
  title: z.string().describe("The title displayed above the table"),
  columns: z
    .array(
      z.object({
        key: z.string().describe("The key to access this column's value in each row object"),
        label: z.string().describe("The display label for the column header"),
        type: z.enum(["string", "number", "date"]).optional().describe("The data type for sorting purposes"),
      })
    )
    .describe("Column definitions for the table"),
  rows: z.array(z.record(z.string(), z.unknown())).describe("Array of row data objects"),
  rowLinkPrefix: z.string().optional().describe("URL prefix for row click navigation. If provided, clicking a row navigates to this prefix + row id"),
  pageSize: z.number().optional().default(10).describe("Number of rows per page, defaults to 10"),
});

export type GenerativeTableProps = z.infer<typeof GenerativeTablePropsSchema>;

type SortDirection = "asc" | "desc" | null;

interface SortState {
  columnKey: string | null;
  direction: SortDirection;
}

export function GenerativeTable({
  title,
  columns,
  rows,
  rowLinkPrefix,
  pageSize = 10,
}: GenerativeTableProps) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [sortState, setSortState] = useState<SortState>({
    columnKey: null,
    direction: null,
  });

  // Sort rows based on current sort state
  const sortedRows = useMemo(() => {
    if (!sortState.columnKey || !sortState.direction) {
      return rows;
    }

    return [...rows].sort((a, b) => {
      const aValue = a[sortState.columnKey!];
      const bValue = b[sortState.columnKey!];

      // Handle null/undefined
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortState.direction === "asc" ? 1 : -1;
      if (bValue == null) return sortState.direction === "asc" ? -1 : 1;

      // Compare values
      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortState.direction === "asc" ? comparison : -comparison;
    });
  }, [rows, sortState]);

  // Paginate sorted rows
  const totalPages = Math.ceil(sortedRows.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedRows = sortedRows.slice(startIndex, startIndex + pageSize);

  // Handle column header click for sorting
  const handleSort = (columnKey: string) => {
    setSortState((prev) => {
      if (prev.columnKey !== columnKey) {
        return { columnKey, direction: "asc" };
      }
      if (prev.direction === "asc") {
        return { columnKey, direction: "desc" };
      }
      return { columnKey: null, direction: null };
    });
  };

  // Handle row click for navigation
  const handleRowClick = (row: Record<string, unknown>) => {
    if (!rowLinkPrefix || row.id == null) return;
    router.push(`${rowLinkPrefix}${row.id}`);
  };

  // Get sort icon for column
  const getSortIcon = (columnKey: string) => {
    if (sortState.columnKey !== columnKey) {
      return null;
    }
    if (sortState.direction === "asc") {
      return <ChevronUp className="h-4 w-4" />;
    }
    if (sortState.direction === "desc") {
      return <ChevronDown className="h-4 w-4" />;
    }
    return null;
  };

  const hasRows = rows.length > 0;
  const isNavigable = !!rowLinkPrefix;

  return (
    <div className="bg-card rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hasRows && (
          <span className="text-xs text-muted-foreground">
            {rows.length} result{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {hasRows ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead
                    key={column.key}
                    className="cursor-pointer select-none hover:bg-muted/50"
                    onClick={() => handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{column.label}</span>
                      {getSortIcon(column.key)}
                    </div>
                  </TableHead>
                ))}
                {isNavigable && <TableHead className="w-10"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedRows.map((row, rowIndex) => (
                <TableRow
                  key={row.id?.toString() || rowIndex}
                  className={isNavigable ? "cursor-pointer" : ""}
                  onClick={() => handleRowClick(row)}
                >
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {formatCellValue(row[column.key], column.type)}
                    </TableCell>
                  ))}
                  {isNavigable && (
                    <TableCell>
                      <ExternalLink className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-2 border-t">
              <span className="text-xs text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="h-24 flex items-center justify-center text-muted-foreground border border-dashed rounded-lg">
          <p className="text-sm">No data to display</p>
        </div>
      )}
    </div>
  );
}

// Helper to format cell values based on type
function formatCellValue(
  value: unknown,
  type?: "string" | "number" | "date"
): string {
  if (value == null) return "-";

  if (type === "date" && typeof value === "string") {
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return String(value);
}
