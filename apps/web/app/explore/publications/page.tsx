// apps/web/app/explore/publications/page.tsx

import Link from 'next/link'
import { getPublications, getFilterOptions } from '@/lib/explore/queries'
import { parsePublicationFilters, PAGE_SIZE } from '@/lib/explore/filters'
import { FilterBar, Pagination, EmptyState, type FilterConfig } from '@/components/explore/shared'
import { Badge } from '@/components/ui/badge'

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function PublicationsPage({ searchParams }: PageProps) {
  const params = await searchParams
  const filters = parsePublicationFilters(params)

  // Parallel fetch (follows async-parallel best practice)
  const [result, filterOptions] = await Promise.all([
    getPublications(filters),
    getFilterOptions()
  ])

  const filterConfigs: FilterConfig[] = [
    {
      key: 'year',
      label: 'Year',
      options: filterOptions.years.map(y => ({ value: y.toString(), label: y.toString() }))
    },
    {
      key: 'topic',
      label: 'Topic',
      options: filterOptions.topics.map(t => ({ value: t, label: t }))
    }
  ]

  const totalPages = Math.ceil(result.total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Publications</h1>
        <p className="text-muted-foreground mt-2">
          {result.total.toLocaleString()} publications found
        </p>
      </div>

      <FilterBar filters={filterConfigs} />

      {result.data.length === 0 ? (
        <EmptyState
          title="No publications found"
          description="Try adjusting your filters"
        />
      ) : (
        <>
          <div className="space-y-2">
            {result.data.map((pub) => (
              <Link
                key={pub.id}
                href={`/explore/publications/${pub.id}`}
                className="block p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium">{pub.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {pub.authors.slice(0, 3).join(', ')}
                      {pub.authors.length > 3 && ` +${pub.authors.length - 3} more`}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm text-muted-foreground">
                        {pub.instance.venue.name}
                      </span>
                      <Badge variant="secondary" className="h-5 px-1.5 text-[10px] font-medium">
                        {pub.instance.year}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {pub.rating && (
                      <Badge variant="secondary">{pub.rating.toFixed(1)}</Badge>
                    )}
                    {pub.researchTopic && (
                      <Badge variant="outline">{pub.researchTopic}</Badge>
                    )}
                  </div>
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
