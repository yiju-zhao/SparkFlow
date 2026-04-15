import { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { MatcherWizard } from "@/components/explore/toolbox/matcher/matcher-wizard";

export const metadata: Metadata = {
  title: "Query Matcher | SparkFlow",
  description: "Match queries against conference sessions and publications",
};

export default function MatcherPage() {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-sm text-muted-foreground mb-2 font-mono">
          ~/research-hub/toolbox/query-matcher
        </p>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">Query Matcher</h1>
            <p className="text-muted-foreground">
              Upload queries and match them against conference sessions or publications using
              semantic search.
            </p>
          </div>
          <Link href="/explore/toolbox/matcher/history">
            <Button variant="outline">History</Button>
          </Link>
        </div>
      </div>

      <MatcherWizard />
    </div>
  );
}
