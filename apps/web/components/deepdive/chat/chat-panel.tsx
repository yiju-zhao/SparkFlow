"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import {
  Send,
  Loader2,
  Sparkles,
  Plus,
  Trash2,
  StickyNote,
  Copy,
  Check,
  BookOpen,
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
  sources?: Source[];
  initialSessions?: ChatSession[];
  initialMessages?: PreloadedMessage[];
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

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL;

// Stable default props to avoid creating new arrays on each render
const EMPTY_SESSIONS: ChatSession[] = [];
const EMPTY_MESSAGES: PreloadedMessage[] = [];
const EMPTY_SOURCES: Source[] = [];

export function ChatPanel({
  notebookId,
  sources = EMPTY_SOURCES,
  initialSessions = EMPTY_SESSIONS,
  initialMessages = EMPTY_MESSAGES,
}: ChatPanelProps) {
  if (!LANGGRAPH_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_LANGGRAPH_API_URL is not configured. Set it to the reachable LangGraph server URL.",
    );
  }

  // Thread management
  const [threadId, setThreadId] = useState<string | null>(
    initialSessions.length > 0
      ? initialSessions[0].langgraphThreadId || null
      : null,
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
  // Track which session was preloaded to avoid refetching (immutable, use ref)
  const preloadedSessionId = useRef<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null,
  ).current;

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
    modelProvider: "google",
    modelName: "gemini-2.5-flash",
  });
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
        }
      } catch (error) {
        console.error("Failed to fetch model settings:", error);
      }
    };
    fetchSettings();
  }, []);

  // LangGraph stream hook - model selection happens per-request via context
  const stream = useStream<AgentState>({
    apiUrl: LANGGRAPH_API_URL,
    assistantId: "agent",
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
    const hasMessages =
      sessionMessages.length > 0 || stream.messages.length > 0;
    const container = messagesContainerRef.current;
    if (hasMessages && container) {
      // Use scrollTop instead of scrollIntoView to prevent affecting parent layouts
      container.scrollTop = container.scrollHeight;
    }
  }, [sessionMessages, stream.messages]);

  // Save messages to database when streaming completes
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = stream.isLoading;

    // Detect transition from loading to not loading (streaming just completed)
    if (wasLoading && !stream.isLoading && !stream.error && streamSessionId) {
      // Combine iterations into single reduce (Vercel best practice: js-combine-iterations)
      const messagesToSave = stream.messages.reduce<
        { sender: string; content: string }[]
      >((acc, m) => {
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
      }, []);

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
  }, [
    stream.isLoading,
    stream.error,
    stream.messages,
    streamSessionId,
    notebookId,
  ]);

  // Load stored messages for the active session
  const hasLoadedPreloaded = useRef(
    preloadedSessionId !== null && initialMessages.length > 0,
  );

  useEffect(() => {
    if (!activeSessionId) {
      setSessionMessages([]);
      return;
    }

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
          firstLine.length > 50
            ? firstLine.slice(0, 50) + "..."
            : firstLine || "Chat Note";
        await createNote(notebookId, { title, content, tags: ["from-chat"] });
      } catch (error) {
        console.error("Failed to save note:", error);
      } finally {
        setSavingNoteId(null);
      }
    },
    [notebookId, savingNoteId],
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
        const slug = `synthesis-${Date.now()}`;
        const title = content
          .slice(0, 60)
          .replace(/[#*\n]/g, "")
          .trim() + "...";
        await fetch(`/api/notebooks/${notebookId}/wiki/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            content,
            pageType: "COMPARISON",
            sourceRefs: [],
          }),
        });
        // Log the save
        fetch(`/api/notebooks/${notebookId}/wiki/log`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entry: `saved | Chat synthesis saved as [[${slug}]]`,
          }),
        }).catch(() => {});
      } catch (error) {
        console.error("Failed to save to wiki:", error);
      } finally {
        setSavingWikiId(null);
      }
    },
    [notebookId, savingWikiId],
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
  const handleDeleteSession = async (
    e: React.MouseEvent,
    sessionId: string,
  ) => {
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

      // Fetch latest wiki index to include in agent context
      let wikiIndex = "";
      try {
        const wikiRes = await fetch(`/api/notebooks/${notebookId}/wiki/index`);
        if (wikiRes.ok) {
          const wikiData = await wikiRes.json();
          wikiIndex = wikiData.content || "";
        }
      } catch {
        // Wiki fetch failed — agent will work without it
      }

      // Submit to LangGraph with wiki context
      stream.submit(
        { messages: [{ type: "human", content: message }] },
        {
          context: {
            notebook_id: notebookId,
            wiki_index: wikiIndex,
            wiki_schema: {},
            model_provider: modelSettings.modelProvider,
            model_name: modelSettings.modelName,
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

  // Get message content as string
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

  const displayMessages =
    streamSessionId &&
      streamSessionId === activeSessionId &&
      stream.messages.length > 0
      ? stream.messages
      : sessionMessages;

  // Memoize message filtering to avoid O(n²) computation on every render
  const { filteredMessages, completedToolCallIds } = useMemo(() => {
    const completedToolCallIds = new Set<string>();
    displayMessages.forEach((message) => {
      if (message.type === "tool") {
        const toolCallId = (message as unknown as { tool_call_id?: string })
          .tool_call_id;
        if (toolCallId) completedToolCallIds.add(toolCallId);
      }
    });

    const filteredMessages = displayMessages.filter((message) => {
      if (message.type === "human") return true;

      if (message.type === "ai") {
        const toolCalls = (
          message as unknown as { tool_calls?: { id: string; name: string }[] }
        ).tool_calls;
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
    <div className="flex h-full min-w-0 flex-col relative overflow-hidden bg-background dark:bg-transparent">
      {/* Header - transparent, content scrolls behind */}
      <div className="px-6 pt-3 pb-3 flex items-center justify-between absolute top-0 left-0 right-0 z-10">
        <div className="flex items-center gap-3 bg-white dark:bg-background rounded-[4px] px-3 py-1.5">
          <div className="h-0.5 w-6 bg-accent-primary dark:bg-accent-red" />
          <h2 className="text-[11px] font-semibold tracking-[3px] text-foreground uppercase font-mono">
            DIALOGUE
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1" />
          <button
            className="h-7 px-3 text-[11px] font-semibold tracking-[3px] uppercase font-mono text-muted-foreground rounded-[4px] bg-white dark:bg-surface-elevated border-2 dark:border border-outline dark:border-[#333333] hover:opacity-80 transition-opacity"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? "CLOSE" : "HISTORY"}
          </button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 rounded-[4px] bg-white dark:bg-surface-elevated hover:opacity-80 transition-opacity"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-10 right-2 z-10 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
          <div className="p-2">
            <h3 className="text-xs font-medium text-muted-foreground mb-2">
              Recent Chats
            </h3>
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
                        {formatDate(session.lastActivity)} ·{" "}
                        {session._count.messages} msgs
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
        className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-4 pt-14 space-y-4"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 500px",
        }}
      >
        {filteredMessages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
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
              <div
                key={messageKey}
                className={`group flex ${isUser ? "justify-end" : "justify-start"} px-2`}
              >
                <div
                  className={`relative rounded-[4px] transition-all duration-200 ${isUser
                    ? "bg-accent-primary text-white px-4 py-3 border-none w-fit max-w-[85%]"
                    : "w-full p-5 bg-white dark:bg-transparent"
                    }`}
                >
                  {isUser ? (
                    <p className="text-[13px] font-normal leading-relaxed whitespace-pre-wrap">
                      {content}
                    </p>
                  ) : hasInProgressToolCalls ? (
                    // Tool call indicator (only for in-progress calls)
                    <div className="flex items-center gap-4">
                      <div className="w-1 self-stretch rounded-[4px] bg-accent-primary shrink-0" />
                      <div className="flex items-center gap-2 text-[10px] font-bold tracking-widest text-muted-foreground/60 uppercase">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>CONSULTING {inProgressToolCalls.map((tc) => tc.name).join(", ")}...</span>
                      </div>
                    </div>
                  ) : (
                    // Final AI response - accent bar + text column
                    <div className="flex flex-col gap-0">
                      <div className="flex gap-4">
                        <div className="w-1 self-stretch rounded-[4px] bg-accent-primary shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="overflow-x-auto">
                            <Markdown className="text-[13px] leading-relaxed text-foreground/90 prose-p:mb-3 last:prose-p:mb-0">
                              {content}
                            </Markdown>
                          </div>
                        </div>
                      </div>
                      {!stream.isLoading && content && (
                        <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-full uppercase"
                            onClick={() =>
                              handleSaveToNotes(messageKey, content)
                            }
                            disabled={savingNoteId === messageKey}
                          >
                            {savingNoteId === messageKey ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <StickyNote className="h-3.5 w-3.5" />
                            )}
                            <span>SAVE TO STUDIO</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-full uppercase"
                            onClick={() =>
                              handleSaveToWiki(messageKey, content)
                            }
                            disabled={savingWikiId === messageKey}
                          >
                            {savingWikiId === messageKey ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <BookOpen className="h-3.5 w-3.5" />
                            )}
                            <span>SAVE TO WIKI</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 gap-1.5 px-3 text-[10px] font-bold tracking-widest text-muted-foreground hover:text-foreground hover:bg-background/50 rounded-full uppercase"
                            onClick={() => handleCopy(messageKey, content)}
                          >
                            {copiedMessageId === messageKey ? (
                              <Check className="h-3.5 w-3.5" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                            <span>
                              {copiedMessageId === messageKey
                                ? "COPIED"
                                : "COPY"}
                            </span>
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {/* Loading indicator */}
        {stream.isLoading ? (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-3 py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          </div>
        ) : null}

        {/* Error display */}
        {stream.error ? (
          <div className="flex justify-start">
            <div className="bg-destructive/10 text-destructive rounded-lg px-3 py-2">
              <p className="text-sm">
                Error:{" "}
                {stream.error instanceof Error
                  ? stream.error.message
                  : String(stream.error)}
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
      <div
        className="flex items-start px-6 py-3 gap-3"
        style={{ minHeight: inputHeight }}
      >
        <form onSubmit={handleSubmit} className="flex flex-1 items-start gap-3">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize to fit content
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question about your sources..."
            className="min-h-10 max-h-30 resize-none flex-1 border-0 shadow-none rounded-none bg-transparent focus-visible:ring-0 overflow-hidden"
            disabled={stream.isLoading}
            rows={1}
          />
          <button
            type="submit"
            disabled={!input.trim() || stream.isLoading}
            className="h-8 w-8 flex items-center justify-center rounded-[4px] bg-accent-primary dark:bg-surface-elevated dark:border dark:border-outline text-white disabled:opacity-50 transition-opacity shrink-0"
          >
            {stream.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
