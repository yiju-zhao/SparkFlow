// apps/web/app/explore/sessions/page.tsx

import Link from 'next/link'
import { getSessions, getFilterOptions } from '@/lib/explore/queries'
import { parseSessionFilters, PAGE_SIZE } from '@/lib/explore/filters'
import { FilterBar, Pagination, EmptyState, type FilterConfig } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SessionsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parseSessionFilters(params)

  // Parallel fetch (follows async-parallel best practice)
  const [result, filterOptions] = await Promise.all([
    getSessions(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'year',
      label: 'Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'type',
      label: 'Type',
      options: filterOptions.sessionTypes.map(t => ({ value: t, label: t }))
    }
  ]

  const totalPages = Math.ceil(result.total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} sessions found
        </p>
      </div>

      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState
          title="No sessions found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map((session) => (
              <Link
                key={session.id}
                href={`/explore/sessions/${session.id}`}
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-medium">{session.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {session.instance.name} ({session.instance.year})
                    </p>
                    {session.date && (
                      <p className="text-sm text-muted-foreground">
                        {new Date(session.date).toLocaleDateString()}
                        {session.startTime && ` at ${session.startTime}`}
                        {session.endTime && ` - ${session.endTime}`}
                      </p>
                    )}
                  </div>
                  {session.type && (
                    <Badge variant="outline">{session.type}</Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            currentPage={result.page}
            totalPages={totalPages}
            totalItems={result.total}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  )
}
