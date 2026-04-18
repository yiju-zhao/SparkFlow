"use client";

import { useState } from "react";
import { ExploreHeader, type ExploreHeaderProps } from "@/components/explore/header";
import {
  ResearchAssistantPanel,
  ResearchAssistantTrigger,
} from "@/components/explore/research-assistant-panel";

export interface AIContext {
  conferenceId?: string;
  conferenceName?: string;
  sessionId?: string;
  sessionTitle?: string;
}

export interface ExploreShellProps extends ExploreHeaderProps {
  children: React.ReactNode;
  aiContext?: AIContext;
}

export function ExploreShell({ children, ...headerProps }: ExploreShellProps) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <div className="fixed top-0 left-0 right-0 z-100 pointer-events-none transition-all duration-300">
        <ExploreHeader {...headerProps} isScrolled={isScrolled} />
      </div>

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto bg-sf-bg"
        onScroll={(e) => {
          const scrollTop = (e.target as HTMLDivElement).scrollTop;
          setIsScrolled(scrollTop > 20);
        }}
      >
        <main className="mx-auto max-w-[1280px] px-8 pt-24 pb-24">{children}</main>
      </div>

      {!assistantOpen && <ResearchAssistantTrigger onClick={() => setAssistantOpen(true)} />}
      <ResearchAssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} />
    </div>
  );
}
