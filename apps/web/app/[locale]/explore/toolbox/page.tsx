import { Metadata } from "next";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  ArrowUpRight,
  FileSearch,
  GitFork,
  Scan,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Toolbox | SparkFlow",
  description: "Utility tools for data processing and analysis",
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

type ToolStatus = "active" | "soon";

interface Tool {
  href?: string;
  icon: typeof FileSearch;
  title: string;
  description: string;
  status: ToolStatus;
}

export default async function ToolboxPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore.toolbox");

  const tools: Tool[] = [
    {
      href: `/${locale}/explore/toolbox/matcher`,
      icon: FileSearch,
      title: "Query Matcher",
      description:
        "Rank publications and sessions for an arbitrary research query with rationale and citations.",
      status: "active",
    },
    {
      icon: GitFork,
      title: "Citation Graph Explorer",
      description:
        "Traverse the citation network of any paper; cluster by topic and export subgraphs.",
      status: "soon",
    },
    {
      icon: Scan,
      title: "Author Disambiguation",
      description:
        "Resolve duplicate author records, merge affiliations, build clean researcher profiles.",
      status: "soon",
    },
    {
      icon: Sparkles,
      title: "Trend Radar",
      description: "Track keyword velocity and emerging topics across venues quarter by quarter.",
      status: "soon",
    },
    {
      icon: Waypoints,
      title: "Affiliation Map",
      description: "Geo-visualise institutional collaboration patterns by year and sub-field.",
      status: "soon",
    },
    {
      icon: Sparkles,
      title: "Topic Synth",
      description: "Generate quarterly topic syntheses from the top-rated publications.",
      status: "soon",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="mb-10">
        <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
          Research Utilities
        </p>
        <h1 className="text-[40px] md:text-[56px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03] max-w-[24ch]">
          {t("title")}
        </h1>
        <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">
          {t("subtitle")}
        </p>
      </section>

      {/* Tool grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {tools.map((tool) => (
          <ToolCard key={tool.title} tool={tool} />
        ))}
      </section>
    </div>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  const isActive = tool.status === "active";

  const content = (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-start justify-between">
        <span className="sf-icon-tile h-11 w-11">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </span>
        <span
          className={cn(
            "sf-badge",
            isActive ? "sf-badge-success" : "sf-badge-muted",
          )}
        >
          {isActive ? (
            <>
              <span className="dot" />
              Active
            </>
          ) : (
            "Soon"
          )}
        </span>
      </div>
      <div>
        <h3 className="text-[18px] font-bold text-sf-ink leading-snug">{tool.title}</h3>
        <p className="text-sm text-sf-ink-3 mt-1.5 leading-relaxed">{tool.description}</p>
      </div>
      {isActive && (
        <span className="mt-auto inline-flex items-center gap-1 text-xs font-bold uppercase tracking-[0.14em] text-sf-accent">
          Open
          <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      )}
    </div>
  );

  if (tool.href) {
    return (
      <Link
        href={tool.href}
        className="sf-card card-hoverable p-6 h-full block transition-colors"
      >
        {content}
      </Link>
    );
  }
  return <div className="sf-card p-6 h-full opacity-80">{content}</div>;
}
