/**
 * Chat — in-app assistant. Kimi K2.6 on Workers AI by default, Claude Sonnet
 * as an opt-in 'max' toggle. Wired up with tools so it can actually search the
 * vlog corpus, fetch threads/clusters, draft posts, and save notes.
 *
 * Left: thread list. Right: active conversation. Image / text attachments
 * uploaded via /api/v2/chat/attachment, then their presigned URL / text body
 * is included in the message payload to /api/v2/chat (POST).
 */
'use client'

import { useEffect, useRef, useState } from 'react'
import Shell from '@/components/Shell'

interface ThreadRow {
  id: string
  title: string | null
  model: string
  created_at: string
  updated_at: string
}

interface MessageRow {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string | null
  content_json: string | null
  tool_calls: string | null
  tool_call_id: string | null
  tool_name: string | null
  model: string | null
  created_at: string
}

interface PendingAttachment {
  id: string
  filename: string
  kind: string
  size_bytes: number
  url?: string | null
  text_body?: string | null
}

const MODEL_LABELS: Record<'scout' | 'kimi' | 'llama70b' | 'claude', { label: string; sub: string }> = {
  llama70b: { label: 'Llama 3.3 70B',  sub: 'dense, strong writing (Workers AI, default)' },
  scout:    { label: 'Llama 4 Scout',  sub: 'cheap + multimodal (Workers AI)' },
  kimi:     { label: 'Kimi K2.6',      sub: 'closest-to-Claude voice (Workers AI)' },
  claude:   { label: 'Sonnet (max)',   sub: 'premium, uses Anthropic API' },
}

