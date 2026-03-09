"use client";

import { useEffect, useState } from "react";
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
import { Loader2 } from "lucide-react";
import { QueryPreviewTable } from "../query-preview-table";
import type { ParsedQuery } from "@/lib/matcher/types";

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
  fileKey: string;
  queries: ParsedQuery[];
  initialConfig?: ConfigValues;
  onStart: (config: ConfigValues, queries: ParsedQuery[]) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function ConfigStep({ queries: initialQueries, initialConfig, onStart, onBack }: ConfigStepProps) {
  const [instances, setInstances] = useState<Instance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [instanceId, setInstanceId] = useState(initialConfig?.instanceId ?? "");
  const [targetType, setTargetType] = useState<"SESSION" | "PUBLICATION">(
    initialConfig?.targetType ?? "SESSION"
  );
  const [topKStr, setTopKStr] = useState(String(initialConfig?.topK ?? 50));
  const [searchKStr, setSearchKStr] = useState(String(initialConfig?.searchK ?? 350));
  const [includeReasons, setIncludeReasons] = useState(initialConfig?.includeReasons ?? true);
  const [queries, setQueries] = useState<ParsedQuery[]>(initialQueries);

  const parsedTopK = parseInt(topKStr);
  const parsedSearchK = parseInt(searchKStr);
  const topKError = !topKStr || isNaN(parsedTopK) || parsedTopK < 1 ? "Must be ≥ 1" : null;
  const searchKError = !searchKStr || isNaN(parsedSearchK) || parsedSearchK < (isNaN(parsedTopK) ? 1 : parsedTopK)
    ? `Must be ≥ ${isNaN(parsedTopK) ? "Top K" : parsedTopK}`
    : null;

  useEffect(() => {
    async function loadInstances() {
      try {
        const response = await fetch("/api/explore/instances");
        if (!response.ok) throw new Error("Failed to load instances");
        const data = await response.json();
        setInstances(data);

        // Auto-select first instance only if no initial config
        if (!initialConfig?.instanceId && data.length > 0) {
          setInstanceId(data[0].id);
        }
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
      setError("Please select a conference");
      return;
    }
    if (queries.length === 0) {
      setError("No queries to match");
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

    onStart({ instanceId, targetType, topK: parsedTopK, searchK: parsedSearchK, includeReasons }, queries);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Configure & Preview</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Select the conference, configure options, and review queries before matching.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="space-y-2">
            <Label htmlFor="instance">Conference</Label>
            <Select value={instanceId} onValueChange={setInstanceId}>
              <SelectTrigger id="instance">
                <SelectValue placeholder="Select a conference" />
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
            <Label htmlFor="targetType">Match Against</Label>
            <Select
              value={targetType}
              onValueChange={(v) => setTargetType(v as "SESSION" | "PUBLICATION")}
            >
              <SelectTrigger id="targetType">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SESSION">Sessions</SelectItem>
                <SelectItem value="PUBLICATION">Publications</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="topK">Top K Results</Label>
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
                <p className="text-xs text-muted-foreground">Number of matches per query</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="searchK">Search K</Label>
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
                <p className="text-xs text-muted-foreground">Embedding pre-filter size</p>
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
              Generate recommendation reasons (slower)
            </Label>
          </div>
        </div>
      )}

      {/* Query preview */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Queries ({queries.length})</Label>
        </div>
        <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
          <QueryPreviewTable
            queries={queries}
            onQueriesChange={setQueries}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleStart} disabled={!instanceId || isLoading || queries.length === 0}>
          Start Matching
        </Button>
      </div>
    </div>
  );
}
