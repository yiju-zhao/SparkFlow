import { UnifiedHeader } from '@/components/unified-header'
import { auth } from '@/lib/auth'
import Link from 'next/link'
import { headers } from 'next/headers'

// Nav links component for Explore
import ExploreNavLinks from './nav-links'

export default async function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()

  return (
    <div className="flex flex-col h-screen">
      <UnifiedHeader
        theme="green"
        title="research-hub"
        navLinks={<ExploreNavLinks />}
        actionButton={
          <Link
            href="/deepdive"
            className="px-3 py-1.5 text-sm border border-[#555] rounded text-[#ccc] hover:text-white hover:border-accent-red transition-colors"
          >
            ← back to deepdive
          </Link>
        }
        user={session?.user}
      />

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-secondary">
        <main className="px-12 py-10 pb-16">
          {children}
        </main>
      </div>
    </div>
  )
}