export default function ChatPage() {
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<MessageRow[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [model, setModel] = useState<'scout' | 'kimi' | 'llama70b' | 'claude'>('llama70b')
  const [attachments, setAttachments] = useState<PendingAttachment[]>([])
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollEndRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const loadThreads = async () => {
    try {
      const r = await fetch('/api/v2/chat', { credentials: 'include' })
      if (!r.ok) return
      const data: any = await r.json()
      setThreads(data.threads || [])
    } catch {}
  }

  const loadMessages = async (threadId: string) => {
    try {
      const r = await fetch(`/api/v2/chat?thread_id=${encodeURIComponent(threadId)}`, { credentials: 'include' })
      if (!r.ok) return
      const data: any = await r.json()
      setMessages(data.messages || [])
      const m = data.thread?.model
      if (m === 'claude' || m === 'kimi' || m === 'scout') setModel(m)
    } catch {}
  }

  useEffect(() => {
    loadThreads()
    // Load operator's default chat model preference
    fetch('/api/v2/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        const m = d?.settings?.chat_default_model
        if (m === 'scout' || m === 'kimi' || m === 'llama70b' || m === 'claude') setModel(m)
      })
      .catch(() => {})
  }, [])
  useEffect(() => {
    if (activeThreadId) loadMessages(activeThreadId)
    else setMessages([])
  }, [activeThreadId])

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, sending])

  const newThread = () => {
    setActiveThreadId(null)
    setMessages([])
    setInput('')
    setAttachments([])
    taRef.current?.focus()
  }

  const send = async () => {
    if (!input.trim() && attachments.length === 0) return
    setSending(true)
    setError(null)
    // Optimistically render user message
    const optimisticId = `tmp_${Date.now()}`
    const optimisticContent = input || (attachments.length ? `[${attachments.length} attachment]` : '')
    setMessages(prev => [...prev, {
      id: optimisticId,
      role: 'user',
      content: optimisticContent,
      content_json: attachments.length ? JSON.stringify(attachments) : null,
      tool_calls: null,
      tool_call_id: null,
      tool_name: null,
      model: null,
      created_at: new Date().toISOString(),
    }])

    const messageText = buildMessageText(input, attachments)
    const images = attachments
      .filter(a => a.kind === 'image' && a.url)
      .map(a => a.url as string)

    try {
      const r = await fetch('/api/v2/chat', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          thread_id: activeThreadId,
          model,
          message: messageText,
          images: images.length ? images : undefined,
        }),
      })
      const data: any = await r.json().catch(() => ({}))
      if (!r.ok) {
        setError(data.error || `HTTP ${r.status}`)
      } else {
        setInput('')
        setAttachments([])
        if (!activeThreadId && data.thread_id) {
          setActiveThreadId(data.thread_id)
          await loadThreads()
        }
        // Reload full history so we see tool calls + results inline
        await loadMessages(data.thread_id || activeThreadId)
      }
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setSending(false)
    }
  }

  const uploadFile = async (file: File) => {
    const fd = new FormData()
    fd.append('file', file)
    if (activeThreadId) fd.append('thread_id', activeThreadId)
    try {
      const r = await fetch('/api/v2/chat/attachment', {
        method: 'POST',
        credentials: 'include',
        body: fd,
      })
      const data: any = await r.json()
      if (!r.ok) {
        setError(data.error || 'Upload failed')
        return
      }
      setAttachments(prev => [...prev, data])
    } catch (e: any) {
      setError(String(e?.message || e))
    }
  }

  const onPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) await uploadFile(file)
      }
    }
  }

  const deleteThread = async (id: string) => {
    if (!confirm('Delete this conversation?')) return
    await fetch(`/api/v2/chat?thread_id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    })
    if (activeThreadId === id) newThread()
    await loadThreads()
  }

  return (
    <Shell active="chat" breadcrumb={["Chat"]}><div className="pad-tight" style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="crumb reveal d2">Assistant</div>
        <h1 className="reveal d3">Chat</h1>
        <p className="lead reveal d4">
          Default: <strong>Kimi K2.6</strong> on Workers AI &mdash; the closest-to-Claude voice we
          can host natively. <strong>Llama 4 Scout</strong> is faster and cheaper but lower
          quality. <strong>Sonnet</strong> is the paid premium. Default is operator-configurable in
          Settings.
        </p>
      </section>

      <div style={{
        display: 'flex',
        flex: 1,
        gap: 16,
        padding: '0 24px 16px',
        minHeight: 0,
      }}>
        {/* Thread list */}
        <div style={{
          width: 220,
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <button
            onClick={newThread}
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--line)',
              background: 'transparent',
              color: 'var(--bone-1)',
              fontSize: 13,
              fontWeight: 500,
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >+ New conversation</button>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {threads.length === 0 && (
              <div style={{ padding: '14px 14px', fontSize: 12, color: 'var(--bone-4)' }}>
                No conversations yet. Type below to start one.
              </div>
            )}
            {threads.map(t => (
              <div key={t.id} style={{
                display: 'flex',
                alignItems: 'center',
                borderBottom: '1px solid var(--line-dim, rgba(236,228,210,0.04))',
                background: activeThreadId === t.id ? 'rgba(236,228,210,0.05)' : 'transparent',
              }}>
                <button
                  onClick={() => setActiveThreadId(t.id)}
                  style={{
                    flex: 1,
                    padding: '10px 14px',
                    background: 'transparent',
                    color: 'var(--bone-1)',
                    fontSize: 12,
                    textAlign: 'left',
                    cursor: 'pointer',
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {t.title || '(untitled)'}
                  <div style={{ fontSize: 10, color: 'var(--bone-4)', marginTop: 2, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>
                    {t.model.toUpperCase()}
                  </div>
                </button>
                <button
                  onClick={() => deleteThread(t.id)}
                  title="Delete"
                  style={{
                    padding: '8px 10px',
                    background: 'transparent',
                    color: 'var(--bone-4)',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >×</button>
              </div>
            ))}
          </div>
        </div>

        {/* Conversation pane */}
        <div style={{
          flex: 1,
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          minWidth: 0,
        }}>
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--line)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12,
            color: 'var(--bone-3)',
          }}>
            <span>Model:</span>
            {(['llama70b', 'scout', 'kimi', 'claude'] as const).map(m => (
              <button
                key={m}
                onClick={() => setModel(m)}
                className={`fchip ${model === m ? 'active' : ''}`}
                style={{ padding: '4px 10px', fontSize: 11 }}
                title={MODEL_LABELS[m].sub}
              >
                {MODEL_LABELS[m].label}
              </button>
            ))}
            <span style={{ marginLeft: 'auto', fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: 'var(--bone-4)' }}>
              {messages.length} messages
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {messages.length === 0 && !sending && (
              <div style={{ color: 'var(--bone-4)', fontSize: 13, lineHeight: 1.6 }}>
                Ask anything. Examples:
                <ul style={{ marginTop: 8 }}>
                  <li>"What have I been saying about loneliness lately?"</li>
                  <li>"Pull up the cluster about driving and summarize the takes."</li>
                  <li>"Draft a tweet from this thread: [paste]"</li>
                  <li>Drag an image in and ask about it.</li>
                </ul>
              </div>
            )}
            {messages.map(m => <Bubble key={m.id} m={m} />)}
            {sending && <div style={{ color: 'var(--bone-4)', fontSize: 12, fontStyle: 'italic' }}>thinking…</div>}
            <div ref={scrollEndRef} />
          </div>

          {/* Composer */}
          <div style={{
            borderTop: '1px solid var(--line)',
            padding: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {attachments.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {attachments.map(a => (
                  <div key={a.id} style={{
                    padding: '4px 8px',
                    background: 'rgba(236,228,210,0.06)',
                    border: '1px solid var(--line-warm)',
                    borderRadius: 8,
                    fontSize: 11,
                    color: 'var(--bone-1)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}>
                    <span style={{ textTransform: 'uppercase', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1 }}>{a.kind}</span>
                    <span style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.filename || a.id}
                    </span>
                    <button
                      onClick={() => setAttachments(prev => prev.filter(x => x.id !== a.id))}
                      style={{ background: 'transparent', color: 'var(--bone-4)', cursor: 'pointer' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
              <textarea
                ref={taRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={onPaste}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!sending) send()
                  }
                }}
                placeholder="Ask anything. Shift+Enter for newline. Paste an image directly."
                rows={2}
                style={{
                  flex: 1,
                  resize: 'none',
                  background: 'var(--ink-1)',
                  border: '1px solid var(--line-warm)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  fontSize: 13,
                  color: 'var(--bone)',
                  fontFamily: 'Geist, system-ui, sans-serif',
                }}
                disabled={sending}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,text/*,application/pdf,.md,.txt"
                style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadFile(f)
                  e.target.value = ''
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                title="Attach image or text"
                style={composerBtnStyle(false)}
              >📎</button>
              <button
                onClick={send}
                disabled={sending || (!input.trim() && attachments.length === 0)}
                style={composerBtnStyle(true)}
              >
                {sending ? '…' : 'Send'}
              </button>
            </div>
            {error && (
              <div style={{ fontSize: 12, color: 'var(--state-err)', padding: '4px 0' }}>
                {error}
              </div>
            )}
          </div>
        </div>
      </div>
    </div></Shell>
  )
}

function Bubble({ m }: { m: MessageRow }) {
  if (m.role === 'tool') {
    let parsed: any = m.content
    try { parsed = JSON.parse(m.content || '') } catch {}
    const summary = summarizeToolResult(m.tool_name, parsed)
    return (
      <details style={{
        fontSize: 11,
        color: 'var(--bone-4)',
        fontFamily: 'JetBrains Mono, monospace',
        background: 'rgba(236,228,210,0.03)',
        border: '1px solid var(--line-dim, rgba(236,228,210,0.05))',
        borderRadius: 8,
        padding: '6px 10px',
      }}>
        <summary style={{ cursor: 'pointer' }}>
          🔧 {m.tool_name} → {summary}
        </summary>
        <pre style={{ marginTop: 8, fontSize: 10, whiteSpace: 'pre-wrap', overflow: 'auto', maxHeight: 240 }}>
          {JSON.stringify(parsed, null, 2)}
        </pre>
      </details>
    )
  }
  const isUser = m.role === 'user'
  const toolCalls = m.tool_calls ? safeParse(m.tool_calls) : null
  const contentParts = m.content_json ? safeParse(m.content_json) : null
  const textPart = m.content || (Array.isArray(contentParts) ? contentParts.filter((p: any) => p?.type === 'text').map((p: any) => p.text).join('') : '')
  const imageParts = Array.isArray(contentParts) ? contentParts.filter((p: any) => p?.type === 'image_url') : []
  return (
    <div style={{
      // User messages stay bubble-like on the right but expand wider.
      // Assistant messages fill the full conversation pane — no
      // "85% of a wide pane" cramped feeling. Bubble border only on
      // user side to keep the assistant reading like an essay.
      alignSelf: isUser ? 'flex-end' : 'stretch',
      maxWidth: isUser ? '92%' : '100%',
      width: isUser ? 'auto' : '100%',
      background: isUser ? 'rgba(236,228,210,0.06)' : 'transparent',
      border: isUser ? '1px solid var(--line-warm)' : 'none',
      borderRadius: 12,
      padding: isUser ? '10px 14px' : '4px 0',
      color: 'var(--bone-1)',
      fontSize: 14,
      lineHeight: 1.55,
      whiteSpace: 'pre-wrap',
    }}>
      {imageParts.map((p: any, i: number) => (
        <img key={i} src={p.image_url.url} alt="" style={{ maxWidth: '100%', borderRadius: 8, marginBottom: 6 }} />
      ))}
      {textPart}
      {Array.isArray(toolCalls) && toolCalls.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--bone-4)', fontFamily: 'JetBrains Mono, monospace' }}>
          → called {toolCalls.map((tc: any) => tc.name).join(', ')}
        </div>
      )}
    </div>
  )
}

function summarizeToolResult(name: string | null, parsed: any): string {
  if (!parsed || typeof parsed !== 'object') return String(parsed).slice(0, 80)
  if (parsed.error) return `error: ${parsed.error}`
  if (parsed.count != null) return `${parsed.count} result${parsed.count === 1 ? '' : 's'}`
  if (parsed.id) return parsed.id
  return Object.keys(parsed).slice(0, 4).join(', ')
}

function safeParse(s: string): any {
  try { return JSON.parse(s) } catch { return null }
}

function buildMessageText(input: string, attachments: PendingAttachment[]): string {
  const textAttachments = attachments.filter(a => a.kind === 'text' && a.text_body)
  if (textAttachments.length === 0) return input
  const parts = [input.trim()]
  for (const a of textAttachments) {
    parts.push(`\n\n--- attachment: ${a.filename} ---\n${a.text_body}`)
  }
  return parts.join('').trim()
}

function composerBtnStyle(primary: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    background: primary ? 'var(--bone)' : 'transparent',
    color: primary ? 'var(--ink)' : 'var(--bone-1)',
    border: primary ? 'none' : '1px solid var(--line-warm)',
    borderRadius: 10,
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}
