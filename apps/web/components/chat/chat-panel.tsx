"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import type { Message } from "@langchain/langgraph-sdk";
import { Send, Loader2, Sparkles, Plus, History, X, Trash2, StickyNote, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { createNote } from "@/lib/actions/notes";
import { useCitationSafe, ChunkInfo } from "@/lib/context/citation-context";

interface PreloadedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface ChatPanelProps {
  notebookId: string;
  datasetId?: string | null;
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

const LANGGRAPH_API_URL = process.env.NEXT_PUBLIC_LANGGRAPH_API_URL || "http://localhost:2024";

export function ChatPanel({ notebookId, datasetId, initialSessions = [], initialMessages = [] }: ChatPanelProps) {
  // Thread management
  const [threadId, setThreadId] = useState<string | null>(
    initialSessions.length > 0 ? (initialSessions[0].langgraphThreadId || null) : null
  );

  // Session management for persistence
  const [activeSessionId, setActiveSessionId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null
  );
  const [sessions, setSessions] = useState<ChatSession[]>(initialSessions);
  const [showHistory, setShowHistory] = useState(false);
  // Initialize with preloaded messages (converted to Message format)
  const [sessionMessages, setSessionMessages] = useState<Message[]>(() =>
    initialMessages.map((m) => ({
      id: m.id,
      type: m.role === "user" ? "human" : "ai",
      content: m.content,
    })) as Message[]
  );
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  // Track which session was preloaded to avoid refetching
  const [preloadedSessionId] = useState<string | null>(
    initialSessions.length > 0 ? initialSessions[0].id : null
  );

  // Input state
  const [input, setInput] = useState("");
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevIsLoadingRef = useRef<boolean>(false);

  // Citation context for chunk references
  const citationContext = useCitationSafe();

  // Parse tool results to extract chunk info
  // Format: [Document Name] #chunk_id
  const parseChunksFromToolResult = useCallback((content: string): ChunkInfo[] => {
    const chunks: ChunkInfo[] = [];
    // Match pattern: [Document Name] #chunk_id
    const regex = /\[([^\]]+)\]\s*#([a-zA-Z0-9_-]+)/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      chunks.push({
        chunkId: match[2],
        docName: match[1],
        docId: "", // Will be resolved later via API
      });
    }
    return chunks;
  }, []);

  // LangGraph stream hook - follows docs pattern
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

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages, stream.messages]);

  // Parse tool results and register chunks for citation linking
  useEffect(() => {
    if (!citationContext) return;

    // Find tool messages (search results) and extract chunks
    const toolMessages = stream.messages.filter((m) => m.type === "tool");
    const allChunks: ChunkInfo[] = [];

    for (const msg of toolMessages) {
      const content = typeof msg.content === "string" ? msg.content : "";
      const chunks = parseChunksFromToolResult(content);
      allChunks.push(...chunks);
    }

    if (allChunks.length > 0) {
      citationContext.registerChunks(allChunks);
    }
  }, [stream.messages, citationContext, parseChunksFromToolResult]);

  // Save messages to database when streaming completes
  useEffect(() => {
    const wasLoading = prevIsLoadingRef.current;
    prevIsLoadingRef.current = stream.isLoading;

    // Detect transition from loading to not loading (streaming just completed)
    if (wasLoading && !stream.isLoading && !stream.error && streamSessionId) {
      const messagesToSave = stream.messages
        .filter((m) => m.type === "human" || m.type === "ai")
        .map((m) => ({
          sender: m.type === "human" ? "USER" : "ASSISTANT",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }))
        .filter((m) => m.content.trim().length > 0);

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
                  ? { ...s, _count: { messages: s._count.messages + messagesToSave.length } }
                  : s
              )
            );
            // Update sessionMessages with the final messages for display
            setSessionMessages(stream.messages);
          })
          .catch((err) => console.error("Failed to save messages:", err));
      }
    }
  }, [stream.isLoading, stream.error, stream.messages, streamSessionId, notebookId]);

  // Load stored messages for the active session
  const hasLoadedPreloaded = useRef(preloadedSessionId !== null && initialMessages.length > 0);

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
        const firstLine = content.split("\n")[0].replace(/^#+\s*/, "").trim();
        const title = firstLine.length > 50 ? firstLine.slice(0, 50) + "..." : firstLine || "Chat Note";
        await createNote(notebookId, { title, content, tags: ["from-chat"] });
      } catch (error) {
        console.error("Failed to save note:", error);
      } finally {
        setSavingNoteId(null);
      }
    },
    [notebookId, savingNoteId]
  );

  // Copy message content to clipboard
  const handleCopy = useCallback(
    async (messageId: string, content: string) => {
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
            document.execCommand('copy');
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
    },
    []
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
    [notebookId]
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

    try {
      // Create session if needed
      let targetSessionId = activeSessionId;
      if (!targetSessionId) {
        const created = await createSession(message);
        targetSessionId = created.id;
      }
      setStreamSessionId(targetSessionId ?? null);

      // Submit to LangGraph with config for dataset
      stream.submit(
        { messages: [{ type: "human", content: message }] },
        {
          config: {
            configurable: {
              dataset_ids: datasetId ? [datasetId] : [],
              notebook_id: notebookId,
            },
          },
        }
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
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  // Get message content as string
  const getMessageContent = (message: Message): string => {
    if (typeof message.content === "string") return message.content;
    if (Array.isArray(message.content)) {
      return message.content
        .map((item) => {
          if (typeof item === "string") return item;
          if (typeof item === "object" && item && "text" in item) return (item as { text: string }).text;
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }
    return "";
  };

  const displayMessages =
    streamSessionId && streamSessionId === activeSessionId && stream.messages.length > 0
      ? stream.messages
      : sessionMessages;

  return (
    <div className="flex h-full min-w-0 flex-col relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-sm font-medium">Chat</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" className="h-7 w-7" onClick={handleNewChat} title="New Chat">
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7" onClick={() => setShowHistory(!showHistory)} title="Chat History">
            {showHistory ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* History Panel */}
      {showHistory && (
        <div className="absolute top-10 right-2 z-10 w-64 max-h-80 overflow-y-auto rounded-lg border border-border bg-background shadow-lg">
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
                    <Button variant="ghost" size="sm" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={(e) => handleDeleteSession(e, session.id)}>
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
      <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
        {displayMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center text-muted-foreground">
              <Sparkles className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">Start a conversation</p>
            </div>
          </div>
        ) : (
          // Filter to show human messages, in-progress tool calls, and final AI responses
          (() => {
            // Collect all tool_call_ids that have received responses
            const completedToolCallIds = new Set<string>();
            displayMessages.forEach((message) => {
              if (message.type === "tool") {
                const toolCallId = (message as unknown as { tool_call_id?: string }).tool_call_id;
                if (toolCallId) completedToolCallIds.add(toolCallId);
              }
            });

            // Get messages to display: human messages + AI messages (with or without tool_calls)
            const filteredMessages = displayMessages.filter((message) => {
              // Always show human messages
              if (message.type === "human") return true;

              // For AI messages, show if they have content OR in-progress tool_calls
              if (message.type === "ai") {
                const toolCalls = (message as unknown as { tool_calls?: { id: string; name: string }[] }).tool_calls;
                const content = getMessageContent(message);

                // Check if this message has tool calls that are still in progress
                const hasInProgressToolCalls = toolCalls?.some(tc => !completedToolCallIds.has(tc.id)) ?? false;

                // Show AI message if it has in-progress tool calls or has content
                return hasInProgressToolCalls || content.trim().length > 0;
              }

              // Hide tool response messages and other types
              return false;
            });

            return filteredMessages.map((message, idx) => {
              const messageKey = message.id ?? `msg-${idx}`;
              const isUser = message.type === "human";
              const content = getMessageContent(message);
              const toolCalls = (message as unknown as { tool_calls?: { id: string; name: string }[] }).tool_calls;

              // Only show tool call indicator for in-progress tool calls
              const inProgressToolCalls = toolCalls?.filter(tc => !completedToolCallIds.has(tc.id)) ?? [];
              const hasInProgressToolCalls = inProgressToolCalls.length > 0;

              return (
                <div key={messageKey} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 ${isUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                    {isUser ? (
                      <p className="text-sm whitespace-pre-wrap">{content}</p>
                    ) : hasInProgressToolCalls ? (
                      // Tool call indicator (only for in-progress calls)
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Using {inProgressToolCalls.map(tc => tc.name).join(", ")}...</span>
                      </div>
                    ) : (
                      // Final AI response
                      <>
                        <Markdown className="text-sm">{content}</Markdown>
                        {!stream.isLoading && content && (
                          <div className="mt-2 flex justify-end border-t border-border/50 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleSaveToNotes(messageKey, content)}
                              disabled={savingNoteId === messageKey}
                              title="Save to Notes"
                            >
                              {savingNoteId === messageKey ? <Loader2 className="h-3 w-3 animate-spin" /> : <StickyNote className="h-3 w-3" />}
                              <span>Save to Notes</span>
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleCopy(messageKey, content)}
                              title="Copy Markdown"
                            >
                              {copiedMessageId === messageKey ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                              <span>{copiedMessageId === messageKey ? "Copied" : "Copy"}</span>
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            });
          })()
        )}

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
              <p className="text-sm">Error: {stream.error instanceof Error ? stream.error.message : String(stream.error)}</p>
            </div>
          </div>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a question..."
            className="min-h-[40px] max-h-[120px] resize-none"
            disabled={stream.isLoading}
          />
          <Button type="submit" size="icon" disabled={!input.trim() || stream.isLoading}>
            {stream.isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
