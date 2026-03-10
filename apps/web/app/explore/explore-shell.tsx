"use client";

import { useState } from "react";
import { LandingHeader } from "@/components/landing/landing-header";
import {
  ResearchAssistantPanel,
  ResearchAssistantTrigger,
} from "@/components/explore/research-assistant-panel";
import type { AIContext } from "./ai-context";

export interface ExploreShellProps {
  children: React.ReactNode;
  aiContext?: AIContext;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

const exploreNavLinks = [
  { label: "Conferences", href: "/explore/conferences" },
  { label: "Publications", href: "/explore/publications" },
  { label: "Sessions", href: "/explore/sessions" },
  { label: "Toolbox", href: "/explore/toolbox" },
];

export function ExploreShell({ children, aiContext, user }: ExploreShellProps) {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  return (
    <div className="flex flex-col h-screen">
      <LandingHeader
        user={user ?? null}
        navLinks={exploreNavLinks}
        isScrolled={isScrolled}
        onScrollContainer
        variant="explore"
      />

      {/* Scrollable content */}
      <div
        className="flex-1 overflow-y-auto bg-secondary"
        onScroll={(e) => {
          const scrollTop = (e.target as HTMLDivElement).scrollTop;
          setIsScrolled(scrollTop > 20);
        }}
      >
        <main className="px-12 pt-24 pb-16">{children}</main>
      </div>

      {!assistantOpen && (
        <ResearchAssistantTrigger onClick={() => setAssistantOpen(true)} />
      )}
      <ResearchAssistantPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        contextData={aiContext}
      />
    </div>
  );
}
