// apps/web/app/explore/sessions/page.tsx

import Link from 'next/link'
import { getSessions, getFilterOptions } from '@/lib/explore/queries'
import { parseSessionFilters, PAGE_SIZE } from '@/lib/explore/filters'
import { FilterBar, Pagination, EmptyState, type FilterConfig } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ExternalLink } from 'lucide-react'

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
      key: 'venue',
      label: 'Conference',
      options: filterOptions.venues.map(v => ({ value: v.id, label: v.name }))
    },
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
              <div
                key={session.id}
                className="relative block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="grid grid-cols-[1fr_auto] gap-4">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">
                        <Link href={`/explore/sessions/${session.id}`} className="after:absolute after:inset-0">
                          {session.title}
                        </Link>
                      </h3>
                      {session.sessionUrl && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 p-0 z-20 relative" asChild>
                          <a href={session.sessionUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">View Session</span>
                          </a>
                        </Button>
                      )}
                    </div>
                    {session.date && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {new Date(session.date).toLocaleDateString()}
                        {session.startTime && ` at ${session.startTime}`}
                        {session.endTime && ` - ${session.endTime}`}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <span className="text-sm text-muted-foreground">
                        {session.instance.venue.name}
                      </span>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                        {session.instance.year}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between items-end h-full pointer-events-none min-w-[100px]">
                    {/* Top: Placeholder (matches Rating slot) */}
                    <div className="h-6 flex items-center">
                    </div>

                    {/* Bottom: Type (matches Topic slot) */}
                    <div className="h-6 flex items-center mt-auto">
                      {session.type && (
                        <Badge variant="outline">{session.type}</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </div>
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
