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
    <div className="flex flex-col gap-10">
      {/* Title Section */}
      <div>
        <p className="text-sm text-muted-foreground mb-2">~/research-hub/sessions</p>
        <h1 className="text-4xl font-bold tracking-tight">Sessions</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} sessions found
        </p>
      </div>

      {/* Filters */}
      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState
          title="No sessions found"
          description="Try adjusting your filters"
        />
      ) : (
        <div className="bg-card rounded-lg">
          {/* Session List */}
          <div className="divide-y divide-border">
            {result.data.map((session) => (
              <div
                key={session.id}
                className="relative p-5 hover:bg-muted/30 transition-colors first:rounded-t-lg last:rounded-b-lg"
              >
                <div className="grid grid-cols-[1fr_auto] gap-4">
                  <div className="flex flex-col h-full">
                    <div className="flex items-center gap-2">
                      {session.type && (
                        <Badge variant="secondary">{session.type}</Badge>
                      )}
                      <h3 className="font-medium truncate flex-1 min-w-0">
                        <Link href={`/explore/sessions/${session.id}`} className="after:absolute after:inset-0">
                          {session.title}
                        </Link>
                      </h3>
                    </div>
                    <div className="flex items-center gap-2 mt-auto pt-2">
                      <span className="text-sm text-muted-foreground">
                        {session.instance.venue.name}
                      </span>
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-medium">
                        {session.instance.year}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col justify-between items-end h-full min-w-[100px]">
                    {/* Top: Session Link */}
                    <div className="h-6 flex items-center">
                      {session.sessionUrl && (
                        <Button variant="ghost" size="icon" className="h-6 w-6 p-0 z-20 relative" asChild>
                          <a href={session.sessionUrl} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4" />
                            <span className="sr-only">View Session</span>
                          </a>
                        </Button>
                      )}
                    </div>

                    {/* Bottom: Date/Time */}
                    <div className="h-6 flex items-center mt-auto pointer-events-none">
                      {session.date && (
                        <span className="text-sm text-muted-foreground">
                          {new Date(session.date).toLocaleDateString()}
                          {session.startTime && ` ${session.startTime}`}
                          {session.endTime && ` - ${session.endTime}`}
                        </span>
                      )}
                    </div>
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
  )
}
