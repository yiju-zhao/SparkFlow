import { Metadata } from "next";
import { MatcherWizard } from "./components/matcher-wizard";

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
        <h1 className="text-4xl font-bold tracking-tight mb-2">
          Query Matcher
        </h1>
        <p className="text-muted-foreground">
          Upload queries and match them against conference sessions or
          publications using semantic search.
        </p>
      </div>

      <MatcherWizard />
    </div>
  );
}
