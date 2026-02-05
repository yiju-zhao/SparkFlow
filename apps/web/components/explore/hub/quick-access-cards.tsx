// apps/web/components/explore/hub/quick-access-cards.tsx

import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Building2, FileText, Calendar, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const cards = [
  {
    title: 'Conferences',
    description: 'Browse conferences by venue and year',
    href: '/explore/conferences',
    icon: Building2,
    gradient: 'from-blue-500/10 via-blue-500/5 to-transparent',
    iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  },
  {
    title: 'Publications',
    description: 'Search papers by topic, author, and more',
    href: '/explore/publications',
    icon: FileText,
    gradient: 'from-emerald-500/10 via-emerald-500/5 to-transparent',
    iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  },
  {
    title: 'Sessions',
    description: 'Explore sessions and schedules',
    href: '/explore/sessions',
    icon: Calendar,
    gradient: 'from-purple-500/10 via-purple-500/5 to-transparent',
    iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
  },
]

export function QuickAccessCards() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Link key={card.href} href={card.href}>
          <Card className="group relative overflow-hidden h-full transition-all duration-200 hover:shadow-md hover:border-primary/20">
            <div className={cn('absolute inset-0 bg-gradient-to-br pointer-events-none', card.gradient)} />
            <CardContent className="p-6 relative">
              <div className="flex items-start justify-between mb-4">
                <div className={cn('p-3 rounded-xl', card.iconBg)}>
                  <card.icon className="h-6 w-6" />
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200" />
              </div>
              <h3 className="font-semibold text-lg mb-1">{card.title}</h3>
              <p className="text-sm text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  )
}
