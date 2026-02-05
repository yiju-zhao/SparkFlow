// apps/web/app/explore/publications/[id]/not-found.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { FileText } from 'lucide-react'

export default function PublicationNotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <FileText className="h-12 w-12 text-muted-foreground mb-4" />
      <h2 className="text-lg font-semibold">Publication not found</h2>
      <p className="text-muted-foreground mt-2">
        This publication may have been removed or doesn&apos;t exist.
      </p>
      <Button asChild className="mt-4">
        <Link href="/explore/publications">Browse all publications</Link>
      </Button>
    </div>
  )
}
