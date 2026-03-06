"use client";

import { Button } from "@/components/ui/button";
import { Download, RotateCcw, CheckCircle, AlertCircle, FileSpreadsheet } from "lucide-react";
import type { MatchJob } from "@/lib/matcher/types";

interface ResultsStepProps {
  job: MatchJob | null;
  onDownload: () => void;
  onReset: () => void;
}

export function ResultsStep({ job, onDownload, onReset }: ResultsStepProps) {
  const isCompleted = job?.status === "COMPLETED";
  const isFailed = job?.status === "FAILED";
  const hasResults = job?.resultFileKey;

  return (
    <div className="space-y-6">
      <div className="text-center py-4">
        {isCompleted ? (
          <>
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h3 className="text-lg font-medium">Matching Complete!</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {job?.matchCount ?? 0} matches found from {job?.queryCount ?? 0} queries
            </p>
          </>
        ) : isFailed ? (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-medium">Matching Failed</h3>
            {job?.errorMessage && (
              <p className="text-sm text-destructive mt-1">{job.errorMessage}</p>
            )}
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium">Job Status: {job?.status ?? "Unknown"}</h3>
          </>
        )}
      </div>

      {job && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold">{job.queryCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Queries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{job.matchCount ?? 0}</p>
            <p className="text-xs text-muted-foreground">Matches</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{job.topK ?? 50}</p>
            <p className="text-xs text-muted-foreground">Top K</p>
          </div>
        </div>
      )}

      {isCompleted && hasResults && (
        <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg">
          <FileSpreadsheet className="h-8 w-8 text-green-600" />
          <div className="flex-1">
            <p className="font-medium text-green-800 dark:text-green-200">Results Ready</p>
            <p className="text-sm text-green-600 dark:text-green-400">
              Excel file with all matches per BU
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {isCompleted && hasResults && (
          <Button onClick={onDownload} className="w-full" size="lg">
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
