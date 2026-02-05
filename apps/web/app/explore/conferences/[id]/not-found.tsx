// apps/web/app/explore/conferences/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Building2 } from 'lucide-react'

export default function ConferenceNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Conference not found</h2>
      <p className="text-muted-foreground mt-2">
        This conference may have been removed or doesn&apos;t exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/conferences">Browse all conferences</Link>
      </Button>
    </div>
  )
}
