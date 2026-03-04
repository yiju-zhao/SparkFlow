"use client";

import { Button } from "@/components/ui/button";
import { Download, RotateCcw, CheckCircle } from "lucide-react";
import type { MatchJob } from "@/lib/matcher/types";

interface ResultsStepProps {
  job: MatchJob;
  onDownload: () => void;
  onReset: () => void;
}

export function ResultsStep({ job, onDownload, onReset }: ResultsStepProps) {
  const isCompleted = job.status === "COMPLETED";

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        {isCompleted ? (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Matching Complete!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Your results are ready to download.
            </p>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium">Job {job.status.toLowerCase()}</h3>
            {job.errorMessage && (
              <p className="text-sm text-destructive mt-1">{job.errorMessage}</p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="text-center">
          <p className="text-2xl font-bold">{job.queryCount}</p>
          <p className="text-xs text-muted-foreground">Queries</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{job.matchCount}</p>
          <p className="text-xs text-muted-foreground">Matches</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold">{job.topK}</p>
          <p className="text-xs text-muted-foreground">Per Query</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {isCompleted && job.resultFileKey && (
          <Button onClick={onDownload} className="w-full">
            <Download className="mr-2 h-4 w-4" />
            Download Results (Excel)
          </Button>
        )}
        <Button variant="outline" onClick={onReset} className="w-full">
          <RotateCcw className="mr-2 h-4 w-4" />
          Start New Match
        </Button>
      </div>
    </div>
  );
}
