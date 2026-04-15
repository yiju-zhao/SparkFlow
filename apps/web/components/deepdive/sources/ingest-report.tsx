"use client";

import { X, Lightbulb, GitCompare, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ExtractionReport {
  nodes: { id: string; label: string; type: string }[];
  edges: { source: string; target: string; relation: string }[];
  crossRefs: string[];
}

interface IngestReportProps {
  sourceTitle: string;
  report: ExtractionReport;
  onDismiss: () => void;
}

export function IngestReport({ sourceTitle, report, onDismiss }: IngestReportProps) {
  if (report.nodes.length === 0) return null;

  return (
    <div className="mx-4 mb-3 rounded-lg border-2 border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/30 p-3">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">
            Wiki extracted from &quot;{sourceTitle}&quot;
          </span>
        </div>
        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={onDismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <p>
          <span className="font-medium text-foreground">{report.nodes.length}</span> entities,{" "}
          <span className="font-medium text-foreground">{report.edges.length}</span> relationships
        </p>

        {report.nodes.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {report.nodes.slice(0, 8).map((n) => (
              <span
                key={n.id}
                className="inline-flex items-center rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-[10px] font-medium"
              >
                {n.label}
              </span>
            ))}
            {report.nodes.length > 8 && (
              <span className="text-[10px] text-muted-foreground">
                +{report.nodes.length - 8} more
              </span>
            )}
          </div>
        )}

        {report.crossRefs.length > 0 && (
          <div className="mt-2 pt-2 border-t border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-1 mb-1">
              <GitCompare className="h-3 w-3 text-amber-600" />
              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                Cross-references found
              </span>
            </div>
            {report.crossRefs.slice(0, 3).map((ref, i) => (
              <p key={i} className="text-[10px] flex items-center gap-1">
                <ArrowRight className="h-2.5 w-2.5 flex-shrink-0" />
                {ref}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
