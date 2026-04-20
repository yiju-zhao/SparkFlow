import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getSessions, getFilteredSessionOptions } from "@/lib/explore/queries";
import { parseSessionFilters, PAGE_SIZE } from "@/lib/explore/filters";
import { EmptyState } from "@/components/explore/shared";
import {
  PublicationsFilterBar,
  type PublicationsFilterConfig,
} from "@/components/explore/conferences/publications-filter-bar";
import { SessionRow } from "@/components/explore/conferences/session-row";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

  const [result, filterOptions] = await Promise.all([
    getSessions(filters),
    getFilteredSessionOptions(filters),
  ]);

  const filterConfigs: PublicationsFilterConfig[] = [
    {
      key: "venue",
      label: tFilters("conference"),
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
      key: "type",
      label: tFilters("type"),
      defaultLabel: "All Types",
      options: filterOptions.sessionTypes.map((tp) => ({ value: tp, label: tp })),
    },
  ];

  const totalPages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const pageStart = result.total === 0 ? 0 : result.page * PAGE_SIZE + 1;
  const pageEnd = Math.min(result.total, pageStart + result.data.length - 1);
  const currentPage = result.page + 1;
  const searchPlaceholder = `Search ${result.total.toLocaleString()}+ sessions…`;

  // Client-side title search (same pattern as conferences)
  const q = (searchParamsResolved.q as string | undefined)?.toLowerCase() ?? "";
  const rows = q
    ? result.data.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.instance.venue.name.toLowerCase().includes(q) ||
          (s.type?.toLowerCase().includes(q) ?? false),
      )
    : result.data;

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

  const pageHref = (page0: number) => {
    const params = new URLSearchParams();
    Object.entries(searchParamsResolved).forEach(([k, v]) => {
      if (typeof v === "string") params.set(k, v);
    });
    params.set("page", String(page0));
    return `?${params.toString()}`;
  };

  return (
    <div className="flex flex-col">
      {/* Full-bleed header band */}
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
                {t("sessions.title")}
              </h1>
              <p className="text-sf-ink-3 text-sm mt-1.5">
                {t("sessions.found", { count: result.total.toLocaleString() })}
              </p>
            </div>
          </div>

          {/* Search + filter chips */}
          <PublicationsFilterBar
            filters={filterConfigs}
            searchPlaceholder={searchPlaceholder}
          />
        </div>
      </section>

      {/* Results */}
      <section className="flex flex-col gap-4">
        {rows.length === 0 ? (
          <EmptyState title={t("empty.title")} description={t("empty.description")} />
        ) : (
          rows.map((session) => <SessionRow key={session.id} locale={locale} session={session} />)
        )}
      </section>

      {/* Pagination */}
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
            sessions
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
