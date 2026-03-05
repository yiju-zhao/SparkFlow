"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Stepper } from "@/components/ui/stepper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UploadStep } from "./steps/upload-step";
import { ConfigStep } from "./steps/config-step";
import { PreviewStep } from "./steps/preview-step";
import { RunningStep } from "./steps/running-step";
import { ResultsStep } from "./steps/results-step";
import { useJobProgress, useMatchJob } from "@/lib/matcher/hooks";
import type { ParsedQuery, MatchJob, MatchTargetType } from "@/lib/matcher/types";

const STEPS = [
  { id: "upload", label: "Upload", description: "Upload query file" },
  { id: "config", label: "Configure", description: "Select options" },
  { id: "preview", label: "Preview", description: "Review queries" },
  { id: "running", label: "Match", description: "Processing" },
  { id: "results", label: "Results", description: "Download" },
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
  job: MatchJob | null;
};

export function MatcherWizard() {
  const router = useRouter();
  const [state, setState] = useState<WizardState>({
    step: 0,
    fileKey: null,
    config: null,
    queries: null,
    jobId: null,
    job: null,
  });

  const { createJob, cancelJob } = useMatchJob();
  const { progress } = useJobProgress(state.jobId, {
    onComplete: (job) => {
      setState((prev) => ({ ...prev, step: 4, job }));
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

  // Step 2: Preview
  const handleStartMatching = useCallback(
    async (queries: ParsedQuery[]) => {
      if (!state.fileKey || !state.config) return;

      try {
        const job = await createJob({
          instanceId: state.config.instanceId,
          targetType: state.config.targetType,
          queryFileKey: state.fileKey,
          topK: state.config.topK,
          searchK: state.config.searchK,
          includeReasons: state.config.includeReasons,
        });

        setState((prev) => ({
          ...prev,
          step: 3,
          queries,
          jobId: job.id,
          job,
        }));
      } catch (error) {
        console.error("Failed to start job:", error);
      }
    },
    [state.fileKey, state.config, createJob],
  );

  // Step 3: Running
  const handleCancelJob = useCallback(async () => {
    if (!state.jobId) return;

    try {
      await cancelJob(state.jobId);
      router.push("/explore/toolbox");
    } catch (error) {
      console.error("Failed to cancel job:", error);
    }
  }, [state.jobId, cancelJob, router]);

  // Step 4: Results
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
      job: null,
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
            job={state.job!}
            onDownload={handleDownload}
            onReset={handleReset}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <Stepper steps={STEPS} currentStep={state.step} />

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[state.step].label}</CardTitle>
        </CardHeader>
        <CardContent>{renderStep()}</CardContent>
      </Card>
    </div>
  );
}
