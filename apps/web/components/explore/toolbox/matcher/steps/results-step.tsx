"use client";

import { Button } from "@/components/ui/button";
import {
  Download,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  FileSpreadsheet,
  Info,
} from "lucide-react";

interface CompletedJob {
  id: string;
  status: string;
  queryCount: number;
  matchCount: number;
  topK: number;
  resultFileKey: string | null;
  errorMessage: string | null;
}

interface ResultsStepProps {
  job: CompletedJob | null;
  onDownload: () => void;
  onReset: () => void;
}

export function ResultsStep({ job, onDownload, onReset }: ResultsStepProps) {
  const isCompleted = job?.status === "COMPLETED";
  const isFailed = job?.status === "FAILED";
  const isCancelled = job?.status === "CANCELLED";
  const hasResults = job?.resultFileKey;

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
        ) : isFailed ? (
          <>
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h3 className="text-lg font-medium">Matching Failed</h3>
            {job?.errorMessage && (
              <p className="text-sm text-destructive mt-1">{job.errorMessage}</p>
            )}
          </>
        ) : isCancelled ? (
          <>
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium">Matching Cancelled</h3>
          </>
        ) : (
          <>
            <h3 className="text-lg font-medium">Job Status: {job?.status ?? "Unknown"}</h3>
          </>
        )}
      </div>

      {isCancelled && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <Info className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
          <div className="text-amber-900 dark:text-amber-200">
            <p className="font-medium">Cancellation is best-effort.</p>
            <p className="text-amber-800 dark:text-amber-300 mt-1">
              The ranking thread can&apos;t be interrupted mid-flight, so any work already
              in progress will continue running on the server (including any associated
              LLM token usage). The job will not be saved, and the single-flight guard
              has been released so you can start a new match right away.
            </p>
          </div>
        </div>
      )}

      {/* Hide the stats grid for non-success terminal states — a green
          "0 Matches" reads like success-with-no-results, not failure. */}
      {job && isCompleted && (
        <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-center">
            <p className="text-2xl font-bold">{job.queryCount}</p>
            <p className="text-xs text-muted-foreground">Queries</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">{job.matchCount}</p>
            <p className="text-xs text-muted-foreground">Matches</p>
          </div>
          <div className="text-center">
            <p className="text-2xl font-bold">{job.topK}</p>
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
