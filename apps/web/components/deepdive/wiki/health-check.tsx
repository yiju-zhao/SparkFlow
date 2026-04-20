"use client";

import { useState } from "react";
import { Activity, AlertTriangle, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HealthIssue {
  type: "orphan" | "missing_page" | "stale";
  severity: "warning" | "info";
  description: string;
  suggestion: string;
}

interface HealthReport {
  issues: HealthIssue[];
  stats: { totalPages: number; totalNodes: number; totalEdges: number; orphanNodes: number };
}

export function HealthCheckButton({ notebookId }: { notebookId: string }) {
  const [report, setReport] = useState<HealthReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const runCheck = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/wiki/health`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setReport(data);
        setIsOpen(true);
      }
    } catch (error) {
      console.error("Health check failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 rounded-[6px] text-sf-ink-3 hover:bg-sf-bg-alt hover:text-sf-ink transition-colors"
        onClick={runCheck}
        disabled={isLoading}
        title="Health Check"
      >
        {isLoading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Activity className="h-3.5 w-3.5" strokeWidth={1.75} />
        )}
      </Button>

      {isOpen && report && (
        <div className="absolute left-0 right-0 top-full z-50 mx-3 mt-1 rounded-lg border border-border bg-background shadow-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold">Health Check</h3>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 w-5 p-0"
              onClick={() => setIsOpen(false)}
            >
              &times;
            </Button>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3 text-center">
            <div>
              <div className="text-lg font-bold">{report.stats.totalPages}</div>
              <div className="text-[10px] text-muted-foreground">Pages</div>
            </div>
            <div>
              <div className="text-lg font-bold">{report.stats.totalNodes}</div>
              <div className="text-[10px] text-muted-foreground">Nodes</div>
            </div>
            <div>
              <div className="text-lg font-bold">{report.stats.totalEdges}</div>
              <div className="text-[10px] text-muted-foreground">Edges</div>
            </div>
            <div>
              <div className="text-lg font-bold">{report.stats.orphanNodes}</div>
              <div className="text-[10px] text-muted-foreground">Orphans</div>
            </div>
          </div>

          {report.issues.length === 0 ? (
            <p className="text-xs text-green-600 dark:text-green-400 text-center py-2">
              No issues found
            </p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {report.issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {issue.severity === "warning" ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  )}
                  <div>
                    <p>{issue.description}</p>
                    <p className="text-muted-foreground text-[10px]">{issue.suggestion}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
