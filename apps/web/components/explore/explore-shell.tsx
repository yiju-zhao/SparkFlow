"use client";

import { useState, useMemo, useEffect, useRef } from "react";
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

// Same-origin reverse proxy at app/api/langgraph/[...path]/route.ts.
// The SDK's `new URL(apiUrl + path)` requires an absolute URL, so we resolve
// against window.location.origin at runtime (the Client is only used in the
// browser). Module-level `new Client(...)` would crash during SSR.
function buildLangGraphClient(): Client {
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
  return new Client({
    apiUrl: `${origin}/api/langgraph`,
    apiKey: null,
  });
}

export interface ExploreShellProps {
  children: React.ReactNode;
  user?: {
    id?: string | null;
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
      href: `/${locale}/explore/social-media`,
      children: [
        { label: t("overview"), href: `/${locale}/explore/social-media` },
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
  // Lazy state initializer runs once per mount; on the client `window` is
  // defined so the Client gets a valid absolute apiUrl. During SSR this
  // returns a placeholder Client that is never actually invoked because the
  // runtime calls only fire from event handlers / effects.
  const [langGraphClient] = useState<Client>(() => buildLangGraphClient());

  // Mirror the deepdive chat-panel's BYOK pattern: hub agent's Ctx
  // dataclass requires (model_provider, model_name, api_key, user_id,
  // session_id) — without these the run dies with
  // `Ctx.__init__() missing 5 required positional arguments`.
  const [modelSettings, setModelSettings] = useState<{
    modelProvider: string;
    modelName: string;
  }>({ modelProvider: "openai", modelName: "gpt-4o-mini" });
  const [resolvedKey, setResolvedKey] = useState<
    { apiKey: string; baseUrl?: string } | null | "pending"
  >("pending");

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (!res.ok) return;
        const data = await res.json();
        const provider = data.modelProvider || "openai";
        const name = data.modelName || "gpt-4o-mini";
        setModelSettings({ modelProvider: provider, modelName: name });
        try {
          const keyRes = await fetch(`/api/settings/resolve-key?provider=${provider}`);
          if (keyRes.ok) {
            setResolvedKey(await keyRes.json());
          } else {
            setResolvedKey(null);
          }
        } catch {
          setResolvedKey(null);
        }
      } catch (error) {
        console.error("Failed to fetch model settings:", error);
        setResolvedKey(null);
      }
    };
    fetchSettings();
  }, []);

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

  // Hub thread_id is mirrored into a ref AND into assistant-ui's own
  // threadListItem.externalId via the `create:` callback below.
  //
  // Why both: assistant-ui's composer state (specifically
  // `s.composer.isEditing` which gates the textarea's onChange handler
  // — see @assistant-ui/react/dist/primitives/composer/ComposerInput.js)
  // depends on the runtime believing this thread has been "initialized"
  // server-side. The signal it uses is whether `create()` was provided
  // and ran successfully. Skipping `create:` makes the composer go
  // read-only after the first turn — typing does nothing, no setText
  // fires, value stays "".
  //
  // Why we ALSO keep a ref: `useLangGraphRuntime` captures the stream
  // closure on first call. A useState value would pin at its initial
  // null and we'd burn a new thread per message (verified earlier:
  // 019dda69... / 019dda6a... / 019dda77... — three threads in one
  // chat). Refs survive that closure capture; subsequent stream calls
  // read the ref's current value.
  const hubThreadIdRef = useRef<string | null>(null);

  const runtime = useLangGraphRuntime({
    create: async () => {
      // Reuse a thread we already minted in this session if any —
      // create() is idempotent from our perspective. Fresh thread the
      // first time, cached afterwards.
      if (hubThreadIdRef.current) {
        return { externalId: hubThreadIdRef.current };
      }
      const thread = await langGraphClient.threads.create();
      hubThreadIdRef.current = thread.thread_id;
      return { externalId: thread.thread_id };
    },
    stream: async (messages, { abortSignal }) => {
      if (!user?.id) {
        throw new Error("Sign in required to use the research assistant.");
      }
      if (resolvedKey === "pending") {
        throw new Error("Loading model settings — try again in a moment.");
      }
      if (!resolvedKey?.apiKey) {
        throw new Error(
          `BYOK API key required for provider "${modelSettings.modelProvider}". Configure it in Settings.`,
        );
      }

      // assistant-ui's flow: it calls create() before stream() on the
      // first message of a fresh thread, so by the time we get here
      // hubThreadIdRef.current is always populated. Belt-and-suspenders
      // fallback in case create() somehow didn't run.
      let threadId = hubThreadIdRef.current;
      if (!threadId) {
        const thread = await langGraphClient.threads.create();
        threadId = thread.thread_id;
        hubThreadIdRef.current = threadId;
      }

      return langGraphClient.runs.stream(threadId, "hub", {
        input: { messages },
        // The hub agent's `Ctx` dataclass (apps/langgraph/agents/hub.py)
        // expects these 5 required fields plus optional notebook_id /
        // page_context. langgraph 0.8.3 deserializes the SDK's `context`
        // field directly into Ctx. Hub doesn't have a chat_session row,
        // so reuse the langgraph thread_id as session_id.
        context: {
          model_provider: modelSettings.modelProvider,
          model_name: modelSettings.modelName,
          api_key: resolvedKey.apiKey,
          api_base: resolvedKey.baseUrl ?? null,
          user_id: user.id,
          session_id: threadId,
          page_context: pageContext,
        },
        streamMode: ["messages-tuple", "updates"],
        signal: abortSignal,
      });
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

        {/* Body row: main content + side-by-side assistant panel.
            min-h-0 lets the children own their own scroll containers. */}
        <div className="flex flex-row flex-1 min-h-0">
          {/* Scrollable content (shrinks when panel opens) */}
          <div
            className="flex-1 overflow-y-auto bg-sf-bg"
            onScroll={(e) => {
              const scrollTop = (e.target as HTMLDivElement).scrollTop;
              setIsScrolled(scrollTop > 20);
            }}
          >
            <main className="mx-auto max-w-[1280px] px-8 pt-24 pb-24">{children}</main>
          </div>

          <ResearchAssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} />
        </div>

        {!assistantOpen && <ResearchAssistantTrigger onClick={() => setAssistantOpen(true)} />}
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
