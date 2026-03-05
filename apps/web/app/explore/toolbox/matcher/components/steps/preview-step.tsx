"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { QueryPreviewTable } from "../query-preview-table";
import type { ParsedQuery } from "@/lib/matcher/types";

interface PreviewStepProps {
  queries: ParsedQuery[];
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

export function PreviewStep({ queries: initialQueries, config, onStart, onBack }: PreviewStepProps) {
  const [queries, setQueries] = useState<ParsedQuery[]>(initialQueries);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Preview Queries</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Review and edit your queries before starting the match.
        </p>
      </div>

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

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onBack}>
          Back
        </Button>
        <Button onClick={() => onStart(queries)} disabled={queries.length === 0}>
          Start Matching
        </Button>
      </div>
    </div>
  );
}
