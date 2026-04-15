"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { JobProgress, MatchJobStatus } from "@/lib/matcher/types";

interface RunningStepProps {
  jobId: string;
  progress: JobProgress | null;
  onCancel: () => void;
}

const statusConfig: Record<MatchJobStatus, { label: string; color: string }> = {
  PENDING: { label: "Waiting to start...", color: "text-muted-foreground" },
  PROCESSING: { label: "Matching queries against conference data...", color: "text-primary" },
  COMPLETED: { label: "Completed!", color: "text-emerald-500" },
  FAILED: { label: "Failed", color: "text-destructive" },
  CANCELLED: { label: "Cancelled", color: "text-muted-foreground" },
};

export function RunningStep({ progress, onCancel }: RunningStepProps) {
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

      {/* Cancel / Close button — separated at the bottom */}
      <div className="flex justify-end pt-2">
        <Button
          variant={isTerminal ? "default" : "outline"}
          onClick={onCancel}
          disabled={status === "CANCELLED"}
          size="sm"
        >
          {isTerminal ? "Close" : "Cancel Job"}
        </Button>
      </div>
    </div>
  );
}
