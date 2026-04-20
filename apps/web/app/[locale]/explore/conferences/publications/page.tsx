import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  getPublications,
  getFilteredPublicationOptions,
  getFilterOptions,
} from "@/lib/explore/queries";
import { parsePublicationFilters, PAGE_SIZE } from "@/lib/explore/filters";
import { EmptyState, StatusToggles } from "@/components/explore/shared";
import {
  PublicationsFilterBar,
  type PublicationsFilterConfig,
} from "@/components/explore/conferences/publications-filter-bar";
import { PublicationRow } from "@/components/explore/conferences/publication-row";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  const filterConfigs: PublicationsFilterConfig[] = [
    {
      key: "venue",
      label: tFilters("venue"),
      defaultLabel: "All Venues",
      options: filterOptions.venues.map((v) => ({ value: v.id, label: v.name })),
    },
    {
      key: "year",
      label: tFilters("year"),
      defaultLabel: "All Years",
      options: filterOptions.years.map((y) => ({ value: y.toString(), label: y.toString() })),
    },
    {
      key: "topic",
      label: tFilters("topic"),
      defaultLabel: "All Topics",
      options: filterOptions.topics.map((tp) => ({ value: tp, label: tp })),
    },
    {
      key: "status",
      label: tFilters("status"),
      defaultLabel: "All Statuses",
      options: filterOptions.statuses.map((s) => ({ value: s, label: s })),
    },
    {
      key: "affiliation",
      label: tFilters("organization"),
      defaultLabel: "All Orgs",
      options: filterOptions.affiliations.map((a) => ({ value: a, label: a })),
    },
    {
      key: "country",
      label: tFilters("country"),
      defaultLabel: "All Countries",
      options: filterOptions.countries.map((c) => ({ value: c, label: c })),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const pageStart = result.total === 0 ? 0 : result.page * PAGE_SIZE + 1;
  const pageEnd = Math.min(result.total, pageStart + result.data.length - 1);
  const currentPage = result.page + 1; // 1-indexed for display

  const searchPlaceholder = `Search ${result.total.toLocaleString()}+ publications…`;

  // Build 1-indexed condensed page list like: 1 2 3 … last
  const paginationPages: (number | "ellipsis")[] = (() => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 6) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1, 2, 3);
      if (currentPage > 4 && currentPage < totalPages - 2) {
        pages.push("ellipsis");
        pages.push(currentPage);
        pages.push("ellipsis");
      } else {
        pages.push("ellipsis");
      }
      pages.push(totalPages);
    }
    return pages;
  })();

  const pageHref = (page0: number, extra?: Record<string, string>) => {
    const params = new URLSearchParams();
    Object.entries(searchParamsResolved).forEach(([k, v]) => {
      if (typeof v === "string") params.set(k, v);
    });
    params.set("page", String(page0));
    if (extra) Object.entries(extra).forEach(([k, v]) => params.set(k, v));
    return `?${params.toString()}`;
  };

  return (
    <div className="flex flex-col">
      {/* Full-bleed header band — pseudo-element paints a 100vw white stripe
          that extends upward to sit flush against the fixed app bar. */}
      <section
        className="relative isolate -mt-24 pt-28 pb-8 mb-10
          before:content-[''] before:absolute before:inset-0 before:left-1/2
          before:-translate-x-1/2 before:w-screen before:bg-sf-surface
          before:border-b before:border-sf-line before:-z-10"
      >
        <div className="space-y-6">
          {/* Title row */}
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="text-[28px] md:text-[32px] font-extrabold text-sf-ink tracking-[-0.02em] leading-[1.05]">
                {t("publications.title")}
              </h1>
              <p className="text-sf-ink-3 text-sm mt-1.5">
                {t("publications.found", { count: result.total.toLocaleString() })}
              </p>
            </div>
          </div>

          {/* Search + filter chips */}
          <PublicationsFilterBar
            filters={filterConfigs}
            searchPlaceholder={searchPlaceholder}
          />

          {/* Status toggles (reject/withdrawal) */}
          <StatusToggles />
        </div>
      </section>

      {/* Results */}
      <section className="flex flex-col gap-4">
        {result.data.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          result.data.map((pub) => (
            <PublicationRow key={pub.id} locale={locale} pub={pub} />
          ))
        )}
      </section>

      {/* Pagination footer */}
      {result.total > 0 && (
        <div className="mt-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-sm text-sf-ink-3 font-medium">
            Showing{" "}
            <span className="text-sf-ink font-bold tabular-nums">
              {pageStart}-{pageEnd}
            </span>{" "}
            of{" "}
            <span className="text-sf-ink font-bold tabular-nums">
              {result.total.toLocaleString()}
            </span>{" "}
            publications
          </div>

          <nav className="flex items-center gap-2" aria-label="Pagination">
            <Link
              href={pageHref(Math.max(0, result.page - 1))}
              aria-disabled={result.page === 0}
              className={`w-10 h-10 flex items-center justify-center border border-sf-line-strong rounded-[6px] transition-colors ${
                result.page === 0
                  ? "text-sf-ink-4 opacity-50 pointer-events-none"
                  : "text-sf-ink-3 hover:bg-sf-bg-alt"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
            {paginationPages.map((p, idx) =>
              p === "ellipsis" ? (
                <span
                  key={`e-${idx}`}
                  className="px-2 text-sf-ink-4 font-mono select-none"
                >
                  …
                </span>
              ) : (
                <Link
                  key={p}
                  href={pageHref(p - 1)}
                  aria-current={p === currentPage ? "page" : undefined}
                  className={`w-10 h-10 flex items-center justify-center font-medium text-sm rounded-[6px] transition-colors ${
                    p === currentPage
                      ? "bg-sf-accent text-white font-bold"
                      : "border border-sf-line-strong text-sf-ink-2 hover:bg-sf-bg-alt"
                  }`}
                >
                  {p}
                </Link>
              ),
            )}
            <Link
              href={pageHref(Math.min(totalPages - 1, result.page + 1))}
              aria-disabled={currentPage === totalPages}
              className={`w-10 h-10 flex items-center justify-center border border-sf-line-strong rounded-[6px] transition-colors ${
                currentPage === totalPages
                  ? "text-sf-ink-4 opacity-50 pointer-events-none"
                  : "text-sf-ink-3 hover:bg-sf-bg-alt"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          </nav>

          <div className="text-sm font-medium text-sf-ink-3">
            Page{" "}
            <span className="text-sf-ink font-bold tabular-nums">{currentPage}</span> of{" "}
            <span className="text-sf-ink font-bold tabular-nums">{totalPages}</span>
          </div>
        </div>
      )}
    </div>
  );
}
