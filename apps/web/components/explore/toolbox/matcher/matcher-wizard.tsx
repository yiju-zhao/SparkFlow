"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { UploadStep } from "./steps/upload-step";
import { ConfigStep } from "./steps/config-step";
import { RunningStep } from "./steps/running-step";
import { ResultsStep } from "./steps/results-step";
import { useJobProgress, useMatchJob } from "@/lib/matcher/hooks";
import { downloadJobResult, getJob, InflightJobError } from "@/lib/matcher/client";
import type { ParsedQuery, MatchTargetType } from "@/lib/matcher/types";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

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
  const searchParams = useSearchParams();
  const urlJobId = searchParams.get("jobId");
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
  const [inflightError, setInflightError] = useState<string | null>(null);
  const hydratedJobIdRef = useRef<string | null>(null);

  // Hydrate from `?jobId=…` so refreshing or reopening the page snaps the
  // wizard back onto its in-flight (or just-finished) job. The matcher
  // worker keeps running on the workflows-api regardless of what the
  // browser does — this just lets the UI find it again.
  useEffect(() => {
    if (!urlJobId) return;
    if (hydratedJobIdRef.current === urlJobId) return;
    hydratedJobIdRef.current = urlJobId;

    let cancelled = false;
    (async () => {
      try {
        const job = await getJob(urlJobId);
        if (cancelled) return;
        if (TERMINAL_STATUSES.has(job.status)) {
          setState({
            kind: "results",
            config: null,
            queries: null,
            jobId: job.id,
            completedJob: {
              id: job.id,
              status: job.status,
              queryCount: job.queryCount,
              matchCount: job.matchCount,
              topK: job.topK,
              resultFileKey: job.resultFileKey,
              errorMessage: job.errorMessage,
            },
          });
        } else {
          setState({
            kind: "running",
            config: null,
            queries: null,
            jobId: job.id,
            completedJob: null,
          });
        }
      } catch (err) {
        // Stale/invalid jobId in URL — clear it and start fresh.
        console.error("[Wizard] Failed to hydrate job from URL:", err);
        hydratedJobIdRef.current = null;
        router.replace("/explore/toolbox/matcher");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [urlJobId, router]);

  const { createJob } = useMatchJob();

  const { progress } = useJobProgress(state.kind === "running" ? state.jobId : null, {
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
      // Demoted to warn so an SSE drop / workflows-api restart in dev
      // doesn't pop the Next 16 error overlay. The job itself is tracked
      // in Postgres; refresh re-hydrates the latest persisted status.
      console.warn("[Wizard] Job stream error:", error);
      // Re-fetch from the server so we don't leave the user spinning at
      // the running step. The GET endpoint flips orphaned rows
      // (workflows-api restarted; in-memory store wiped) to FAILED, so
      // this transition lands the wizard at the results step with the
      // upstream error message and unlocks the single-flight guard.
      setState((prev) => {
        if (prev.kind !== "running" || !prev.jobId) return prev;
        const jobId = prev.jobId;
        getJob(jobId)
          .then((job) => {
            if (!TERMINAL_STATUSES.has(job.status)) return;
            setState((p) => ({
              ...p,
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
          })
          .catch((err) => {
            console.warn("[Wizard] Failed to refetch after stream error:", err);
          });
        return prev;
      });
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
        setInflightError(null);
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

        // Persist jobId in URL so a refresh re-attaches to the running job
        // instead of dropping the user back at step 0. `replace` (not push)
        // because the upload/config steps already happened; we don't want
        // the back button to recreate them as separate history entries.
        hydratedJobIdRef.current = job.id;
        router.replace(`/explore/toolbox/matcher?jobId=${job.id}`);
        setState((prev) => ({
          ...prev,
          kind: "running",
          config,
          jobId: job.id,
        }));
      } catch (error) {
        if (error instanceof InflightJobError) {
          // User already has a job running. Snap straight to it instead
          // of double-charging their BYOK quota on a duplicate.
          console.log("[Wizard] Inflight job detected:", error.inflightJobId);
          hydratedJobIdRef.current = null; // force re-hydration via URL effect
          router.replace(`/explore/toolbox/matcher?jobId=${error.inflightJobId}`);
          return;
        }
        console.error("[Wizard] Failed to start job:", error);
        setInflightError(error instanceof Error ? error.message : "Failed to start job");
      }
    },
    [createJob, router],
  );

  // Running — Cancel
  const handleCancelJob = useCallback(async () => {
    if (!state.jobId) return;
    router.push("/explore/toolbox");
  }, [state.jobId, router]);

  // Results — Download
  const handleDownload = useCallback(async () => {
    if (!state.jobId) return;
    try {
      await downloadJobResult(state.jobId);
    } catch (err) {
      console.error("[Wizard] Download failed:", err);
    }
  }, [state.jobId]);

  const handleReset = useCallback(() => {
    hydratedJobIdRef.current = null;
    setInflightError(null);
    router.replace("/explore/toolbox/matcher");
    setState({
      kind: "upload",
      config: null,
      queries: null,
      jobId: null,
      completedJob: null,
    });
  }, [router]);

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
            submitError={inflightError}
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
