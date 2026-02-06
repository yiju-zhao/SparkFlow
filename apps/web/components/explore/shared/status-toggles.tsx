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

    const showRejected = searchParams.get('showRejected') === 'true'
    const showWithdrawal = searchParams.get('showWithdrawal') === 'true'

    const updateToggle = (key: string, checked: boolean) => {
        const params = new URLSearchParams(searchParams.toString())
        if (checked) {
            params.set(key, 'true')
        } else {
            params.delete(key)
        }
        params.set('page', '0')

        startTransition(() => {
            router.push(`${pathname}?${params.toString()}`)
        })
    }

    return (
        <div className={`flex items-center gap-4 ${className} ${isPending ? 'opacity-70' : ''}`}>
            <div className="flex items-center gap-2">
                <Checkbox
                    id="showRejected"
                    checked={showRejected}
                    onCheckedChange={(checked: CheckedState) => updateToggle('showRejected', checked === true)}
                />
                <Label htmlFor="showRejected" className="text-sm cursor-pointer">
                    Show Rejected
                </Label>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox
                    id="showWithdrawal"
                    checked={showWithdrawal}
                    onCheckedChange={(checked: CheckedState) => updateToggle('showWithdrawal', checked === true)}
                />
                <Label htmlFor="showWithdrawal" className="text-sm cursor-pointer">
                    Show Withdrawal
                </Label>
            </div>
        </div>
    )
}
