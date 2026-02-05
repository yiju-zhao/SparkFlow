// apps/web/app/explore/layout.tsx

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Home, Building2, FileText, Calendar, Network } from 'lucide-react'

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="h-screen overflow-y-auto bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-6 flex h-14 items-center">
          <div className="flex items-center gap-4">
            <Link href="/explore" className="flex items-center gap-2 font-bold text-lg tracking-tight hover:opacity-80 transition-opacity">
              <Network className="h-5 w-5" />
              Research Hub
            </Link>

            <div className="h-6 w-px bg-border/60" />

            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/explore/conferences">
                  <Building2 className="h-4 w-4 mr-2" />
                  Conferences
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/explore/publications">
                  <FileText className="h-4 w-4 mr-2" />
                  Publications
                </Link>
              </Button>
              <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground">
                <Link href="/explore/sessions">
                  <Calendar className="h-4 w-4 mr-2" />
                  Sessions
                </Link>
              </Button>
            </div>
          </div>

          <div className="ml-auto">
            <Button variant="outline" size="sm" asChild>
              <Link href="/deepdive">Back to DeepDive</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-6 py-8 pb-16">
        {children}
      </main>
    </div>
  )
}
