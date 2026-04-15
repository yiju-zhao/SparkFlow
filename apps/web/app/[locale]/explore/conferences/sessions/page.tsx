// apps/web/app/explore/sessions/page.tsx

import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessions, getFilteredSessionOptions } from "@/lib/explore/queries";
import { parseSessionFilters, PAGE_SIZE } from "@/lib/explore/filters";
import { FilterBar, Pagination, EmptyState, type FilterConfig } from "@/components/explore/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SessionsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parseSessionFilters(searchParamsResolved);
  const t = await getTranslations("explore");
  const tFilters = await getTranslations("explore.filters");

  // Parallel fetch (follows async-parallel best practice)
  const [result, filterOptions] = await Promise.all([
    getSessions(filters),
    getFilteredSessionOptions(filters),
  ]);

  const filterConfigs: FilterConfig[] = [
    {
      key: "venue",
      label: tFilters("conference"),
      options: filterOptions.venues.map((v) => ({
        value: v.id,
        label: v.name,
      })),
    },
    {
      key: "year",
      label: tFilters("year"),
      options: filterOptions.years.map((y) => ({
        value: y.toString(),
        label: y.toString(),
      })),
    },
    {
      key: "type",
      label: tFilters("type"),
      options: filterOptions.sessionTypes.map((tp) => ({ value: tp, label: tp })),
    },
  ];

  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t("sessions.breadcrumb")}</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("sessions.title")}</h1>
        <p className="text-muted-foreground mt-2">
          {t("sessions.found", { count: result.total.toLocaleString() })}
        </p>
      </div>

      {/* Filters */}
      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <div className="bg-card rounded-lg">
          {/* Session List */}
          <div className="divide-y divide-border">
            {result.data.map((session) => (
              <div
                key={session.id}
                className="relative px-5 py-3 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex flex-col gap-1">
                  {/* Row 1: Venue+Year + Title + Session Link */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {session.instance.venue.name} {session.instance.year}
                    </span>
                    <h3 className="font-medium truncate flex-1 min-w-0">
                      <Link
                        href={`/explore/sessions/${session.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {session.title}
                      </Link>
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {session.sessionUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 p-0 z-20 relative"
                          asChild
                        >
                          <a href={session.sessionUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5" />
                            <span className="sr-only">View Session</span>
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Type + Time */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {session.type && (
                      <Badge
                        variant="secondary"
                        className="shrink-0 h-5 px-1.5 text-[10px] font-medium"
                      >
                        {session.type}
                      </Badge>
                    )}
                    {session.date && (
                      <span className="truncate">
                        {new Date(session.date).toISOString().split("T")[0]}
                        {session.startTime && ` ${session.startTime}`}
                        {session.endTime && ` - ${session.endTime}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="border-t border-border p-5">
            <Pagination
              currentPage={result.page}
              totalPages={totalPages}
              totalItems={result.total}
              pageSize={PAGE_SIZE}
            />
          </div>
        </div>
      )}
    </div>
  );
}
