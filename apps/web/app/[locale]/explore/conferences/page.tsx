// apps/web/app/explore/conferences/page.tsx

import { getTranslations, setRequestLocale } from "next-intl/server";
import { getConferences, getFilterOptions } from "@/lib/explore/queries";
import { parseConferenceFilters } from "@/lib/explore/filters";
import { ConferenceGrid } from "@/components/explore/conferences";
import { FilterBar, type FilterConfig } from "@/components/explore/shared";

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
  const tFilters = await getTranslations("explore.filters");

  // Parallel fetch (follows async-parallel best practice)
  const [conferences, filterOptions] = await Promise.all([
    getConferences(filters),
    getFilterOptions(),
  ]);

  const filterConfigs: FilterConfig[] = [
    {
      key: "venue",
      label: tFilters("venue"),
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
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">{t("conferences.breadcrumb")}</p>
        <h1 className="text-4xl font-bold tracking-tight">{t("conferences.title")}</h1>
        <p className="text-muted-foreground mt-2">{t("conferences.subtitle")}</p>
      </div>

      {/* Filters */}
      <FilterBar filters={filterConfigs} />

      {/* Conference List */}
      <div className="bg-card rounded-lg p-6">
        <ConferenceGrid conferences={conferences} />
      </div>
    </div>
  );
}
