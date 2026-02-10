'use client'

// apps/web/app/explore/layout.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navLinks = [
  { href: '/explore/conferences', label: 'conferences' },
  { href: '/explore/publications', label: 'publications' },
  { href: '/explore/sessions', label: 'sessions' },
] as const

export default function ExploreLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  return (
    <div className="flex flex-col h-screen">
      {/* Navigation — outside scroll container so scrollbar doesn't affect it */}
      <nav className="shrink-0 bg-foreground text-background z-[100]">
        <div className="grid grid-cols-3 h-14 items-center px-12">
          {/* Left: Logo */}
          <div className="flex items-center">
            <Link href="/explore" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <span className="text-[#00D084] font-bold text-base">&gt;</span>
              <span className="font-medium text-lg">research-hub</span>
            </Link>
          </div>

          {/* Center: Nav links */}
          <div className="flex items-center justify-center gap-8">
            {navLinks.map(({ href, label }) => {
              const isActive = pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative flex items-center justify-center text-sm transition-colors ${isActive ? 'text-white' : 'text-[#999] hover:text-white'
                    }`}
                >
                  {isActive && (
                    <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#00D084]" />
                  )}
                  {label}
                </Link>
              )
            })}
          </div>

          {/* Right: Back button */}
          <div className="flex items-center justify-end">
            <Link
              href="/deepdive"
              className="px-3 py-1.5 text-sm border border-[#555] rounded text-[#ccc] hover:text-white hover:border-accent-red transition-colors"
            >
              ← back to deepdive
            </Link>
          </div>
        </div>
      </nav>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-secondary">
        <main className="px-12 py-10 pb-16">
          {children}
        </main>
      </div>
    </div>
  )
}
