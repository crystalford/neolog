'use client'

import { useEffect, useState } from 'react'
import { MessageSquare, Send, Loader2, Plus, Menu, X } from 'lucide-react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ChatThread {
  id: string
  title: string
  lastMessage: Date
}

export default function DashboardPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => {
    // TODO: Load chat threads from database
  }, [])

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

  const startNewChat = () => {
    setMessages([])
  }

  return (
    <div className="flex h-screen bg-[var(--bg-secondary)]">
      {/* Sidebar */}
      <aside
        className={`${sidebarOpen ? 'w-64' : 'w-0'
          } transition-all duration-300 bg-[var(--bg-primary)] border-r border-[var(--border-light)] flex flex-col overflow-hidden`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b border-[var(--border-light)]">
          <button
            onClick={startNewChat}
            className="w-full btn btn-primary flex items-center justify-center gap-2"
          >
            <Plus size={16} />
            New Chat
          </button>
        </div>

        {/* Chat History */}
        <div className="flex-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-[var(--text-tertiary)]">
                No previous chats
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {threads.map((thread) => (
                <button
                  key={thread.id}
                  className="w-full text-left p-3 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <p className="text-sm text-[var(--text-primary)] truncate">
                    {thread.title}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {thread.lastMessage.toLocaleDateString()}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-[var(--border-light)]">
          <button className="w-full text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
            View All Posts →
          </button>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <header className="h-14 border-b border-[var(--border-light)] bg-[var(--bg-primary)] flex items-center px-4 gap-3">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="btn btn-ghost btn-icon"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <h1 className="font-display text-lg font-semibold text-[var(--text-primary)]">
            Neolog
          </h1>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full max-w-3xl mx-auto px-4 text-center">
              <MessageSquare size={64} className="text-[var(--text-tertiary)] mb-6" />
              <h2 className="font-display text-3xl font-bold text-[var(--text-primary)] mb-3">
                What do you want to create?
              </h2>
              <p className="text-[var(--text-secondary)] mb-8 max-w-md">
                Start a conversation to create blog posts, organize ideas, or turn your thoughts into published content.
              </p>

              {/* Suggested Prompts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                <button
                  onClick={() => setInput("I want to write about...")}
                  className="p-4 text-left rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all"
                >
                  <p className="font-semibold text-[var(--text-primary)] mb-1">
                    ✍️ Write an article
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Start from scratch or import ideas
                  </p>
                </button>
                <button
                  onClick={() => setInput("Help me organize my thoughts about...")}
                  className="p-4 text-left rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all"
                >
                  <p className="font-semibold text-[var(--text-primary)] mb-1">
                    🧠 Organize ideas
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Turn messy thoughts into structure
                  </p>
                </button>
                <button
                  onClick={() => setInput("I have a conversation I want to turn into a post...")}
                  className="p-4 text-left rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all"
                >
                  <p className="font-semibold text-[var(--text-primary)] mb-1">
                    💬 Import a chat
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    Paste ChatGPT, Claude, or Gemini logs
                  </p>
                </button>
                <button
                  onClick={() => setInput("Research and write about...")}
                  className="p-4 text-left rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] transition-all"
                >
                  <p className="font-semibold text-[var(--text-primary)] mb-1">
                    🔍 Deep research
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    AI researches and drafts for you
                  </p>
                </button>
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto w-full py-8 px-4">
              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`mb-8 ${message.role === 'user' ? 'flex justify-end' : 'flex justify-start'
                    }`}
                >
                  <div
                    className={`max-w-[85%] ${message.role === 'user'
                        ? 'bg-[var(--accent)] text-white rounded-2xl px-5 py-3'
                        : 'text-[var(--text-primary)]'
                      }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center">
                          <MessageSquare size={16} className="text-white" />
                        </div>
                        <span className="font-semibold text-sm">Neolog</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    <p
                      className={`text-xs mt-2 ${message.role === 'user' ? 'opacity-70' : 'text-[var(--text-tertiary)]'
                        }`}
                    >
                      {message.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center">
                      <MessageSquare size={16} className="text-white" />
                    </div>
                    <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="border-t border-[var(--border-light)] bg-[var(--bg-primary)] p-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-3 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder="Message Neolog... (Shift+Enter for new line)"
                className="flex-1 input resize-none min-h-[52px] max-h-[200px]"
                rows={1}
                style={{
                  height: 'auto',
                  minHeight: '52px',
                }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement
                  target.style.height = 'auto'
                  target.style.height = target.scrollHeight + 'px'
                }}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="btn btn-primary btn-icon h-[52px] w-[52px]"
              >
                <Send size={20} />
              </button>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] text-center mt-2">
              Neolog can make mistakes. Verify important information.
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
