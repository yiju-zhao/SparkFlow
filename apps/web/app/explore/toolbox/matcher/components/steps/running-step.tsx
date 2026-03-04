"use client";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AlertCircle, Loader2 } from "lucide-react";
import type { JobProgress, MatchJobStatus } from "@/lib/matcher/types";

interface RunningStepProps {
  jobId: string;
  progress: JobProgress | null;
  onCancel: () => void;
}

const statusMessages: Record<MatchJobStatus, string> = {
  PENDING: "Waiting to start...",
  PROCESSING: "Processing queries...",
  COMPLETED: "Completed!",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
};

export function RunningStep({ progress, onCancel }: RunningStepProps) {
  const status = progress?.status || "PENDING";
  const progressValue = progress?.progress || 0;
  const isTerminal = ["COMPLETED", "FAILED", "CANCELLED"].includes(status);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Matching in Progress</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Please wait while we match your queries against the conference data.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">
            {statusMessages[status]}
          </span>
          <span className="text-sm text-muted-foreground">
            {progressValue}%
          </span>
        </div>

        <Progress value={progressValue} className="h-2" />

        {progress?.errorMessage && (
          <div className="flex items-start gap-2 p-3 text-sm bg-destructive/10 text-destructive rounded-lg">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">Error</p>
              <p className="text-destructive/80">{progress.errorMessage}</p>
            </div>
          </div>
        )}

        {!isTerminal && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {progress && (
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm text-muted-foreground">Queries</p>
              <p className="text-lg font-medium">{progress.queryCount}</p>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Matches found</p>
              <p className="text-lg font-medium">{progress.matchCount}</p>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-4">
        <Button
          variant="outline"
          onClick={onCancel}
          disabled={status === "CANCELLED"}
        >
          {isTerminal ? "Close" : "Cancel Job"}
        </Button>
      </div>
    </div>
  );
}
