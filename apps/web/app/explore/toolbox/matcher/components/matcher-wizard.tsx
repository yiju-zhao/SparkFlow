"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UploadStep } from "./steps/upload-step";
import { ConfigStep } from "./steps/config-step";
import { PreviewStep } from "./steps/preview-step";
import { RunningStep } from "./steps/running-step";
import { ResultsStep } from "./steps/results-step";
import { useJobProgress, useMatchJob } from "@/lib/matcher/hooks";
import type { ParsedQuery, MatchTargetType } from "@/lib/matcher/types";

const STEPS = [
  { id: "upload", label: "upload_query_file" },
  { id: "config", label: "configure_job" },
  { id: "preview", label: "preview_results" },
  { id: "running", label: "match" },
  { id: "results", label: "results" },
];

type WizardState = {
  step: number;
  fileKey: string | null;
  config: {
    instanceId: string;
    targetType: MatchTargetType;
    topK: number;
    searchK: number;
    includeReasons: boolean;
  } | null;
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
    fileKey: null,
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
        step: 4,
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

  // Step 0: Upload
  const handleUploadComplete = useCallback((fileKey: string, queries: ParsedQuery[]) => {
    setState((prev) => ({ ...prev, step: 1, fileKey, queries }));
  }, []);

  // Step 1: Config
  const handleConfigComplete = useCallback(
    (config: WizardState["config"]) => {
      setState((prev) => ({ ...prev, step: 2, config }));
    },
    [],
  );

  // Step 2: Preview - Start matching
  const handleStartMatching = useCallback(
    async (queries: ParsedQuery[]) => {
      if (!state.config) return;

      try {
        console.log("[Wizard] Creating job with config:", state.config);
        const job = await createJob({
          instanceId: state.config.instanceId,
          targetType: state.config.targetType,
          queries,
          topK: state.config.topK,
          searchK: state.config.searchK,
          includeReasons: state.config.includeReasons,
        });

        console.log("[Wizard] Job created:", job.id);

        setState((prev) => ({
          ...prev,
          step: 3,
          jobId: job.id,
        }));
      } catch (error) {
        console.error("[Wizard] Failed to start job:", error);
      }
    },
    [state.config, createJob],
  );

  // Step 3: Running - Cancel
  const handleCancelJob = useCallback(async () => {
    if (!state.jobId) return;
    router.push("/explore/toolbox");
  }, [state.jobId, router]);

  // Step 4: Results - Download
  const handleDownload = useCallback(() => {
    if (!state.jobId) return;
    const downloadUrl = `/api/matcher/jobs/${state.jobId}/download`;
    window.open(downloadUrl, "_blank");
  }, [state.jobId]);

  const handleReset = useCallback(() => {
    setState({
      step: 0,
      fileKey: null,
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

  const renderStep = () => {
    switch (state.step) {
      case 0:
        return (
          <UploadStep
            onNext={handleUploadComplete}
            onCancel={handleCancel}
          />
        );
      case 1:
        return (
          <ConfigStep
            fileKey={state.fileKey!}
            onNext={handleConfigComplete}
            onBack={handleBack}
            onCancel={handleCancel}
          />
        );
      case 2:
        return (
          <PreviewStep
            queries={state.queries ?? []}
            config={state.config!}
            onStart={handleStartMatching}
            onBack={handleBack}
            onCancel={handleCancel}
          />
        );
      case 3:
        return (
          <RunningStep
            jobId={state.jobId!}
            progress={progress}
            onCancel={handleCancelJob}
          />
        );
      case 4:
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
    <Card className="overflow-hidden">
      <div className="flex items-center gap-1 px-6 py-3 bg-muted/30 border-b font-mono text-sm">
        {STEPS.map((step, index) => (
          <div key={step.id} className="flex items-center gap-1">
            {index > 0 && (
              <span className="text-muted-foreground/40 mx-2">/</span>
            )}
            <span
              className={cn(
                "tabular-nums",
                index === state.step
                  ? "text-primary font-bold"
                  : index < state.step
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className={cn(
                index === state.step
                  ? "text-foreground font-bold"
                  : index < state.step
                    ? "text-foreground"
                    : "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>

      <CardContent className="p-6">{renderStep()}</CardContent>
    </Card>
  );
}
