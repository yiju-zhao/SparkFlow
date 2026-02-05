// apps/web/app/explore/error.tsx

'use client'

import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function ExploreError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <AlertCircle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-muted-foreground mt-2 text-center max-w-md">
        Failed to load the Explore page. Please try again.
      </p>
      <Button onClick={reset} className="mt-4">
        Try again
      </Button>
    </div>
  )
}
