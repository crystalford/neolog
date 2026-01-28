'use client'

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

    const userMessage: Message = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    // TODO: Connect to chat API
    setTimeout(() => {
      const aiMessage: Message = {
        role: 'assistant',
        content: "I'm here to help you create content. What would you like to write about? I can help you:\n\n• Research and write articles\n• Import and organize your ideas\n• Create drafts from conversations\n• Turn chats into blog posts",
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
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {messages.length === 0 ? (
        // Empty State - Everything centered like Gemini
        <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto px-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center mb-6">
            <MessageSquare size={32} className="text-white" />
          </div>

          <h1 className="font-display text-4xl font-bold text-[var(--text-primary)] mb-3 text-center">
            What do you want to create?
          </h1>

          <p className="text-lg text-[var(--text-secondary)] mb-12 max-w-xl text-center">
            Start a conversation to create blog posts, organize ideas, or turn your thoughts into published content.
          </p>

          {/* Suggested Prompts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full max-w-2xl mb-8">
            <button
              onClick={() => setInput("I want to write about...")}
              className="group p-5 text-left rounded-2xl border-2 border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:shadow-lg transition-all"
            >
              <div className="text-2xl mb-3">✍️</div>
              <p className="font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                Write an article
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Start from scratch or import ideas
              </p>
            </button>

            <button
              onClick={() => setInput("Help me organize my thoughts about...")}
              className="group p-5 text-left rounded-2xl border-2 border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:shadow-lg transition-all"
            >
              <div className="text-2xl mb-3">🧠</div>
              <p className="font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                Organize ideas
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Turn messy thoughts into structure
              </p>
            </button>

            <button
              onClick={() => setInput("I have a conversation I want to turn into a post...")}
              className="group p-5 text-left rounded-2xl border-2 border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:shadow-lg transition-all"
            >
              <div className="text-2xl mb-3">💬</div>
              <p className="font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                Import a chat
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                Paste ChatGPT, Claude, or Gemini logs
              </p>
            </button>

            <button
              onClick={() => setInput("Research and write about...")}
              className="group p-5 text-left rounded-2xl border-2 border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:shadow-lg transition-all"
            >
              <div className="text-2xl mb-3">🔍</div>
              <p className="font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">
                Deep research
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                AI researches and drafts for you
              </p>
            </button>
          </div>

          {/* Input - Centered with everything else */}
          <div className="w-full max-w-3xl">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Message Neolog..."
                className="flex-1 input resize-none min-h-[56px] max-h-[200px] text-base"
                rows={1}
                style={{
                  height: 'auto',
                  minHeight: '56px',
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
                className="btn btn-primary h-[56px] w-[56px] flex items-center justify-center flex-shrink-0"
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] text-center mt-3">
              Neolog can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      ) : (
        // Chat View - Messages + Fixed input at bottom
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto w-full py-8 px-6">
              {messages.map((message, index) => (
                <div key={index} className="mb-8">
                  {message.role === 'assistant' && (
                    <div className="flex items-start gap-3 mb-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center flex-shrink-0">
                        <MessageSquare size={16} className="text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-[var(--text-primary)] mb-2">Neolog</p>
                        <div className="prose prose-sm max-w-none text-[var(--text-primary)]">
                          <p className="whitespace-pre-wrap leading-relaxed m-0">{message.content}</p>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)] mt-2">
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )}

                  {message.role === 'user' && (
                    <div className="flex items-start gap-3 justify-end">
                      <div className="flex-1 flex justify-end">
                        <div className="max-w-[85%]">
                          <div className="bg-[var(--accent)] text-white rounded-2xl px-5 py-3">
                            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
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
                <div className="flex items-start gap-3 mb-8">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--accent)] to-purple-600 flex items-center justify-center">
                    <MessageSquare size={16} className="text-white" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
                    <span className="text-sm text-[var(--text-tertiary)]">Thinking...</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input Area - Fixed at bottom when chatting */}
          <div className="border-t border-[var(--border-light)] bg-[var(--bg-primary)] p-6">
            <div className="max-w-3xl mx-auto">
              <div className="flex gap-3 items-end">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Message Neolog..."
                  className="flex-1 input resize-none min-h-[56px] max-h-[200px] text-base"
                  rows={1}
                  style={{
                    height: 'auto',
                    minHeight: '56px',
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
                  className="btn btn-primary h-[56px] w-[56px] flex items-center justify-center flex-shrink-0"
                >
                  <Send size={20} />
                </button>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] text-center mt-3">
                Neolog can make mistakes. Verify important information.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
