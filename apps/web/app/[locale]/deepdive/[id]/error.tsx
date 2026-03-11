"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, Home } from "lucide-react";
import Link from "next/link";

export default function NotebookError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Notebook error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="flex max-w-md flex-col items-center text-center">
        <div className="mb-4 rounded-full bg-destructive/10 p-3">
          <AlertCircle className="h-8 w-8 text-destructive" />
        </div>
        <h2 className="mb-2 text-xl font-semibold">Failed to load notebook</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          There was a problem loading this notebook. The notebook may not exist
          or you may not have permission to access it.
        </p>
        <div className="flex gap-3">
          <Button onClick={reset} variant="outline">
            Try again
          </Button>
          <Button asChild>
            <Link href="/deepdive">
              <Home className="mr-2 h-4 w-4" />
              Back to notebooks
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
