"use client";

import { Button } from "@/components/ui/button";
import type { JobProgress, MatchJobStatus } from "@/lib/matcher/types";

interface RunningStepProps {
  jobId: string;
  progress: JobProgress | null;
  onCancel: () => void;
}

const statusMessages: Record<MatchJobStatus, string> = {
  PENDING: "Waiting to start...",
  PROCESSING: "Matching queries against conference data...",
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

      <div className="flex items-center justify-between bg-muted/50 p-4 rounded-lg">
        <div className="text-sm text-muted-foreground">
          <span className="font-medium">Status:</span>
          <span className="ml-2">{statusMessages[status]}</span>
        </div>
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
