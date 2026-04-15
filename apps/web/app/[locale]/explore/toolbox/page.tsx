import { Metadata } from "next";
import Link from "next/link";
import { FileSearch } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Toolbox | SparkFlow",
  description: "Utility tools for data processing and analysis",
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function ToolboxPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("explore.toolbox");

  const tools = [
    {
      href: "/explore/toolbox/matcher",
      icon: FileSearch,
      title: t("queryMatcher.title"),
      description: t("queryMatcher.description"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Breadcrumb */}
      <div>
        <p className="text-sm text-muted-foreground">{t("breadcrumb")}</p>
      </div>

      {/* Title Section */}
      <div>
        <h1 className="text-4xl font-bold tracking-tight mb-2">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </div>

      {/* Tools Grid */}
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold font-mono tracking-tight">
          {tools.length} {t("availableTools")}
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
                <p className="text-xs text-muted-foreground mt-1">{tool.description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
