import { getTranslations, setRequestLocale } from "next-intl/server";
import { getConferences, getFilterOptions } from "@/lib/explore/queries";
import { parseConferenceFilters } from "@/lib/explore/filters";
import { ConferenceGrid } from "@/components/explore/conferences";
import { ConferencesFilterBar } from "@/components/explore/conferences/conferences-filter-bar";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ConferencesPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const searchParamsResolved = await searchParams;
  const filters = parseConferenceFilters(searchParamsResolved);
  const t = await getTranslations("explore");

  const [conferences, filterOptions] = await Promise.all([
    getConferences(filters),
    getFilterOptions(),
  ]);

  // Client-side search filtering (text match against name)
  const q = (searchParamsResolved.q as string | undefined)?.toLowerCase() ?? "";
  const filtered = q
    ? conferences.filter(
        (c) =>
          c.name.toLowerCase().includes(q) || c.venue.name.toLowerCase().includes(q),
      )
    : conferences;

  const venueOptions = filterOptions.venues.map((v) => ({ value: v.id, label: v.name }));
  const yearOptions = filterOptions.years.map((y) => ({
    value: y.toString(),
    label: y.toString(),
  }));

  return (
    <div className="flex flex-col gap-10">
      {/* Breadcrumb */}
      {/* Hero title — mirrors the Social Insights Hub display block */}
      <section className="mb-4">
        <p className="text-sf-accent text-xs font-bold uppercase tracking-[0.22em] mb-3">
          Field Reports
        </p>
        <h1 className="text-[40px] md:text-[56px] font-black text-sf-ink tracking-[-0.025em] leading-[1.03] max-w-[24ch]">
          {t("conferences.title")}
        </h1>
        <p className="mt-5 max-w-[64ch] text-lg leading-relaxed text-sf-ink-3">
          {t("conferences.subtitle")}
        </p>
      </section>

      {/* Labeled filter bar */}
      <ConferencesFilterBar venues={venueOptions} years={yearOptions} />

      {/* Meta row — count + view toggle */}
      <div className="flex items-center justify-between text-sm">
        <p className="text-sf-ink-3">
          Showing{" "}
          <span className="font-bold text-sf-ink tabular-nums">
            {filtered.length.toLocaleString()}
          </span>{" "}
          conference{filtered.length === 1 ? "" : "s"}
          {q && (
            <>
              {" "}
              matching <span className="font-mono text-sf-accent">&ldquo;{q}&rdquo;</span>
            </>
          )}
        </p>
      </div>

      {/* Conference grid */}
      <ConferenceGrid conferences={filtered} />

      {/* Pagination (stub — conferences query returns everything today) */}
      {filtered.length > 0 && (
        <div className="mt-4 flex justify-center items-center gap-2">
          <button
            disabled
            aria-label="Previous page"
            className="w-10 h-10 flex items-center justify-center border border-sf-line-strong bg-sf-surface text-sf-ink-4 disabled:opacity-50 rounded-[6px]"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button className="w-10 h-10 flex items-center justify-center bg-sf-accent text-white font-bold text-sm rounded-[6px]">
            1
          </button>
          <button
            disabled
            aria-label="Next page"
            className="w-10 h-10 flex items-center justify-center border border-sf-line-strong bg-sf-surface text-sf-ink-4 disabled:opacity-50 rounded-[6px]"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
