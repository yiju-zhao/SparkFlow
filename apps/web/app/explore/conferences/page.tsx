// apps/web/app/explore/conferences/page.tsx

import { getConferences, getFilterOptions } from '@/lib/explore/queries'
import { parseConferenceFilters } from '@/lib/explore/filters'
import { ConferenceGrid } from '@/components/explore/conferences'
import { FilterBar, type FilterConfig } from '@/components/explore/shared'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function ConferencesPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parseConferenceFilters(params)

  // Parallel fetch (follows async-parallel best practice)
  const [conferences, filterOptions] = await Promise.all([
    getConferences(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'venue',
      label: 'Venue',
      options: filterOptions.venues.map(v => ({ value: v.id, label: v.name }))
    },
    {
      key: 'year',
      label: 'Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    }
  ]

  return (
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">~/research-hub/conferences</p>
        <h1 className="text-4xl font-bold tracking-tight">Conferences</h1>
        <p className="text-muted-foreground mt-2">
          Browse {conferences.length} conferences
        </p>
      </div>

      {/* Filters */}
      <FilterBar filters={filterConfigs} />

      {/* Conference List */}
      <div className="bg-card rounded-lg p-6">
        <ConferenceGrid conferences={conferences} />
      </div>
    </div>
  )
}
