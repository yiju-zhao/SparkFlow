"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import {
  SendHorizontal,
  Loader2,
  Plus,
  Trash2,
  StickyNote,
  Copy,
  Check,
  BookOpen,
  MessageCircle,
  History,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { ResizableDivider } from "@/components/ui/resizable-divider";
import { createNote } from "@/lib/actions/notes";
import type { Source } from "@prisma/client";

interface PreloadedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  notebookId: string;
  userId: string;
  sources?: Source[];
  initialSessions?: ChatSession[];
  initialMessages?: PreloadedMessage[];
  onWikiNavigate?: (slug: string) => void;
  onNoteAdded?: () => void;
}

interface ChatSession {
  id: string;
  title: string;
  lastActivity: string;
  langgraphThreadId?: string | null;
  _count: { messages: number };
}

// State type for our agent
interface AgentState {
  messages: Message[];
}

// User model settings
interface ModelSettings {
  modelProvider: string;
  modelName: string;
}

// Same-origin reverse proxy at app/api/langgraph/[...path]/route.ts.
// Avoids CORS, mixed-content, and reachability issues for end users.
// Must be an absolute URL because the LangGraph SDK uses `new URL(apiUrl + path)`.
function getLangGraphApiUrl(): string {
  if (typeof window === "undefined") {
    // SSR fallback — useStream only runs on the client, but the const must
    // resolve to *something* during render to avoid passing undefined.
    return "http://localhost/api/langgraph";
  }
  return `${window.location.origin}/api/langgraph`;
}

// Spark-diamond glyph from Sparkflow Design System (brand lockup).
function SparkDiamond({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className}>
      <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" fill="currentColor" />
    </svg>
  );
}

// Stable default props to avoid creating new arrays on each render
const EMPTY_SESSIONS: ChatSession[] = [];
const EMPTY_MESSAGES: PreloadedMessage[] = [];
const EMPTY_SOURCES: Source[] = [];

