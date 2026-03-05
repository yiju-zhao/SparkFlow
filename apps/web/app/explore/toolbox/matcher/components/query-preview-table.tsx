"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ParsedQuery } from "@/lib/matcher/types";

interface QueryPreviewTableProps {
  queries: ParsedQuery[];
  onQueriesChange?: (queries: ParsedQuery[]) => void;
  readOnly?: boolean;
  className?: string;
}

export function QueryPreviewTable({
  queries,
  onQueriesChange,
  readOnly = false,
  className,
}: QueryPreviewTableProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ key: "", area: "", query: "" });

  const handleEditStart = (q: ParsedQuery) => {
    setEditingId(q.id);
    setEditValues({ key: q.key, area: q.area, query: q.query });
  };

  const handleEditSave = () => {
    if (!editingId || !onQueriesChange) return;

    const updated = queries.map((q) =>
      q.id === editingId
        ? { ...q, key: editValues.key, area: editValues.area, query: editValues.query }
        : q,
    );
    onQueriesChange(updated);
    setEditingId(null);
  };

  const handleEditCancel = () => {
    setEditingId(null);
  };

  if (queries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No queries to display
      </div>
    );
  }

  return (
    <div className={cn("w-full overflow-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="px-4 py-3 text-left font-medium w-12">#</th>
            <th className="px-4 py-3 text-left font-medium w-40">Key</th>
            <th className="px-4 py-3 text-left font-medium w-40">Area</th>
            <th className="px-4 py-3 text-left font-medium">Query</th>
            {!readOnly && <th className="px-4 py-3 w-20"></th>}
          </tr>
        </thead>
        <tbody>
          {queries.map((query, index) => (
            <tr
              key={query.id}
              className={cn(
                "border-b transition-colors hover:bg-muted/30",
                editingId === query.id && "bg-muted/50",
              )}
            >
              <td className="px-4 py-3 text-muted-foreground">
                {index + 1}
              </td>
              <td className="px-4 py-3">
                {editingId === query.id ? (
                  <Input
                    value={editValues.key}
                    onChange={(e) =>
                      setEditValues({ ...editValues, key: e.target.value })
                    }
                    className="h-8"
                  />
                ) : (
                  <span className="font-medium">{query.key || "Unnamed"}</span>
                )}
              </td>
              <td className="px-4 py-3">
                {editingId === query.id ? (
                  <Input
                    value={editValues.area}
                    onChange={(e) =>
                      setEditValues({ ...editValues, area: e.target.value })
                    }
                    className="h-8"
                  />
                ) : (
                  <span className="text-muted-foreground">{query.area || "-"}</span>
                )}
              </td>
              <td className="px-4 py-3">
                {editingId === query.id ? (
                  <Textarea
                    value={editValues.query}
                    onChange={(e) =>
                      setEditValues({ ...editValues, query: e.target.value })
                    }
                    className="min-h-[60px] resize-none"
                    rows={2}
                  />
                ) : (
                  <p className="text-muted-foreground line-clamp-2">
                    {query.query || "No query"}
                  </p>
                )}
              </td>
              {!readOnly && (
                <td className="px-4 py-3">
                  {editingId === query.id ? (
                    <div className="flex gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleEditSave}
                        className="h-8 w-8"
                      >
                        <Check className="h-4 w-4 text-green-600" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleEditCancel}
                        className="h-8 w-8"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => handleEditStart(query)}
                      className="h-8 w-8"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
