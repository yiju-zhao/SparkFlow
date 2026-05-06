"use client";

import { useState } from "react";
import { Bug, Lightbulb, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

type FeedbackItem = {
  id: string;
  type: "BUG" | "FEATURE" | "IMPROVEMENT";
  status: "OPEN" | "IN_REVIEW" | "PLANNED" | "RESOLVED" | "CLOSED";
  title: string | null;
  message: string;
  adminNote: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: string; email: string; username: string };
};

const STATUS_OPTIONS: Array<FeedbackItem["status"]> = [
  "OPEN",
  "IN_REVIEW",
  "PLANNED",
  "RESOLVED",
  "CLOSED",
];

const TYPE_META: Record<FeedbackItem["type"], { label: string; icon: typeof Bug; tint: string }> = {
  BUG: { label: "Bug", icon: Bug, tint: "text-rose-500" },
  FEATURE: { label: "Feature", icon: Sparkles, tint: "text-violet-500" },
  IMPROVEMENT: { label: "Improvement", icon: Lightbulb, tint: "text-amber-500" },
};

const STATUS_TINT: Record<FeedbackItem["status"], string> = {
  OPEN: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  IN_REVIEW: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  PLANNED: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  RESOLVED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  CLOSED: "bg-muted text-muted-foreground",
};

export function FeedbackTable({ items: initial }: { items: FeedbackItem[] }) {
  const [items, setItems] = useState(initial);
  const [typeFilter, setTypeFilter] = useState<"" | FeedbackItem["type"]>("");
  const [statusFilter, setStatusFilter] = useState<"" | FeedbackItem["status"]>("");

  async function updateStatus(id: string, status: FeedbackItem["status"]) {
    const res = await fetch(`/api/feedback/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      alert("Failed to update status");
      return;
    }
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
  }

  const filtered = items.filter(
    (it) =>
      (!typeFilter || it.type === typeFilter) && (!statusFilter || it.status === statusFilter),
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
        >
          <option value="">All types</option>
          <option value="BUG">Bug</option>
          <option value="FEATURE">Feature</option>
          <option value="IMPROVEMENT">Improvement</option>
        </select>
        <select
          className="h-8 rounded-md border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">{filtered.length} items</span>
      </div>

      <div className="rounded-md border">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-sm font-medium">Type</th>
              <th className="px-4 py-3 text-left text-sm font-medium">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Message</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium">Created</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  No feedback yet.
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const meta = TYPE_META[item.type];
                const Icon = meta.icon;
                return (
                  <tr key={item.id} className="border-b align-top last:border-0">
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <Icon className={cn("h-4 w-4", meta.tint)} />
                        {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium">{item.user.username}</div>
                      <div className="text-xs text-muted-foreground">{item.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-sm max-w-xl">
                      {item.title ? (
                        <div className="font-medium mb-1">{item.title}</div>
                      ) : null}
                      <div className="whitespace-pre-wrap text-muted-foreground">
                        {item.message}
                      </div>
                      {item.pageUrl ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium">Page:</span>{" "}
                          <span className="break-all">{item.pageUrl}</span>
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span
                        className={cn(
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS_TINT[item.status],
                        )}
                      >
                        {item.status}
                      </span>
                      <select
                        className="mt-2 block h-7 rounded-md border bg-background px-2 text-xs"
                        value={item.status}
                        onChange={(e) =>
                          updateStatus(item.id, e.target.value as FeedbackItem["status"])
                        }
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(item.createdAt).toLocaleString()}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