export function ChatPanel({
  notebookId,
  userId,
  sources = EMPTY_SOURCES,
  initialSessions = EMPTY_SESSIONS,
  initialMessages = EMPTY_MESSAGES,
  onWikiNavigate,
  onNoteAdded,
}: ChatPanelProps) {
  // Thread management
  const [threadId, setThreadId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].langgraphThreadId || null : null,
  );

  // Session management for persistence
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null,
  );
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [showHistory, setShowHistory] = useState(false);
  // Initialize with preloaded messages (converted to Message format)
  const [sessionMessages, setSessionMessages] = useState<Message[]>(
    () =>
      initialMessages.map((m) => ({
        id: m.id,
        type: m.role === "user" ? "human" : "ai",
        content: m.content,
      })) as Message[],
  );
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  // Immutable snapshot of the preloaded session id — use lazy useState so we
  // never read `.current` on a ref during render (react-hooks/refs).
  const [preloadedSessionId] = useState<string | null>(() =>
    initialSessions.length > 0 ? initialSessions[0].id : null,
  );

  // Input state
  const [input, setInput] = useState("");
  const [inputHeight, setInputHeight] = useState(80);
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  const INPUT_MIN_HEIGHT = 60;
  const INPUT_MAX_HEIGHT = 200;
  const INPUT_DEFAULT_HEIGHT = 80;

  const handleInputDrag = useCallback((delta: number) => {
    setInputHeight((prev) => {
      const newHeight = prev - delta;
      return Math.max(INPUT_MIN_HEIGHT, Math.min(INPUT_MAX_HEIGHT, newHeight));
    });
  }, []);

  const handleInputDoubleClick = useCallback(() => {
    setInputHeight(INPUT_DEFAULT_HEIGHT);
  }, []);

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [modelSettings, setModelSettings] = useState<ModelSettings>({
    modelProvider: "openai",
    modelName: "gemini-2.5-flash",
  });
  const [resolvedKey, setResolvedKey] = useState<
    { apiKey: string; baseUrl?: string } | null | "pending"
  >("pending");
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const prevIsLoadingRef = useRef<boolean>(false);

  // Fetch user model settings on mount
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          setModelSettings({
            modelProvider: data.modelProvider || "openai",
            modelName: data.modelName || "gpt-4o-mini",
          });
          // Fetch resolved API key for the active provider
          try {
            const keyRes = await fetch(`/api/settings/resolve-key?provider=${data.modelProvider}`);
            if (keyRes.ok) {
              const keyData = await keyRes.json();
              setResolvedKey(keyData);
            } else {
              setResolvedKey(null);
            }
          } catch {
            setResolvedKey(null);
          }
        }
      } catch (error) {
        console.error("Failed to fetch model settings:", error);
      }
    };
    fetchSettings();
  }, []);

  // LangGraph stream hook - model selection happens per-request via context
  const stream = useStream<AgentState>({
    apiUrl: getLangGraphApiUrl(),
    assistantId: "notebook",
    threadId: threadId ?? undefined,
    onThreadId: (newThreadId) => {
      console.log("Thread created:", newThreadId);
      setThreadId(newThreadId);
      // Save thread ID to database
      if (activeSessionId) {
        fetch(`/api/chat/${activeSessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ langgraphThreadId: newThreadId }),
        }).catch((err) => console.error("Failed to save thread ID:", err));
      }
    },
    onError: (error) => {
      console.error("Stream error:", error);
    },
  });

  // Scroll to bottom when messages change (only if there are messages)
  useEffect(() => {
    const hasMessages = sessionMessages.length > 0 || stream.messages.length > 0;
    const container = messagesContainerRef.current;
    if (hasMessages && container) {
      // Use scrollTop instead of scrollIntoView to prevent affecting parent layouts
      container.scrollTop = container.scrollHeight;
    }
  }, [sessionMessages, stream.messages]);

  // Get message content as string — declared before the useEffects that
  // consume it so we don't trip react-hooks/refs (access-before-declared).
  const getMessageContent = (message: Message): string => {
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item && "text" in item)
            return (item as { text: string }).text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };

  // Save messages to database when streaming completes
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = stream.isLoading;

    // Detect transition from loading to not loading (streaming just completed)
    if (wasLoading && !stream.isLoading && !stream.error && streamSessionId) {
      // Combine iterations into single reduce (Vercel best practice: js-combine-iterations)
      const messagesToSave = stream.messages.reduce<{ sender: string; content: string }[]>(
        (acc, m) => {
          if (m.type === "human" || m.type === "ai") {
            const content = getMessageContent(m);
            if (content.trim().length > 0) {
              acc.push({
                sender: m.type === "human" ? "USER" : "ASSISTANT",
                content,
              });
            }
          }
          return acc;
        },
        [],
      );

      if (messagesToSave.length > 0) {
        fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: streamSessionId,
            notebookId,
            messages: messagesToSave,
          }),
        })
          .then(() => {
            // Update session message count in local state
            setSessions((prev) =>
              prev.map((s) =>
                s.id === streamSessionId
                  ? {
                      ...s,
                      _count: {
                        messages: s._count.messages + messagesToSave.length,
                      },
                    }
                  : s,
              ),
            );
            // Update sessionMessages with the final messages for display
            setSessionMessages(stream.messages);
          })
          .catch((err) => console.error("Failed to save messages:", err));
      }
    }
  }, [stream.isLoading, stream.error, stream.messages, streamSessionId, notebookId]);

  // Load stored messages for the active session. The flag starts null and is
  // initialized on the first effect run so we never read a ref's value during
  // render (react-hooks/refs).
  const hasLoadedPreloaded = useRef<boolean | null>(null);

  // Reset messages when the session is cleared — setState-during-render
  // pattern with a sentinel, so we never call setState inside an effect.
  const [lastActiveSessionId, setLastActiveSessionId] = useState(activeSessionId);
  if (activeSessionId !== lastActiveSessionId) {
    setLastActiveSessionId(activeSessionId);
    if (!activeSessionId) setSessionMessages([]);
  }

  useEffect(() => {
    if (hasLoadedPreloaded.current === null) {
      hasLoadedPreloaded.current = preloadedSessionId !== null && initialMessages.length > 0;
    }
    if (!activeSessionId) return;

    // Skip fetch on initial mount if this is the preloaded session
    if (activeSessionId === preloadedSessionId && hasLoadedPreloaded.current) {
      hasLoadedPreloaded.current = false; // Allow future fetches for this session
      return;
    }

    let isMounted = true;
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/chat/${activeSessionId}`);
        if (!res.ok) {
          throw new Error(`Failed to load messages (${res.status})`);
        }
        const data = (await res.json()) as Array<{
          id: string;
          role: "user" | "assistant";
          content: string;
        }>;

        if (!isMounted) return;
        const formatted = data.map((msg) => ({
          id: msg.id,
          type: msg.role === "user" ? "human" : "ai",
          content: msg.content,
        })) as Message[];
        setSessionMessages(formatted);
      } catch (error) {
        console.error("Failed to load chat history:", error);
        if (isMounted) setSessionMessages([]);
      }
    };

    loadMessages();
    return () => {
      isMounted = false;
    };
    // initialMessages.length is only read once at mount (via hasLoadedPreloaded
    // initialization); re-running the effect when it changes would defeat the
    // very skip-refetch logic we're guarding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, preloadedSessionId]);

  // Save AI response to Notes panel
  const handleSaveToNotes = useCallback(
    async (messageId: string, content: string) => {
      if (savingNoteId) return;
      setSavingNoteId(messageId);
      try {
        const firstLine = content
          .split("\n")[0]
          .replace(/^#+\s*/, "")
          .trim();
        const title =
          firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine || "Chat Note";
        await createNote(notebookId, { title, content, tags: ["from-chat"] });
        onNoteAdded?.();
      } catch (error) {
        console.error("Failed to save note:", error);
      } finally {
        setSavingNoteId(null);
      }
    },
    [notebookId, savingNoteId, onNoteAdded],
  );

  // Copy message content to clipboard
  const handleCopy = useCallback(async (messageId: string, content: string) => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(content);
      } else {
        // Fallback for environments where clipboard API is not available
        const textArea = document.createElement("textarea");
        textArea.value = content;
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
          document.execCommand("copy");
        } catch (err) {
          console.error("Fallback: Oops, unable to copy", err);
          return; // Don't show success state if failed
        }
        document.body.removeChild(textArea);
      }
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  }, []);

  // Save AI message content as a wiki page
  const [savingWikiId, setSavingWikiId] = useState<string | null>(null);
  const handleSaveToWiki = useCallback(
    async (messageId: string, content: string) => {
      if (savingWikiId) return;
      setSavingWikiId(messageId);
      try {
        const slug = `article-${Date.now()}`;
        const firstLine = content.split("\n").find((l) => l.trim().length > 0) || "";
        const title =
          firstLine
            .replace(/^#+\s*/, "")
            .replace(/[*_~`]/g, "")
            .slice(0, 80)
            .trim() || "Chat Synthesis";

        const sourceIds = sources.filter((s) => s.status === "READY").map((s) => s.id);

        await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            pageType: "ARTICLE",
            sourceRefs: sourceIds,
          }),
        });

        fetch(`/api/notebooks/${notebookId}/wiki/integrate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug }),
        }).catch(() => {});

        fetch(`/api/notebooks/${notebookId}/wiki/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: `saved | Chat article saved as [[${slug}]] — "${title}"`,
          }),
        }).catch(() => {});
      } catch (error) {
        console.error("Failed to save to wiki:", error);
      } finally {
        setSavingWikiId(null);
      }
    },
    [notebookId, savingWikiId, sources],
  );

  // Create new session in database
  const createSession = useCallback(
    async (title?: string) => {
      const res = await fetch(`/api/notebooks/${notebookId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!res.ok) throw new Error("Failed to create chat session");
      const created = await res.json();
      const sessionWithCount = {
        ...created,
        _count: { messages: 0 },
      };
      setSessions((prev) => [sessionWithCount, ...prev]);
      setActiveSessionId(created.id);
      setThreadId(null);
      return sessionWithCount;
    },
    [notebookId],
  );

  // Start new chat
  const handleNewChat = useCallback(() => {
    setActiveSessionId(null);
    setThreadId(null);
    setShowHistory(false);
    setStreamSessionId(null);
  }, []);

  // Load existing session
  const loadSession = useCallback((session: ChatSession) => {
    setActiveSessionId(session.id);
    setThreadId(session.langgraphThreadId || null);
    setShowHistory(false);
    setStreamSessionId(null);
  }, []);

  // Delete session
  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this chat history?")) return;
    try {
      const res = await fetch(`/api/chat/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) handleNewChat();
      }
    } catch (error) {
      console.error("Failed to delete session:", error);
    }
  };

  // Submit message - follows docs pattern exactly
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || stream.isLoading) return;

    const message = input.trim();
    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      // Create session if needed
      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const created = await createSession(message);
        targetSessionId = created.id;
      }
      setStreamSessionId(targetSessionId ?? null);

      stream.submit(
        { messages: [{ type: "human", content: message }] },
        {
          context: {
            model_provider: modelSettings.modelProvider,
            model_name: modelSettings.modelName,
            user_id: userId,
            session_id: targetSessionId!,
            notebook_id: notebookId,
            api_key: (resolvedKey !== "pending" && resolvedKey?.apiKey) || null,
          },
        },
      );
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as React.FormEvent);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  };


  const displayMessages =
    streamSessionId && streamSessionId === activeSessionId && stream.messages.length > 0
      ? stream.messages
      : sessionMessages;

  // Memoize message filtering to avoid O(n²) computation on every render
  const { filteredMessages, completedToolCallIds } = useMemo(() => {
    const completedToolCallIds = new Set<string>();
    displayMessages.forEach((message) => {
      if (message.type === "tool") {
        const toolCallId = (message as unknown as { tool_call_id?: string }).tool_call_id;
        if (toolCallId) completedToolCallIds.add(toolCallId);
      }
    });

    const filteredMessages = displayMessages.filter((message) => {
      if (message.type === "human") return true;

      if (message.type === "ai") {
        const toolCalls = (message as unknown as { tool_calls?: { id: string; name: string }[] })
          .tool_calls;
        const content = getMessageContent(message);
        const hasInProgressToolCalls =
          toolCalls?.some((tc) => !completedToolCallIds.has(tc.id)) ?? false;
        return hasInProgressToolCalls || content.trim().length > 0;
      }

      return false;
    });

    return { filteredMessages, completedToolCallIds };
  }, [displayMessages]);

  return (
    <div className="flex h-full min-w-0 flex-col relative overflow-hidden bg-sf-surface">
      {/* Header — Sparkflow Design System split-workspace archetype */}
      <div className="h-12 shrink-0 flex items-center justify-between px-6 border-b border-sf-line bg-sf-surface">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-sf-accent" strokeWidth={1.75} />
          <h2 className="font-semibold text-sf-ink">Notebook Chat</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            data-guide="chat-history-button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-[6px] hover:bg-sf-bg-alt"
            onClick={() => setShowHistory(!showHistory)}
            title={showHistory ? "Close history" : "Chat history"}
            aria-label="Chat history"
          >
            <History className="h-4 w-4" strokeWidth={1.75} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 rounded-[6px] hover:bg-sf-bg-alt"
            onClick={handleNewChat}
            title="New Chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" strokeWidth={1.75} />
          </Button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-14 right-2 z-10 w-64 max-h-80 overflow-y-auto rounded-lg border border-sf-line bg-sf-surface shadow-lg">
          <div className="p-2">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">Recent Chats</h3>
            {sessions.length === 0 ? (
              <p className="text-xs text-muted-foreground">No chat history</p>
            ) : (
              <div className="space-y-1">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className={`group flex items-center justify-between rounded-md px-2 py-1.5 cursor-pointer hover:bg-muted ${activeSessionId === session.id ? "bg-muted" : ""}`}
                    onClick={() => loadSession(session)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.lastActivity)} · {session._count.messages} msgs
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages - using stream.messages directly */}
      <div
        ref={messagesContainerRef}
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-6 space-y-8"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 500px",
        }}
      >
        {filteredMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-sf-ink-4">
              <SparkDiamond className="mx-auto h-8 w-8 mb-2 text-sf-accent/50" />
              <p className="text-sm">Start a conversation</p>
            </div>
          </div>
        )}

        {filteredMessages.length > 0 &&
          filteredMessages.map((message, idx) => {
            const messageKey = message.id ?? `msg-${idx}`;
            const isUser = message.type === "human";
            const content = getMessageContent(message);
            const toolCalls = (
              message as unknown as {
                tool_calls?: { id: string; name: string }[];
              }
            ).tool_calls;

            // Only show tool call indicator for in-progress tool calls
            const inProgressToolCalls =
              toolCalls?.filter((tc) => !completedToolCallIds.has(tc.id)) ?? [];
            const hasInProgressToolCalls = inProgressToolCalls.length > 0;

            return (
              <div key={messageKey} className="group">
                {isUser ? (
                  /* USER message — blue bubble, right-aligned, avatar on right */
                  <div className="flex flex-row-reverse gap-4 max-w-2xl ml-auto">
                    <div className="w-8 h-8 rounded-full bg-sf-accent flex-shrink-0 flex items-center justify-center border border-white/20">
                      <User className="h-4 w-4 text-white" strokeWidth={2} />
                    </div>
                    <div className="space-y-1 flex flex-col items-end">
                      <p className="text-[10px] font-bold text-sf-accent uppercase tracking-[0.18em] mr-1">
                        You
                      </p>
                      <div className="bg-sf-accent text-white p-4 rounded-2xl rounded-tr-none shadow-sm">
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{content}</p>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* AI message — slate bubble, left-aligned, avatar on left */
                  <div className="flex gap-4 max-w-3xl relative">
                    <div className="w-8 h-8 rounded-full bg-sf-accent-soft border border-sf-accent/30 flex-shrink-0 flex items-center justify-center text-sf-accent">
                      <SparkDiamond className="h-4 w-4" />
                    </div>
                    <div className="space-y-2 flex-1 min-w-0">
                      <p className="text-[10px] font-bold text-sf-accent uppercase tracking-[0.18em] ml-1">
                        DeepDive
                      </p>
                      <div className="bg-sf-bg-alt border border-sf-line p-4 rounded-2xl rounded-tl-none">
                        {hasInProgressToolCalls ? (
                          <div className="flex items-center gap-2 text-xs font-bold tracking-[0.14em] text-sf-ink-4 uppercase">
                            <Loader2 className="h-3 w-3 animate-spin text-sf-accent" />
                            <span>
                              Consulting {inProgressToolCalls.map((tc) => tc.name).join(", ")}…
                            </span>
                          </div>
                        ) : (
                          <div className="min-w-0 flex-1">
                          <div
                            className="overflow-x-auto"
                            onClick={(e) => {
                              const target = e.target as HTMLElement;
                              const wikiEl =
                                target.tagName === "WIKI-LINK"
                                  ? target
                                  : target.closest("wiki-link");
                              if (wikiEl) {
                                const slug = wikiEl.getAttribute("data-slug");
                                if (slug && onWikiNavigate) {
                                  e.preventDefault();
                                  onWikiNavigate(slug);
                                }
                              }
                            }}
                          >
                            <Markdown className="text-[15px] leading-relaxed text-sf-ink-2 prose-p:mb-3 last:prose-p:mb-0">
                              {content.replace(
                                /\[\[([a-zA-Z0-9_-]+)\]\]/g,
                                (_, slug) =>
                                  `<wiki-link data-slug="${slug}">${slug.replace(/-/g, " ")}</wiki-link>`,
                              )}
                            </Markdown>
                            <style>{`
                              wiki-link {
                                color: #0F5FFE;
                                cursor: pointer;
                                text-decoration: underline;
                                text-decoration-style: dotted;
                                text-underline-offset: 2px;
                                font-weight: 500;
                              }
                              wiki-link:hover {
                                text-decoration-style: solid;
                              }
                            `}</style>
                          </div>
                          </div>
                        )}
                      </div>
                      {!stream.isLoading && content && (
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sf-surface border border-sf-line-strong text-sf-ink-3 text-[11px] font-semibold hover:bg-sf-bg-alt hover:text-sf-ink-2 transition-colors rounded-[6px] shadow-sm"
                            onClick={() => handleSaveToNotes(messageKey, content)}
                            disabled={savingNoteId === messageKey}
                          >
                            {savingNoteId === messageKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <StickyNote className="h-3.5 w-3.5" />
                            )}
                            Add to Note
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sf-surface border border-sf-line-strong text-sf-ink-3 text-[11px] font-semibold hover:bg-sf-bg-alt hover:text-sf-ink-2 transition-colors rounded-[6px] shadow-sm"
                            onClick={() => handleSaveToWiki(messageKey, content)}
                            disabled={savingWikiId === messageKey}
                          >
                            {savingWikiId === messageKey ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <BookOpen className="h-3.5 w-3.5" />
                            )}
                            Add to Wiki
                          </button>
                          <button
                            type="button"
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-sf-surface border border-sf-line-strong text-sf-ink-3 text-[11px] font-semibold hover:bg-sf-bg-alt hover:text-sf-ink-2 transition-colors rounded-[6px] shadow-sm"
                            onClick={() => handleCopy(messageKey, content)}
                          >
                            {copiedMessageId === messageKey ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            {copiedMessageId === messageKey ? "Copied" : "Copy"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        {/* Loading indicator */}
        {stream.isLoading ? (
          <div className="flex justify-start">
            <div className="rounded-[10px] bg-sf-bg-alt px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-sf-accent" />
            </div>
          </div>
        ) : null}

        {/* Error display */}
        {stream.error ? (
          <div className="flex justify-start">
            <div className="rounded-[10px] bg-sf-danger-soft text-sf-danger px-3 py-2 border border-sf-danger/20">
              <p className="text-sm">
                Error: {stream.error instanceof Error ? stream.error.message : String(stream.error)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <ResizableDivider
        direction="horizontal"
        onDrag={handleInputDrag}
        onDoubleClick={handleInputDoubleClick}
      />

      {/* Input */}
      {resolvedKey === null && !stream.isLoading && (
        <div className="mx-4 mb-2 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 px-3 py-2">
          <p className="text-xs text-amber-800 dark:text-amber-200">
            Set your API key in{" "}
            <Link href="/settings" className="underline">
              Settings
            </Link>{" "}
            to use the chat.
          </p>
        </div>
      )}
      {/* Input — white card with circular blue send (Sparkflow DS card + primary contract) */}
      <div data-guide="chat-input" className="px-6 py-4 bg-sf-surface flex">
        <form
          onSubmit={handleSubmit}
          className="relative w-full flex rounded-[10px] border border-sf-line bg-sf-surface focus-within:border-sf-accent focus-within:ring-2 focus-within:ring-sf-accent-soft transition-colors"
        >
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              const target = Math.max(inputHeight - 32, 52);
              el.style.height = "auto";
              el.style.height = `${Math.max(el.scrollHeight, target)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your sources..."
            style={{ height: Math.max(inputHeight - 32, 52) }}
            className="w-full flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:border-0 py-3.5 pl-4 pr-14 text-[15px] resize-none rounded-[10px] text-sf-ink placeholder:text-sf-ink-4 shadow-none"
            disabled={stream.isLoading}
            rows={1}
          />
          <button
            type="submit"
            data-guide="chat-send-button"
            disabled={!input.trim() || stream.isLoading}
            className="absolute right-2 bottom-2 h-9 w-9 flex items-center justify-center rounded-full bg-sf-accent text-white hover:bg-sf-accent-ink disabled:bg-sf-line-strong disabled:text-white/70 transition-colors"
            title="Send"
            aria-label="Send message"
          >
            {stream.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SendHorizontal className="h-4 w-4" strokeWidth={2.25} />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
