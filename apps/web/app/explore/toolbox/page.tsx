import { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";

export const metadata: Metadata = {
  title: "Toolbox | SparkFlow",
  description: "Utility tools for data processing and analysis",
};

const tools = [
  {
    href: "/explore/toolbox/matcher",
    icon: FileSearch,
    title: "Query Matcher",
    description:
      "Match queries against conference sessions or publications using semantic search",
  },
];

export default function ToolboxPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm text-muted-foreground">~/research-hub/toolbox</p>
      </div>

      {/* Title Section */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">Toolbox</h1>
        <p className="text-muted-foreground">
          Utility tools for data processing and analysis
        </p>
      </div>

      {/* Tools Grid */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold font-mono tracking-tight">
          available tools
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="flex items-start gap-4 p-4 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors"
            >
              <div className="p-2 rounded-md bg-primary/10">
                <tool.icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium text-sm">{tool.title}</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  {tool.description}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
