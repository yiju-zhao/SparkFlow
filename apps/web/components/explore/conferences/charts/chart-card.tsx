import { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface ChartCardProps {
    title: string
    children: ReactNode
    className?: string
    height?: string
    action?: ReactNode
}

export function ChartCard({
    title,
    children,
    className,
    height = "h-[300px]",
    action
}: ChartCardProps) {
    return (
        <Card className={cn("flex flex-col", className)}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-base font-semibold text-foreground/80">
                    {title}
                </CardTitle>
                {action}
            </CardHeader>
            <CardContent className="flex-1 min-h-0 pt-4">
                <div className={cn("w-full relative", height)}>
                    {children}
                </div>
            </CardContent>
        </Card>
    )
}
