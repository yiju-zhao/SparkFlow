'use client'

import { useState } from 'react'
import { ExploreHeader, type ExploreHeaderProps } from './header'
import { ResearchAssistantPanel, ResearchAssistantTrigger } from '@/components/explore/research-assistant-panel'

interface ExploreShellProps extends ExploreHeaderProps {
    children: React.ReactNode
}

export function ExploreShell({ children, ...headerProps }: ExploreShellProps) {
    const [assistantOpen, setAssistantOpen] = useState(false)

    return (
        <div className="flex flex-col h-screen">
            {!assistantOpen && <ExploreHeader {...headerProps} />}

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto bg-secondary">
                <main className="px-12 py-10 pb-16">
                    {children}
                </main>
            </div>

            {!assistantOpen && <ResearchAssistantTrigger onClick={() => setAssistantOpen(true)} />}
            <ResearchAssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} />
        </div>
    )
}
