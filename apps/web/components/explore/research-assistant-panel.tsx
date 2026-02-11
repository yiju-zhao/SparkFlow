'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { X, Send, Sparkles } from 'lucide-react'

interface Message {
    id: string
    role: 'user' | 'assistant'
    content: string
}

interface ResearchAssistantPanelProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

const SUGGESTIONS = [
    'What are the trending topics?',
    'Which orgs published the most?',
    'Summarize the key findings',
]

export function ResearchAssistantTrigger({ onClick }: { onClick: () => void }) {
    return (
        <motion.button
            onClick={onClick}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-[#00D084] px-5 py-3 text-sm font-medium text-white shadow-lg hover:shadow-xl transition-shadow"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
        >
            <Sparkles className="h-4 w-4" />
            Research Assistant
        </motion.button>
    )
}

export function ResearchAssistantPanel({ open, onOpenChange }: ResearchAssistantPanelProps) {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [isTyping, setIsTyping] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages, isTyping])

    useEffect(() => {
        if (open) inputRef.current?.focus()
    }, [open])

    const handleSend = (text?: string) => {
        const content = text || input.trim()
        if (!content) return

        const userMsg: Message = { id: Date.now().toString(), role: 'user', content }
        setMessages(prev => [...prev, userMsg])
        setInput('')
        setIsTyping(true)

        // Simulated assistant response (frontend only)
        setTimeout(() => {
            const assistantMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: `I'd be happy to help with that! This feature is coming soon — once connected, I'll be able to analyze publications, sessions, and trends across the research hub to answer your questions in depth.`
            }
            setMessages(prev => [...prev, assistantMsg])
            setIsTyping(false)
        }, 1200)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        className="fixed inset-0 z-50 bg-black/20 backdrop-blur-sm"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => onOpenChange(false)}
                    />

                    {/* Panel */}
                    <motion.div
                        className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md flex flex-col bg-background border-l border-border shadow-2xl"
                        initial={{ x: '100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '100%' }}
                        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                    >
                        {/* Header */}
                        <div className="shrink-0 flex items-center justify-between px-5 h-14 border-b border-border">
                            <div className="flex items-center gap-2.5">
                                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#00D084]">
                                    <Sparkles className="h-3.5 w-3.5 text-white" />
                                </div>
                                <span className="text-sm font-medium">Research Assistant</span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onOpenChange(false)}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#00D084]/10">
                                        <Sparkles className="h-6 w-6 text-[#00D084]" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium">Ask anything about the research hub</p>
                                        <p className="text-xs text-muted-foreground mt-1">
                                            Explore trends, compare papers, find key insights
                                        </p>
                                    </div>
                                    <div className="flex flex-col gap-2 w-full max-w-[280px]">
                                        {SUGGESTIONS.map((s) => (
                                            <button
                                                key={s}
                                                onClick={() => handleSend(s)}
                                                className="text-left text-sm px-3 py-2 rounded-lg border border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                                            msg.role === 'user'
                                                ? 'bg-foreground text-background rounded-br-md'
                                                : 'bg-muted rounded-bl-md'
                                        }`}
                                    >
                                        {msg.content}
                                    </div>
                                </div>
                            ))}

                            {isTyping && (
                                <div className="flex justify-start">
                                    <div className="bg-muted rounded-2xl rounded-bl-md px-4 py-3 flex gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:0ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:150ms]" />
                                        <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce [animation-delay:300ms]" />
                                    </div>
                                </div>
                            )}

                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="shrink-0 border-t border-border p-4">
                            <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:border-[#00D084]/50 transition-colors">
                                <textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask a question..."
                                    rows={1}
                                    className="flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground/60 max-h-32"
                                />
                                <Button
                                    size="icon"
                                    className="h-7 w-7 shrink-0 rounded-lg bg-[#00D084] hover:bg-[#00B872] text-white"
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || isTyping}
                                >
                                    <Send className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
