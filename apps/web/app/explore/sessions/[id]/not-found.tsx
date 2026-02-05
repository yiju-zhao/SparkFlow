// apps/web/app/explore/sessions/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Calendar } from 'lucide-react'

export default function SessionNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Session not found</h2>
      <p className="text-muted-foreground mt-2">
        This session may have been removed or doesn&apos;t exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/sessions">Browse all sessions</Link>
      </Button>
    </div>
  )
}
