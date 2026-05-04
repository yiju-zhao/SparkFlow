"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Settings as SettingsIcon } from "lucide-react";
import type { ParsedQuery } from "@/lib/matcher/types";

/**
 * Heuristically detect a BYOK / model-config error coming back from
 * /api/matcher/jobs. The server message starts with "Matcher model is
 * not configured" or comes through resolveApiKey ("API key for X is
 * missing"). Either way, the recovery is the same: open Settings.
 */
function isByokConfigError(message: string | null | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("matcher model") ||
    m.includes("api key") ||
    m.includes("byok") ||
    m.includes("not configured") ||
    m.includes("settings")
  );
}

interface Instance {
  id: string;
  name: string;
  year: number;
  venue?: {
    name: string;
  };
}

interface ConfigValues {
  instanceId: string;
  targetType: "SESSION" | "PUBLICATION";
  topK: number;
  searchK: number;
  includeReasons: boolean;
}

interface ConfigStepProps {
  queries: ParsedQuery[];
  initialConfig?: ConfigValues;
  onStart: (config: ConfigValues, queries: ParsedQuery[]) => void;
  onBack: () => void;
  onCancel: () => void;
  submitError?: string | null;
}

export function ConfigStep({
  queries,
  initialConfig,
  onStart,
  onBack,
  submitError,
}: ConfigStepProps) {
  const t = useTranslations("explore.toolbox.wizard.configure");
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [instanceId, setInstanceId] = useState(initialConfig?.instanceId ?? "");
  const [targetType, setTargetType] = useState<"SESSION" | "PUBLICATION" | "">(
    initialConfig?.targetType ?? "",
  );
  const [topKStr, setTopKStr] = useState(String(initialConfig?.topK ?? 50));
  const [searchKStr, setSearchKStr] = useState(String(initialConfig?.searchK ?? 350));
  const [includeReasons, setIncludeReasons] = useState(initialConfig?.includeReasons ?? true);

  const parsedTopK = parseInt(topKStr);
  const parsedSearchK = parseInt(searchKStr);
  const topKError = !topKStr || isNaN(parsedTopK) || parsedTopK < 1 ? "Must be ≥ 1" : null;
  const searchKError =
    !searchKStr || isNaN(parsedSearchK) || parsedSearchK < (isNaN(parsedTopK) ? 1 : parsedTopK)
      ? `Must be ≥ ${isNaN(parsedTopK) ? "Top K" : parsedTopK}`
      : null;

  useEffect(() => {
    async function loadInstances() {
      try {
        const response = await fetch("/api/explore/instances");
        if (!response.ok) throw new Error("Failed to load instances");
        const data = await response.json();
        setInstances(data);

        // No auto-selection — user must choose explicitly
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load instances");
      } finally {
        setIsLoading(false);
      }
    }

    loadInstances();
  }, [initialConfig?.instanceId]);

  const handleStart = () => {
    if (!instanceId) {
      setError(t("errorSelectConference"));
      return;
    }
    if (!targetType) {
      setError(t("errorSelectTarget"));
      return;
    }
    if (queries.length === 0) {
      setError(t("errorNoQueries"));
      return;
    }
    if (topKError) {
      setError("Top K: " + topKError);
      return;
    }
    if (searchKError) {
      setError("Search K: " + searchKError);
      return;
    }

    onStart(
      {
        instanceId,
        targetType: targetType as "SESSION" | "PUBLICATION",
        topK: parsedTopK,
        searchK: parsedSearchK,
        includeReasons,
      },
      queries,
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">{t("title")}</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {t("description", {
            count: queries.length,
            noun: queries.length === 1 ? t("queryNounSingular") : t("queryNounPlural"),
          })}
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {(() => {
            const message = error ?? submitError ?? null;
            if (!message) return null;
            // BYOK / model-config errors get a structured card with a
            // direct link to Settings — without this the user reads a
            // single sentence with the literal arrow text and has to
            // navigate by hand.
            if (isByokConfigError(message)) {
              return (
                <div className="flex items-start justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                  <div className="flex-1 text-sm text-destructive">{message}</div>
                  <Link href="/settings">
                    <Button variant="outline" size="sm" className="gap-1.5">
                      <SettingsIcon className="h-3.5 w-3.5" />
                      Open Settings
                    </Button>
                  </Link>
                </div>
              );
            }
            return <p className="text-sm text-destructive">{message}</p>;
          })()}

          <div className="space-y-2">
            <Label htmlFor="instance">{t("conference")}</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger id="instance">
                <SelectValue placeholder={t("conferencePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {instances.map((instance) => (
                  <SelectItem key={instance.id} value={instance.id}>
                    {instance.venue?.name} {instance.year} - {instance.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetType">{t("matchAgainst")}</Label>
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as "SESSION" | "PUBLICATION")}
            >
              <SelectTrigger id="targetType">
                <SelectValue placeholder={t("matchAgainstPlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SESSION">{t("sessions")}</SelectItem>
                <SelectItem value="PUBLICATION">{t("publications")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topK">{t("topK")}</Label>
              <Input
                id="topK"
                type="number"
                min={1}
                value={topKStr}
                onChange={(e) => setTopKStr(e.target.value)}
                className={topKError ? "border-destructive" : ""}
              />
              {topKError ? (
                <p className="text-xs text-destructive">{topKError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("topKHelp")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="searchK">{t("searchK")}</Label>
              <Input
                id="searchK"
                type="number"
                min={1}
                value={searchKStr}
                onChange={(e) => setSearchKStr(e.target.value)}
                className={searchKError ? "border-destructive" : ""}
              />
              {searchKError ? (
                <p className="text-xs text-destructive">{searchKError}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{t("searchKHelp")}</p>
              )}
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeReasons"
              checked={includeReasons}
              onCheckedChange={(checked) => setIncludeReasons(checked as boolean)}
            />
            <Label htmlFor="includeReasons" className="font-normal">
              {t("includeReasons")}
            </Label>
          </div>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          {t("back")}
        </Button>
        <Button
          onClick={handleStart}
          disabled={!instanceId || !targetType || isLoading || queries.length === 0}
        >
          {t("startMatching")}
        </Button>
      </div>
    </div>
  );
}
