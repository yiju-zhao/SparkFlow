import { Metadata } from "next";
import { MatcherWizard } from "./components/matcher-wizard";

export const metadata: Metadata = {
  title: "Query Matcher | SparkFlow",
  description: "Match queries against conference sessions and publications",
};

export default function MatcherPage() {
  return (
    <div className="container max-w-3xl py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Query Matcher</h1>
        <p className="text-muted-foreground mt-1">
          Upload queries and match them against conference sessions or publications
          using semantic search.
        </p>
      </div>

      <MatcherWizard />
    </div>
  );
}
