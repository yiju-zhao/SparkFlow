"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ParsedQuery } from "@/lib/matcher/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface HistoryJob {
  id: string;
  targetType: string;
  status: string;
  queryCount: number;
  matchCount: number;
  topK: number;
  searchK: number;
  progress: number;
  queryData: ParsedQuery[] | null;
  createdAt: string;
  instance: {
    name: string;
    venue: { name: string };
  };
}

function getStatusColor(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
    case "PROCESSING":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
    case "COMPLETED":
      return "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200";
    case "FAILED":
      return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
    case "CANCELLED":
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function formatRelativeTime(date: string) {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return new Date(date).toLocaleDateString();
}

export function HistoryTable({ jobs }: { jobs: HistoryJob[] }) {
  const router = useRouter();
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (jobId: string) => {
    if (!confirm("Delete this job and its result files?")) return;

    setDeletingId(jobId);
    try {
      const res = await fetch(`/api/matcher/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || "Failed to delete job");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete job");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleExpand = (jobId: string) => {
    setExpandedJobId((prev) => (prev === jobId ? null : jobId));
  };

  // Group queries by BU for display
  const groupByBu = (queries: ParsedQuery[]) => {
    const groups: Record<
      string,
      {
        queries: string[];
        optimizedQueryNative?: string;
        optimizedQueryEn?: string;
        optimizationFocuses: string[];
      }
    > = {};

    for (const q of queries) {
      if (!groups[q.bu]) {
        groups[q.bu] = {
          queries: [],
          optimizationFocuses: [],
        };
      }

      groups[q.bu].queries.push(q.query);
      if (!groups[q.bu].optimizedQueryNative && q.optimizedQueryNative) {
        groups[q.bu].optimizedQueryNative = q.optimizedQueryNative;
      }
      if (!groups[q.bu].optimizedQueryEn && q.optimizedQueryEn) {
        groups[q.bu].optimizedQueryEn = q.optimizedQueryEn;
      }
      if (groups[q.bu].optimizationFocuses.length === 0 && q.optimizationFocuses?.length) {
        groups[q.bu].optimizationFocuses = q.optimizationFocuses;
      }
    }

    return groups;
  };

  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8" />
            <TableHead>Instance</TableHead>
            <TableHead>Target</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-center">Queries</TableHead>
            <TableHead className="text-center">Top K / Search K</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const isExpanded = expandedJobId === job.id;
            const queries = job.queryData as ParsedQuery[] | null;
            const hasQueries = queries && queries.length > 0;

            return (
              <Fragment key={job.id}>
                <TableRow
                  className={hasQueries ? "cursor-pointer" : ""}
                  onClick={() => hasQueries && toggleExpand(job.id)}
                >
                  <TableCell className="w-8 pr-0">
                    {hasQueries && (
                      isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{job.instance.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {job.instance.venue.name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">
                      {job.targetType.toLowerCase()}s
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(job.status)} variant="outline">
                      {job.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{job.queryCount}</TableCell>
                  <TableCell className="text-center text-muted-foreground text-sm">
                    {job.topK} / {job.searchK}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatRelativeTime(job.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="flex items-center justify-end gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {job.status === "COMPLETED" && (
                        <a href={`/api/matcher/jobs/${job.id}/download`} download>
                          <Button variant="outline" size="sm">
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        </a>
                      )}
                      {job.status === "PROCESSING" && (
                        <span className="text-sm text-muted-foreground">
                          {job.progress}%
                        </span>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(job.id)}
                        disabled={deletingId === job.id}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>

                {isExpanded && hasQueries && (
                  <TableRow key={`${job.id}-detail`}>
                    <TableCell colSpan={8} className="bg-muted/30 p-0">
                      <div className="px-6 py-4">
                        <p className="text-sm font-medium mb-3">
                          Query Details ({queries.length} queries)
                        </p>
                        <div className="space-y-3">
                          {Object.entries(groupByBu(queries)).map(
                            ([bu, group]) => (
                              <div key={bu} className="text-sm">
                                <p className="font-medium text-foreground mb-1">
                                  {bu}
                                  <span className="text-muted-foreground font-normal ml-2">
                                    ({group.queries.length} {group.queries.length === 1 ? "query" : "queries"})
                                  </span>
                                </p>
                                <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pl-2">
                                  {group.queries.map((q, i) => (
                                    <li key={i} className="truncate max-w-2xl">
                                      {q}
                                    </li>
                                  ))}
                                </ul>
                                {(group.optimizedQueryNative || group.optimizedQueryEn) && (
                                  <div className="mt-3 rounded-md border bg-background/70 p-3">
                                    <p className="font-medium text-foreground mb-1">
                                      Optimized Query
                                    </p>
                                    {group.optimizedQueryNative && (
                                      <p className="text-muted-foreground whitespace-pre-wrap">
                                        {group.optimizedQueryNative}
                                      </p>
                                    )}
                                    {group.optimizedQueryEn &&
                                      group.optimizedQueryEn !== group.optimizedQueryNative && (
                                        <p className="text-muted-foreground whitespace-pre-wrap mt-2">
                                          {group.optimizedQueryEn}
                                        </p>
                                      )}
                                    {group.optimizationFocuses.length > 0 && (
                                      <p className="text-xs text-muted-foreground mt-2">
                                        Focuses: {group.optimizationFocuses.join(" / ")}
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
