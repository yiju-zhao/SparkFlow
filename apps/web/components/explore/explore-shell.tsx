"use client";

import { useState, useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Client } from "@langchain/langgraph-sdk";
import { useLangGraphRuntime } from "@assistant-ui/react-langgraph";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { LandingHeader } from "@/components/landing/landing-header";
import {
  ResearchAssistantPanel,
  ResearchAssistantTrigger,
} from "@/components/explore/research-assistant-panel";
import { HubToolUIs } from "./research-assistant-tools";
import { AIContextProvider, useAIContext } from "./ai-context";

const langGraphClient = new Client({
  apiUrl:
    process.env.NEXT_PUBLIC_LANGGRAPH_API_URL ?? "http://localhost:2024",
  apiKey: null,
});

export interface ExploreShellProps {
  children: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: string | null;
  };
}

export interface NavLinkItem {
  label: string;
  href: string;
}

export interface NavLinkGroup {
  label: string;
  href: string;
  children: NavLinkItem[];
}

export type NavLink = NavLinkItem | NavLinkGroup;

export function isNavGroup(link: NavLink): link is NavLinkGroup {
  return "children" in link;
}

const useExploreNavLinks = (): NavLink[] => {
  const t = useTranslations("explore");
  const locale = useLocale();

  return [
    { label: t("overview"), href: `/${locale}/explore` },
    {
      label: t("conferences.title"),
      href: `/${locale}/explore/conferences`,
      children: [
        { label: t("overview"), href: `/${locale}/explore/conferences` },
        { label: t("publications.title"), href: `/${locale}/explore/conferences/publications` },
        { label: t("sessions.title"), href: `/${locale}/explore/conferences/sessions` },
      ],
    },
    {
      label: t("socialMedia.title"),
      href: `/${locale}/explore/social-media/wechat`,
      children: [
        { label: t("socialMedia.wechat.title"), href: `/${locale}/explore/social-media/wechat` },
      ],
    },
    { label: t("toolbox.title"), href: `/${locale}/explore/toolbox` },
  ];
};

function ExploreShellInner({ children, user }: ExploreShellProps) {
  const { context } = useAIContext();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const exploreNavLinks = useExploreNavLinks();

  // Build page context string from AI context
  const pageContext = useMemo(() => {
    if (context?.conferenceName) {
      return `User is viewing conference: ${context.conferenceName}`;
    }
    if (context?.sessionTitle) {
      return `User is viewing session: ${context.sessionTitle}`;
    }
    return "User is on the Research Hub homepage";
  }, [context]);

  const runtime = useLangGraphRuntime({
    stream: async (messages, { abortSignal, initialize }) => {
      const { remoteId } = await initialize();

      return langGraphClient.runs.stream(remoteId, "hub", {
        input: { messages },
        config: {
          configurable: {
            page_context: pageContext,
          },
        },
        streamMode: ["messages-tuple", "updates"],
        signal: abortSignal,
      });
    },
    create: async () => {
      const thread = await langGraphClient.threads.create();
      return { externalId: thread.thread_id };
    },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <HubToolUIs />
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

        {!assistantOpen && <ResearchAssistantTrigger onClick={() => setAssistantOpen(true)} />}
        {assistantOpen && (
          <ResearchAssistantPanel
            open={assistantOpen}
            onOpenChange={setAssistantOpen}
          />
        )}
      </div>
    </AssistantRuntimeProvider>
  );
}

export function ExploreShell(props: ExploreShellProps) {
  return (
    <AIContextProvider>
      <ExploreShellInner {...props} />
    </AIContextProvider>
  );
}
