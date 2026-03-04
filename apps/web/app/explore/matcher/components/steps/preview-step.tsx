"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { QueryPreviewTable } from "../query-preview-table";
import type { ParsedQuery } from "@/lib/matcher/types";

interface PreviewStepProps {
  fileKey: string;
  config: {
    instanceId: string;
    targetType: "SESSION" | "PUBLICATION";
    topK: number;
    searchK: number;
    includeReasons: boolean;
  };
  onStart: (queries: ParsedQuery[]) => void;
  onBack: () => void;
  onCancel: () => void;
}

export function PreviewStep({
  fileKey,
  config,
  onStart,
  onBack,
  onCancel,
}: PreviewStepProps) {
  const [queries, setQueries] = useState<ParsedQuery[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // In a real implementation, we'd fetch the parsed queries from the server
    // For now, we'll simulate it
    async function loadQueries() {
      setIsLoading(true);
      try {
        // TODO: Fetch parsed queries from matcher service
        // For now, just show placeholder
        setQueries([]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load queries");
      } finally {
        setIsLoading(false);
      }
    }

    loadQueries();
  }, [fileKey]);

  const handleStart = () => {
    if (queries.length === 0) {
      setError("No queries to process");
      return;
    }
    onStart(queries);
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preview Queries</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review and edit your queries before starting the match.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <div className="border rounded-lg overflow-hidden">
            <QueryPreviewTable
              queries={queries}
              onQueriesChange={setQueries}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <p className="text-sm font-medium">Configuration</p>
              <p className="text-xs text-muted-foreground">
                {config.targetType === "SESSION" ? "Sessions" : "Publications"} •
                Top {config.topK} • Search {config.searchK}
                {config.includeReasons && " • With reasons"}
              </p>
            </div>
            <p className="text-sm">
              <span className="font-medium">{queries.length}</span> queries
            </p>
          </div>
        </>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={handleStart} disabled={queries.length === 0 || isLoading}>
          Start Matching
        </Button>
      </div>
    </div>
  );
}
