// apps/web/app/explore/publications/page.tsx

import Link from "next/link";
import { getPublications, getFilterOptions } from "@/lib/explore/queries";
import { parsePublicationFilters, PAGE_SIZE } from "@/lib/explore/filters";
import {
  FilterBar,
  Pagination,
  EmptyState,
  StatusToggles,
  type FilterConfig,
} from "@/components/explore/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicationsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const filters = parsePublicationFilters(params);

  // Parallel fetch (follows async-parallel best practice)
  const [result, filterOptions] = await Promise.all([
    getPublications(filters),
    getFilterOptions(),
  ]);

  const filterConfigs: FilterConfig[] = [
    {
      key: "venue",
      label: "Venue",
      options: filterOptions.venues.map((v) => ({
        value: v.id,
        label: v.name,
      })),
    },
    {
      key: "year",
      label: "Year",
      options: filterOptions.years.map((y) => ({
        value: y.toString(),
        label: y.toString(),
      })),
    },
    {
      key: "topic",
      label: "Topic",
      options: filterOptions.topics.map((t) => ({ value: t, label: t })),
    },
    {
      key: "status",
      label: "Status",
      options: filterOptions.statuses.map((s) => ({ value: s, label: s })),
    },
    {
      key: "affiliation",
      label: "Organization",
      options: filterOptions.affiliations.map((a) => ({ value: a, label: a })),
    },
    {
      key: "country",
      label: "Country",
      options: filterOptions.countries.map((c) => ({ value: c, label: c })),
    },
  ];

  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          ~/research-hub/publications
        </p>
        <h1 className="text-4xl font-bold tracking-tight">Publications</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} publications found
        </p>
      </div>

      {/* Filters */}
      <div className="space-y-3">
        <FilterBar filters={filterConfigs} />
        <StatusToggles />
      </div>

      {result.data.length === 0 ? (
        <EmptyState
          title="No publications found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="bg-card rounded-lg">
          {/* Publication List */}
          <div className="divide-y divide-border">
            {result.data.map((pub) => (
              <div
                key={pub.id}
                className="relative px-5 py-3 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="flex flex-col gap-1">
                  {/* Row 1: Venue+Year + Title + PDF/Rating */}
                  <div className="flex items-center gap-3">
                    <span className="shrink-0 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                      {pub.instance.venue.name} {pub.instance.year}
                    </span>
                    <h3 className="font-medium truncate flex-1 min-w-0">
                      <Link
                        href={`/explore/publications/${pub.id}`}
                        className="after:absolute after:inset-0"
                      >
                        {pub.title}
                      </Link>
                    </h3>
                    <div className="flex items-center gap-2 shrink-0">
                      {pub.pdfUrl && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 p-0 z-20 relative"
                          asChild
                        >
                          <a
                            href={pub.pdfUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <FileText className="h-3.5 w-3.5" />
                            <span className="sr-only">PDF</span>
                          </a>
                        </Button>
                      )}
                      {pub.rating && (
                        <Badge variant="secondary" className="tabular-nums">
                          {pub.rating.toFixed(1)}
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Row 2: Authors + Status + Topic */}
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="truncate">
                      {pub.authors.slice(0, 3).join(", ")}
                      {pub.authors.length > 3 && ` +${pub.authors.length - 3}`}
                    </span>
                    {pub.status && (
                      <Badge variant="secondary" className="shrink-0">
                        {pub.status}
                      </Badge>
                    )}
                    {pub.researchTopic && (
                      <Badge
                        variant="outline"
                        className="h-5 px-1.5 text-[10px] font-medium pointer-events-none shrink-0 ml-auto"
                      >
                        {pub.researchTopic}
                      </Badge>
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
