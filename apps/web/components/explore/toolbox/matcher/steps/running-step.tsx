"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { JobProgress, MatchJobStatus } from "@/lib/matcher/types";

interface RunningStepProps {
  jobId: string;
  progress: JobProgress | null;
  onCancel: () => void;
  onRunInBackground: () => void;
  isCancelling?: boolean;
}

const statusConfig: Record<MatchJobStatus, { label: string; color: string }> = {
  PENDING: { label: "Waiting to start...", color: "text-muted-foreground" },
  PROCESSING: { label: "Matching queries against conference data...", color: "text-primary" },
  COMPLETED: { label: "Completed!", color: "text-emerald-500" },
  FAILED: { label: "Failed", color: "text-destructive" },
  CANCELLED: { label: "Cancelled", color: "text-muted-foreground" },
};

export function RunningStep({
  progress,
  onCancel,
  onRunInBackground,
  isCancelling = false,
}: RunningStepProps) {
  const status = progress?.status || "PENDING";
  const progressValue = progress?.progress || 0;
  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(status);
  const config = statusConfig[status];

  // Determine progress bar color class
  const progressClass = cn(
    "h-2",
    status === "FAILED" && "[&>div]:bg-destructive",
    status === "COMPLETED" && "[&>div]:bg-emerald-500",
    status !== "FAILED" && status !== "COMPLETED" && "[&>div]:bg-primary",
  );

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">
          {isTerminal ? "Job Finished" : "Matching in Progress"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {isTerminal
            ? "The matching job has finished."
            : "Please wait while we match your queries against the conference data."}
        </p>
      </div>

      {/* Progress bar with integrated status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className={cn("font-medium", config.color)}>{config.label}</span>
          <span className="font-medium tabular-nums text-muted-foreground">{progressValue}%</span>
        </div>
        <Progress value={progressValue} className={progressClass} />
      </div>

      {!isTerminal && (
        <p className="text-xs text-muted-foreground">
          The job runs on the server — closing or refreshing the page is safe; progress is saved.
          Only one matcher job can run at a time, so to start a new one you&apos;ll need to cancel
          this one first.
        </p>
      )}

      {/* Two distinct actions during running:
          - "Cancel Job" actively stops the work (forwards to workflows-api,
            flips Postgres to CANCELLED, lands user at the results step).
          - "Run in Background" just navigates away; the server-side job
            keeps running and the user can return via the URL or History. */}
      <div className="flex justify-end gap-2 pt-2">
        {isTerminal ? (
          <Button variant="default" onClick={onRunInBackground} size="sm">
            Close
          </Button>
        ) : (
          <>
            <Button
              variant="outline"
              onClick={onCancel}
              size="sm"
              disabled={isCancelling}
            >
              {isCancelling ? "Cancelling…" : "Cancel Job"}
            </Button>
            <Button
              variant="default"
              onClick={onRunInBackground}
              size="sm"
              disabled={isCancelling}
            >
              Run in Background
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
