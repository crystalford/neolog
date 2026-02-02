'use client'

import { chatWithManager, ChatMessage } from '@/app/actions/chat'
import Link from 'next/link'
import { useState } from 'react'
import { MessageSquare, Send, Loader2 } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
    }

    // Optimistically add user message
    const newHistory = [...messages, { ...userMessage, timestamp: new Date() }]
    setMessages(newHistory as Message[]) // Cast to Message for UI
    setInput('')
    setLoading(true)

    // Call Real AI
    const response = await chatWithManager(newHistory.map(m => ({ role: m.role, content: m.content })))

    setLoading(false)

    if (response.success && response.message) {
      const aiMessage: Message = {
        role: 'assistant',
        content: response.message,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, aiMessage])
    } else if (response.error === 'NO_API_KEYS') {
      const errorMessage: Message = {
        role: 'assistant',
        content: "I'd love to help, but I need an API key to think! \n\nPlease go to **Settings** > **API Keys** to add your OpenAI or Anthropic key.",
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    } else {
      // Generic error
      const errorMessage: Message = {
        role: 'assistant',
        content: `Error: ${response.error || 'Something went wrong.'}`,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, errorMessage])
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-[var(--bg-primary)]">
      {messages.length === 0 ? (
        // Empty State - Layout like Gemini
        <div className="flex flex-col items-center justify-center h-full max-w-4xl mx-auto px-6">
          <div className="mb-8 flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] via-[var(--accent-purple)] to-[var(--accent-cyan)]">
            <MessageSquare size={28} className="text-white" />
          </div>
          
          <h1 className="font-display text-5xl font-bold text-[var(--text-primary)] mb-4 text-center tracking-tight">
            What do you want to create?
          </h1>

          <p className="text-lg text-[var(--text-secondary)] mb-16 max-w-2xl text-center leading-relaxed">
            Start a conversation to create blog posts, organize ideas, or turn your thoughts into published content.
          </p>

          {/* Input - Centered */}
          <div className="w-full max-w-3xl mb-6">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Ask Neolog anything..."
                className="w-full input resize-none min-h-[64px] max-h-[200px] text-base pr-16 bg-[var(--bg-card)] border-[var(--border-medium)] focus:border-[var(--accent)]"
                rows={1}
                style={{
                  height: 'auto',
                  minHeight: '64px',
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = Math.min(target.scrollHeight, 200) + 'px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="absolute right-3 bottom-3 btn btn-primary h-10 w-10 flex items-center justify-center flex-shrink-0 rounded-lg disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </div>

          {/* Suggested Prompts - Small chips below input like Gemini */}
          <div className="flex flex-wrap gap-2.5 justify-center max-w-3xl">
            <button
              onClick={() => setInput("I want to write about...")}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Write an article
            </button>

            <button
              onClick={() => setInput("Help me organize my thoughts about...")}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Organize ideas
            </button>

            <button
              onClick={() => setInput("I have a conversation I want to turn into a post...")}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Import a chat
            </button>

            <button
              onClick={() => setInput("Research and write about...")}
              className="px-4 py-2.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] hover:border-[var(--accent)] hover:bg-[var(--bg-tertiary)] transition-all text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] font-medium"
            >
              Deep research
            </button>
          </div>

          <p className="text-xs text-[var(--text-tertiary)] text-center mt-10">
            Neolog can make mistakes. Verify important information.
          </p>
        </div>
      ) : (
        // Chat View - Messages + Fixed input at bottom
        <>
          <div className="flex-1 overflow-y-auto bg-[var(--bg-primary)]">
            <div className="max-w-4xl mx-auto w-full py-8 px-6">
              {messages.map((message, index) => (
                <div key={index} className="mb-10">
                  {message.role === 'assistant' && (
                    <div className="flex items-start gap-4 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] via-[var(--accent-purple)] to-[var(--accent-cyan)] flex items-center justify-center flex-shrink-0 shadow-lg">
                        <MessageSquare size={18} className="text-white" />
                      </div>
                      <div className="flex-1 pt-1">
                        <p className="font-semibold text-sm text-[var(--text-primary)] mb-3">Neolog</p>
                        <div className="prose prose-sm max-w-none text-[var(--text-secondary)]">
                          <p className="whitespace-pre-wrap leading-relaxed m-0">{message.content}</p>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] mt-3">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )}

                  {message.role === 'user' && (
                    <div className="flex items-start gap-4 justify-end">
                      <div className="flex-1 flex justify-end">
                        <div className="max-w-[80%]">
                          <div className="bg-[var(--accent)] text-white rounded-2xl px-5 py-3.5 shadow-lg">
                            <p className="whitespace-pre-wrap leading-relaxed text-sm">{message.content}</p>
                          </div>
                          <p className="text-xs text-[var(--text-tertiary)] mt-2 text-right">
                            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="flex items-start gap-4 mb-8">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent)] via-[var(--accent-purple)] to-[var(--accent-cyan)] flex items-center justify-center shadow-lg">
                    <MessageSquare size={18} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Loader2 size={16} className="animate-spin text-[var(--accent)]" />
                    <span className="text-sm text-[var(--text-tertiary)]">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Fixed at bottom when chatting */}
          <div className="border-t border-[var(--border-medium)] bg-[var(--bg-primary)] p-6">
            <div className="max-w-4xl mx-auto">
              <div className="relative">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Message Neolog..."
                  className="w-full input resize-none min-h-[64px] max-h-[200px] text-base pr-16 bg-[var(--bg-card)] border-[var(--border-medium)] focus:border-[var(--accent)]"
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '64px',
                  }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement
                    target.style.height = 'auto'
                    target.style.height = Math.min(target.scrollHeight, 200) + 'px'
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || loading}
                  className="absolute right-3 bottom-3 btn btn-primary h-10 w-10 flex items-center justify-center flex-shrink-0 rounded-lg disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] text-center mt-4">
                Neolog can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
