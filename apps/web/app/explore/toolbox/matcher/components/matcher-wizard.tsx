"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UploadStep } from "./steps/upload-step";
import { ConfigStep } from "./steps/config-step";
import { RunningStep } from "./steps/running-step";
import { ResultsStep } from "./steps/results-step";
import { useJobProgress, useMatchJob } from "@/lib/matcher/hooks";
import type { ParsedQuery, MatchTargetType } from "@/lib/matcher/types";

// Display steps omit the "running" state — internal steps are 0=upload,1=config,2=running,3=results
const DISPLAY_STEPS = [
  { id: "upload", label: "upload", internalStep: 0 },
  { id: "config", label: "configure", internalStep: 1 },
  { id: "results", label: "results", internalStep: 3 },
];

type WizardConfig = {
  instanceId: string;
  targetType: MatchTargetType;
  topK: number;
  searchK: number;
  includeReasons: boolean;
};

type WizardState = {
  step: number;
  config: WizardConfig | null;
  queries: ParsedQuery[] | null;
  jobId: string | null;
  completedJob: {
    id: string;
    status: string;
    queryCount: number;
    matchCount: number;
    topK: number;
    resultFileKey: string | null;
    errorMessage: string | null;
  } | null;
};

export function MatcherWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({
    step: 0,
    config: null,
    queries: null,
    jobId: null,
    completedJob: null,
  });

  const { createJob } = useMatchJob();

  const { progress } = useJobProgress(state.jobId, {
    onComplete: (job) => {
      console.log("[Wizard] Job completed:", job);
      setState((prev) => ({
        ...prev,
        step: 3,
        completedJob: {
          id: job.id,
          status: job.status,
          queryCount: job.queryCount,
          matchCount: job.matchCount,
          topK: job.topK,
          resultFileKey: job.resultFileKey,
          errorMessage: job.errorMessage,
        },
      }));
    },
    onError: (error) => {
      console.error("[Wizard] Job error:", error);
    },
  });

  // Step 0: Upload — preserve queries on re-entry
  const handleUploadComplete = useCallback((queries: ParsedQuery[]) => {
    setState((prev) => ({ ...prev, step: 1, queries }));
  }, []);

  // Step 1: Config + Preview — start matching directly
  const handleStartMatching = useCallback(
    async (config: WizardConfig, queries: ParsedQuery[]) => {
      try {
        // Save config in state for back navigation
        setState((prev) => ({ ...prev, config, queries }));

        console.log("[Wizard] Creating job with config:", config);
        const job = await createJob({
          instanceId: config.instanceId,
          targetType: config.targetType,
          queries,
          topK: config.topK,
          searchK: config.searchK,
          includeReasons: config.includeReasons,
        });

        console.log("[Wizard] Job created:", job.id);

        setState((prev) => ({
          ...prev,
          step: 2,
          config,
          jobId: job.id,
        }));
      } catch (error) {
        console.error("[Wizard] Failed to start job:", error);
      }
    },
    [createJob],
  );

  // Step 2: Running - Cancel
  const handleCancelJob = useCallback(async () => {
    if (!state.jobId) return;
    router.push("/explore/toolbox");
  }, [state.jobId, router]);

  // Step 3: Results - Download
  const handleDownload = useCallback(() => {
    if (!state.jobId) return;
    const downloadUrl = `/api/matcher/jobs/${state.jobId}/download`;
    window.open(downloadUrl, "_blank");
  }, [state.jobId]);

  const handleReset = useCallback(() => {
    setState({
      step: 0,
      config: null,
      queries: null,
      jobId: null,
      completedJob: null,
    });
  }, []);

  const handleBack = useCallback(() => {
    setState((prev) => ({ ...prev, step: Math.max(0, prev.step - 1) }));
  }, []);

  const handleCancel = useCallback(() => {
    router.push("/explore");
  }, [router]);

  // Navigate to a completed step — allowed from any step except running (2)
  const handleStepClick = useCallback((targetInternalStep: number) => {
    setState((prev) => {
      if (prev.step === 2) return prev; // Can't navigate during running
      if (targetInternalStep >= prev.step) return prev; // Can't jump forward
      return { ...prev, step: targetInternalStep };
    });
  }, []);

  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <UploadStep
            onNext={handleUploadComplete}
            onCancel={handleCancel}
            initialQueries={state.queries ?? undefined}
          />
        );
      case 1:
        return (
          <ConfigStep
            queries={state.queries ?? []}
            initialConfig={state.config ?? undefined}
            onStart={handleStartMatching}
            onBack={handleBack}
            onCancel={handleCancel}
          />
        );
      case 2:
        return (
          <RunningStep
            jobId={state.jobId!}
            progress={progress}
            onCancel={handleCancelJob}
          />
        );
      case 3:
        return (
          <ResultsStep
            job={state.completedJob}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden max-w-3xl mx-auto">
      <div className="flex items-center gap-1 px-6 py-3 bg-muted/30 border-b font-mono text-sm">
        {DISPLAY_STEPS.map((step, index) => {
          const isActive = step.internalStep === state.step ||
            (state.step === 2 && step.internalStep === 3); // show results as active during running
          const isPast = step.internalStep < state.step && !(state.step === 2 && step.internalStep === 3);
          const isClickable = isPast && state.step !== 2;
          return (
            <div key={step.id} className="flex items-center gap-1">
              {index > 0 && (
                <span className="text-muted-foreground/40 mx-2">/</span>
              )}
              <button
                type="button"
                onClick={() => isClickable && handleStepClick(step.internalStep)}
                disabled={!isClickable}
                className={cn(
                  "flex items-center gap-1 rounded px-1 -mx-1 transition-colors",
                  isClickable ? "hover:bg-muted cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "tabular-nums",
                    isActive ? "text-primary font-bold" : isPast ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    isActive ? "text-foreground font-bold" : isPast ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <CardContent className="p-6">{renderStep()}</CardContent>
    </Card>
  );
}
