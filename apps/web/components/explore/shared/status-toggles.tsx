// apps/web/components/explore/shared/status-toggles.tsx

'use client'

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import type { CheckedState } from '@radix-ui/react-checkbox'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface StatusTogglesProps {
    className?: string
}

export function StatusToggles({ className }: StatusTogglesProps) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    const showExcluded = searchParams.get('showExcluded') === 'true'

    const updateToggle = (checked: boolean) => {
        const params = new URLSearchParams(searchParams.toString())
        if (checked) {
            params.set('showExcluded', 'true')
        } else {
            params.delete('showExcluded')
        }
        params.set('page', '0')

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`)
        })
    }

    return (
        <div className={`flex items-center gap-2 ${className} ${isPending ? 'opacity-70' : ''}`}>
            <Checkbox
                id="showExcluded"
                checked={showExcluded}
                onCheckedChange={(checked: CheckedState) => updateToggle(checked === true)}
            />
            <Label htmlFor="showExcluded" className="text-sm cursor-pointer">
                Show Rejected/Withdrawal
            </Label>
        </div>
    )
}
