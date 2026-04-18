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

  const [conferences, filterOptions] = await Promise.all([
    getConferences(filters),
    getFilterOptions(),
  ]);

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
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 border-b border-sf-line pb-6">
        <p className="sf-eyebrow">{t("conferences.breadcrumb")}</p>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="sf-h1">{t("conferences.title")}</h1>
            <p className="sf-lede mt-2">{t("conferences.subtitle")}</p>
          </div>
          <div className="hidden md:block text-right">
            <div className="font-extrabold text-sf-ink text-[32px] tabular-nums leading-none">
              {conferences.length.toLocaleString()}
            </div>
            <div className="sf-eyebrow mt-2">Indexed venues</div>
          </div>
        </div>
      </header>

      <FilterBar filters={filterConfigs} />

      <ConferenceGrid conferences={conferences} />
    </div>
  );
}
