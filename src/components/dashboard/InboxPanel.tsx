'use client'

import { useState } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'

interface Message {
    role: 'user' | 'assistant'
    content: string
    timestamp: Date
}

export function InboxPanel() {
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)

    const handleSend = async () => {
        if (!input.trim()) return

        const userMessage: Message = {
            role: 'user',
            content: input,
            timestamp: new Date(),
        }

        setMessages((prev) => [...prev, userMessage])
        setInput('')
        setLoading(true)

        // TODO: Connect to chat API
        // For now, just simulate a response
        setTimeout(() => {
            const aiMessage: Message = {
                role: 'assistant',
                content: "I'm here to help you create content. What would you like to write about?",
                timestamp: new Date(),
            }
            setMessages((prev) => [...prev, aiMessage])
            setLoading(false)
        }, 1000)
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <div className="flex flex-col h-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-2xl overflow-hidden">
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--border-light)]">
                <div className="flex items-center gap-3">
                    <MessageSquare size={20} className="text-[var(--accent)]" />
                    <h2 className="font-display text-lg font-semibold text-[var(--text-primary)]">Inbox</h2>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    What do you want to create?
                </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
                {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center">
                        <MessageSquare size={48} className="text-[var(--text-tertiary)] mb-4" />
                        <h3 className="font-semibold text-[var(--text-secondary)] mb-2">
                            Start a conversation
                        </h3>
                        <p className="text-sm text-[var(--text-tertiary)] max-w-sm">
                            Type your ideas, paste chat logs, or describe what you want to write
                        </p>
                    </div>
                ) : (
                    messages.map((message, index) => (
                        <div
                            key={index}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[80%] rounded-xl px-4 py-3 ${message.role === 'user'
                                        ? 'bg-[var(--accent)] text-white'
                                        : 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                                    }`}
                            >
                                <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                <p className="text-xs opacity-60 mt-1">
                                    {message.timestamp.toLocaleTimeString([], {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                {loading && (
                    <div className="flex justify-start">
                        <div className="bg-[var(--bg-tertiary)] rounded-xl px-4 py-3">
                            <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-4 border-t border-[var(--border-light)]">
                <div className="flex gap-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder="Type your message... (Shift+Enter for new line)"
                        className="flex-1 input resize-none min-h-[44px] max-h-[120px]"
                        rows={1}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="btn btn-primary btn-icon"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>
        </div>
    )
}
