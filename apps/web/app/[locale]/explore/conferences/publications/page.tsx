import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getPublications,
  getFilteredPublicationOptions,
  getFilterOptions,
} from "@/lib/explore/queries";
import { parsePublicationFilters, PAGE_SIZE } from "@/lib/explore/filters";
import {
  FilterBar,
  Pagination,
  EmptyState,
  StatusToggles,
  type FilterConfig,
} from "@/components/explore/shared";
import { Button } from "@/components/ui/button";
import { FileText, Search } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function PublicationsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parsePublicationFilters(searchParamsResolved);
  const t = await getTranslations("explore");
  const tFilters = await getTranslations("explore.filters");

  const [result, filteredOptions, globalOptions] = await Promise.all([
    getPublications(filters),
    getFilteredPublicationOptions(filters),
    getFilterOptions(),
  ]);

  const filterOptions = {
    ...filteredOptions,
    affiliations: globalOptions.affiliations,
    countries: globalOptions.countries,
  };

  const filterConfigs: FilterConfig[] = [
    {
      key: "venue",
      label: tFilters("venue"),
      options: filterOptions.venues.map((v) => ({ value: v.id, label: v.name })),
    },
    {
      key: "year",
      label: tFilters("year"),
      options: filterOptions.years.map((y) => ({ value: y.toString(), label: y.toString() })),
    },
    {
      key: "topic",
      label: tFilters("topic"),
      options: filterOptions.topics.map((tp) => ({ value: tp, label: tp })),
    },
    {
      key: "status",
      label: tFilters("status"),
      options: filterOptions.statuses.map((s) => ({ value: s, label: s })),
    },
    {
      key: "affiliation",
      label: tFilters("organization"),
      options: filterOptions.affiliations.map((a) => ({ value: a, label: a })),
    },
    {
      key: "country",
      label: tFilters("country"),
      options: filterOptions.countries.map((c) => ({ value: c, label: c })),
    },
  ];

  const totalPages = Math.ceil(result.total / PAGE_SIZE);

  return (
    <div className="flex flex-col gap-8">
      {/* Header */}
      <header className="flex flex-col gap-3 border-b border-sf-line pb-6">
        <p className="sf-eyebrow">{t("publications.breadcrumb")}</p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="sf-h1">{t("publications.title")}</h1>
            <p className="sf-meta mt-2">
              {t("publications.found", { count: result.total.toLocaleString() })}
            </p>
          </div>
        </div>
      </header>

      {/* Search bar (visual only — search is via the FilterBar selects) */}
      <div className="sf-card p-3.5 flex items-center gap-3">
        <Search className="h-4 w-4 text-sf-ink-4" />
        <span className="text-sm text-sf-ink-4">
          Search across {result.total.toLocaleString()}+ publications — refine with the filters below.
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        <FilterBar filters={filterConfigs} />
        <StatusToggles />
      </div>

      {result.data.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.description")} />
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {result.data.map((pub) => (
              <article
                key={pub.id}
                className="sf-card card-hoverable relative flex items-start justify-between gap-5 p-5"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="sf-badge sf-badge-soft">
                      {pub.instance.venue.name} {pub.instance.year}
                    </span>
                    {pub.status && <span className="sf-badge sf-badge-muted">{pub.status}</span>}
                    {pub.researchTopic && (
                      <span className="sf-badge sf-badge-muted">{pub.researchTopic}</span>
                    )}
                  </div>

                  <h3 className="text-[17px] font-semibold text-sf-ink leading-snug">
                    <Link
                      href={`/${locale}/explore/conferences/publications/${pub.id}`}
                      className="after:absolute after:inset-0 after:content-[''] hover:text-sf-accent transition-colors"
                    >
                      {pub.title}
                    </Link>
                  </h3>

                  <p className="text-sm text-sf-ink-3 truncate">
                    {pub.authors.slice(0, 3).join(", ")}
                    {pub.authors.length > 3 && ` +${pub.authors.length - 3} others`}
                  </p>

                  {pub.pdfUrl && (
                    <div className="mt-1 flex items-center gap-2 relative z-10">
                      <Button variant="outline" size="sm" asChild>
                        <a href={pub.pdfUrl} target="_blank" rel="noopener noreferrer">
                          <FileText className="h-3.5 w-3.5" />
                          View PDF
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                {pub.rating != null && (
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-sf-accent text-[28px] leading-none tabular-nums">
                      {pub.rating.toFixed(1)}
                    </div>
                    <div className="sf-eyebrow mt-2">Impact</div>
                  </div>
                )}
              </article>
            ))}
          </div>

          <div className="sf-card">
            <Pagination
              currentPage={result.page}
              totalPages={totalPages}
              totalItems={result.total}
              pageSize={PAGE_SIZE}
            />
          </div>
        </>
      )}
    </div>
  );
}
