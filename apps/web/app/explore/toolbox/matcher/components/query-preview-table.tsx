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
  const [editValues, setEditValues] = useState({ name: "", content: "" });

  const handleEditStart = (query: ParsedQuery) => {
    setEditingId(query.id);
    setEditValues({ name: query.name, content: query.content });
  };

  const handleEditSave = () => {
    if (!editingId || !onQueriesChange) return;

    const updated = queries.map((q) =>
      q.id === editingId
        ? { ...q, name: editValues.name, content: editValues.content }
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
            <th className="px-4 py-3 text-left font-medium w-48">Name</th>
            <th className="px-4 py-3 text-left font-medium">Content</th>
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
                    value={editValues.name}
                    onChange={(e) =>
                      setEditValues({ ...editValues, name: e.target.value })
                    }
                    className="h-8"
                  />
                ) : (
                  <span className="font-medium">{query.name || "Unnamed"}</span>
                )}
              </td>
              <td className="px-4 py-3">
                {editingId === query.id ? (
                  <Textarea
                    value={editValues.content}
                    onChange={(e) =>
                      setEditValues({ ...editValues, content: e.target.value })
                    }
                    className="min-h-[60px] resize-none"
                    rows={2}
                  />
                ) : (
                  <p className="text-muted-foreground line-clamp-2">
                    {query.content || "No content"}
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
