"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UploadStep } from "./steps/upload-step";
import { ConfigStep } from "./steps/config-step";
import { RunningStep } from "./steps/running-step";
import { ResultsStep } from "./steps/results-step";
import { useJobProgress, useMatchJob } from "@/lib/matcher/hooks";
import type { ParsedQuery, MatchTargetType } from "@/lib/matcher/types";

type WizardConfig = {
  instanceId: string;
  targetType: MatchTargetType;
  topK: number;
  searchK: number;
  includeReasons: boolean;
};

// Wizard state is a discriminated union on `kind`. Stages with different
// fields don't share invalid intermediate shapes (e.g. `running` always has a
// jobId; `results` always has a completedJob). Adding a new stage means adding
// one variant + handler — no magic-number comparisons to grep for.
type WizardKind = "upload" | "config" | "running" | "results";

type CompletedJob = {
  id: string;
  status: string;
  queryCount: number;
  matchCount: number;
  topK: number;
  resultFileKey: string | null;
  errorMessage: string | null;
};

type WizardState = {
  kind: WizardKind;
  config: WizardConfig | null;
  queries: ParsedQuery[] | null;
  jobId: string | null;
  completedJob: CompletedJob | null;
};

// Order matters: must match the visual progression in the breadcrumb.
const KIND_ORDER: WizardKind[] = ["upload", "config", "running", "results"];

function kindIndex(kind: WizardKind): number {
  return KIND_ORDER.indexOf(kind);
}

export function MatcherWizard() {
  const router = useRouter();
  const tSteps = useTranslations("explore.toolbox.wizard.steps");

  // Display order in breadcrumb omits "running" — that stage is rendered as
  // "results active" so the user sees forward motion without a third tick.
  const DISPLAY_STEPS: { id: WizardKind; label: string }[] = [
    { id: "upload", label: tSteps("upload") },
    { id: "config", label: tSteps("configure") },
    { id: "results", label: tSteps("results") },
  ];

  const [state, setState] = useState<WizardState>({
    kind: "upload",
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
        kind: "results",
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

  // Upload → Config — preserve queries on re-entry
  const handleUploadComplete = useCallback((queries: ParsedQuery[]) => {
    setState((prev) => ({ ...prev, kind: "config", queries }));
  }, []);

  // Config → Running — start matching directly
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
          kind: "running",
          config,
          jobId: job.id,
        }));
      } catch (error) {
        console.error("[Wizard] Failed to start job:", error);
      }
    },
    [createJob],
  );

  // Running — Cancel
  const handleCancelJob = useCallback(async () => {
    if (!state.jobId) return;
    router.push("/explore/toolbox");
  }, [state.jobId, router]);

  // Results — Download
  const handleDownload = useCallback(() => {
    if (!state.jobId) return;
    const downloadUrl = `/api/matcher/jobs/${state.jobId}/download`;
    window.open(downloadUrl, "_blank");
  }, [state.jobId]);

  const handleReset = useCallback(() => {
    setState({
      kind: "upload",
      config: null,
      queries: null,
      jobId: null,
      completedJob: null,
    });
  }, []);

  const handleBack = useCallback(() => {
    setState((prev) => {
      const idx = kindIndex(prev.kind);
      if (idx <= 0) return prev;
      return { ...prev, kind: KIND_ORDER[idx - 1] };
    });
  }, []);

  const handleCancel = useCallback(() => {
    router.push("/explore");
  }, [router]);

  // Navigate to a completed step — allowed from any step except running
  const handleStepClick = useCallback((targetKind: WizardKind) => {
    setState((prev) => {
      if (prev.kind === "running") return prev; // Can't navigate during running
      if (kindIndex(targetKind) >= kindIndex(prev.kind)) return prev; // Can't jump forward
      return { ...prev, kind: targetKind };
    });
  }, []);

  const renderStep = () => {
    switch (state.kind) {
      case "upload":
        return (
          <UploadStep
            onNext={handleUploadComplete}
            onCancel={handleCancel}
            initialQueries={state.queries ?? undefined}
          />
        );
      case "config":
        return (
          <ConfigStep
            queries={state.queries ?? []}
            initialConfig={state.config ?? undefined}
            onStart={handleStartMatching}
            onBack={handleBack}
            onCancel={handleCancel}
          />
        );
      case "running":
        return <RunningStep jobId={state.jobId!} progress={progress} onCancel={handleCancelJob} />;
      case "results":
        return (
          <ResultsStep job={state.completedJob} onDownload={handleDownload} onReset={handleReset} />
        );
      default:
        return null;
    }
  };

  return (
    <Card className="overflow-hidden max-w-3xl mx-auto">
      <div className="flex items-center gap-1 px-6 py-3 bg-muted/30 border-b font-mono text-sm">
        {DISPLAY_STEPS.map((displayStep, index) => {
          // The "running" stage shows the "results" tick as active (we're
          // headed there). Everything else is a direct kind comparison.
          const isActive =
            displayStep.id === state.kind ||
            (state.kind === "running" && displayStep.id === "results");
          const isPast =
            kindIndex(displayStep.id) < kindIndex(state.kind) &&
            !(state.kind === "running" && displayStep.id === "results");
          const isClickable = isPast && state.kind !== "running";
          return (
            <div key={displayStep.id} className="flex items-center gap-1">
              {index > 0 && <span className="text-muted-foreground/40 mx-2">/</span>}
              <button
                type="button"
                onClick={() => isClickable && handleStepClick(displayStep.id)}
                disabled={!isClickable}
                className={cn(
                  "flex items-center gap-1 rounded px-1 -mx-1 transition-colors",
                  isClickable ? "hover:bg-muted cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "tabular-nums",
                    isActive
                      ? "text-primary font-bold"
                      : isPast
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span
                  className={cn(
                    isActive
                      ? "text-foreground font-bold"
                      : isPast
                        ? "text-foreground"
                        : "text-muted-foreground",
                  )}
                >
                  {displayStep.label}
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
