'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mic, MicOff, Send, Upload, Loader2, CheckCircle2,
  User, Bot, X, ChevronDown, ChevronUp, Paperclip, Square,
} from 'lucide-react'
import { chatWithManager, type ChatMessage } from '@/app/actions/chat'
import { createClient } from '@/lib/supabase/client'
import Markdown from '@/components/Markdown'
import * as tus from 'tus-js-client'

// ─── Types ────────────────────────────────────────────────────────────────────

type Entity = {
  id: string
  type: string
  name: string
  mention_count: number
  last_mentioned_at: string
  summary: string | null
}

type EntityMention = {
  id: string
  context: string
  source_type: string
  created_at: string
  video_uploads?: { file_name: string; created_at: string } | null
  log_entries?: { title: string; created_at: string } | null
}

type FeedItem = {
  id: string
  kind: 'log' | 'upload'
  title: string
  body: string | null
  timestamp: string
  source_type?: string
  status?: string
  analysis?: any
  meta?: any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENTITY_EMOJI: Record<string, string> = {
  project: '🏗', idea: '💡', person: '🤝', goal: '🚩',
  question: '❓', habit: '🔁', commitment: '🎯', skill: '📖', blocker: '🚧', topic: '🔷',
}

const ENTITY_COLOR: Record<string, string> = {
  project: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  idea: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  person: 'text-green-400 bg-green-400/10 border-green-400/20',
  goal: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
  question: 'text-orange-400 bg-orange-400/10 border-orange-400/20',
  habit: 'text-teal-400 bg-teal-400/10 border-teal-400/20',
  commitment: 'text-pink-400 bg-pink-400/10 border-pink-400/20',
  skill: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
  blocker: 'text-red-400 bg-red-400/10 border-red-400/20',
}

const SOURCE_LABEL: Record<string, string> = {
  video: 'video', chat: 'chat', capture: 'capture', import: 'import',
}

function reltime(dateStr: string) {
  const d = new Date(dateStr)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NeoLogPage() {
  // Feed
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [expandedFeedId, setExpandedFeedId] = useState<string | null>(null)

  // Entities
  const [entities, setEntities] = useState<Entity[]>([])
  const [expandedEntityId, setExpandedEntityId] = useState<string | null>(null)
  const [entityMentions, setEntityMentions] = useState<EntityMention[]>([])
  const [loadingMentions, setLoadingMentions] = useState(false)

  // Input
  const [input, setInput] = useState('')
  const [mode, setMode] = useState<'log' | 'chat'>('log')
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [showChat, setShowChat] = useState(false)

  // Upload
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Recording
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Misc
  const [error, setError] = useState<string | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Data fetching ──────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const [logRes, uploadRes] = await Promise.all([
        fetch('/api/log-entries'),
        fetch('/api/video-upload'),
      ])

      const items: FeedItem[] = []

      if (logRes.ok) {
        const { entries } = await logRes.json()
        for (const e of (entries || [])) {
          items.push({
            id: e.id,
            kind: 'log',
            title: e.title,
            body: e.body,
            timestamp: e.logged_at,
            source_type: e.entry_type,
            analysis: e.meta?.analysis,
            meta: e.meta,
          })
        }
      }

      if (uploadRes.ok) {
        const { uploads } = await uploadRes.json()
        for (const u of (uploads || [])) {
          items.push({
            id: u.id,
            kind: 'upload',
            title: u.file_name,
            body: null,
            timestamp: u.created_at,
            source_type: 'video',
            status: u.status,
          })
        }
      }

      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      setFeed(items)
    } catch (err) {
      console.error('Feed fetch failed:', err)
    } finally {
      setFeedLoading(false)
    }
  }, [])

  const fetchEntities = useCallback(async () => {
    try {
      const res = await fetch('/api/entities?sort=mentions&limit=16')
      if (res.ok) {
        const data = await res.json()
        setEntities(data.entities || [])
      }
    } catch (err) {
      console.error('Entities fetch failed:', err)
    }
  }, [])

  useEffect(() => {
    fetchFeed()
    fetchEntities()
  }, [fetchFeed, fetchEntities])

  useEffect(() => {
    if (showChat && chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, isThinking, showChat])

  // ── Entity expand ──────────────────────────────────────────────────────────

  const toggleEntity = async (id: string) => {
    if (expandedEntityId === id) {
      setExpandedEntityId(null)
      setEntityMentions([])
      return
    }
    setExpandedEntityId(id)
    setLoadingMentions(true)
    try {
      const res = await fetch(`/api/entities/${id}`)
      if (res.ok) {
        const data = await res.json()
        setEntityMentions(data.mentions || [])
      }
    } catch (err) {
      console.error('Mentions fetch failed:', err)
    } finally {
      setLoadingMentions(false)
    }
  }

  // ── Upload (TUS) ───────────────────────────────────────────────────────────

  const startUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)
    setUploadDone(false)
    setUploadError(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setIsUploading(false); setUploadError('Not logged in'); return }

    try {
      await fetch('/api/video-upload/prepare').catch(() => {})
    } catch {}

    const storagePath = `${session.user.id}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const projectId = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '')

    const tusUpload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { authorization: `Bearer ${session.access_token}`, 'x-upsert': 'true' },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'videos', objectName: storagePath,
        contentType: file.type || 'application/octet-stream', cacheControl: '86400',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: () => { setIsUploading(false); setUploadError('Upload failed. Try again.') },
      onProgress: (up, total) => setUploadProgress(Math.round((up / total) * 100)),
      onSuccess: async () => {
        try {
          await fetch('/api/video-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storage_path: storagePath, file_name: file.name,
              file_size_bytes: file.size, mime_type: file.type,
            }),
          })
          setUploadDone(true)
          setTimeout(() => { setUploadDone(false); fetchFeed() }, 2000)
        } catch {
          setUploadError('Upload registered but failed to process.')
        } finally {
          setIsUploading(false)
        }
      },
    })
    tusUpload.findPreviousUploads().then(prev => {
      if (prev.length) tusUpload.resumeFromPreviousUpload(prev[0])
      tusUpload.start()
    })
  }, [fetchFeed])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const f = Array.from(files)[0]
    if (f) startUpload(f)
  }, [startUpload])

  // ── Voice recording ────────────────────────────────────────────────────────

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      chunksRef.current = []
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' })
        startUpload(file)
        setIsRecording(false)
        setRecordingSeconds(0)
        if (timerRef.current) clearInterval(timerRef.current)
      }
      recorder.start()
      recorderRef.current = recorder
      setIsRecording(true)
      timerRef.current = setInterval(() => setRecordingSeconds(s => s + 1), 1000)
    } catch (err) {
      setError('Microphone access denied.')
    }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    const text = input.trim()
    if (!text || isThinking) return
    setInput('')
    setError(null)

    if (mode === 'log') {
      // Save as capture
      try {
        await fetch('/api/capture', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'text', content: text }),
        })
        fetchFeed()
        fetchEntities()
      } catch {
        setError('Failed to save capture.')
      }
    } else {
      // Chat mode
      const userMsg: ChatMessage = { role: 'user', content: text }
      const updated = [...chatMessages, userMsg]
      setChatMessages(updated)
      setShowChat(true)
      setIsThinking(true)
      try {
        const res = await chatWithManager(updated)
        if (res.success && res.message) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: res.message! }])
        } else {
          setError(res.error || 'Chat error')
        }
      } catch {
        setError('Chat failed.')
      } finally {
        setIsThinking(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  // ── Archive chat ───────────────────────────────────────────────────────────

  const archiveChat = async () => {
    if (chatMessages.length < 2 || isArchiving) return
    setIsArchiving(true)
    try {
      const res = await fetch('/api/chat/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages }),
      })
      if (res.ok) {
        setChatMessages([])
        setShowChat(false)
        fetchFeed()
        fetchEntities()
      } else {
        const d = await res.json()
        setError(d.error || 'Archive failed')
      }
    } catch {
      setError('Archive failed.')
    } finally {
      setIsArchiving(false)
    }
  }

  // ── Date label ─────────────────────────────────────────────────────────────

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).toUpperCase()

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)]"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
    >

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center justify-between border-b border-[var(--border-light)]">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-[var(--text-tertiary)] mb-0.5">{dateStr}</p>
          <h1 className="text-lg font-light tracking-tight text-[var(--text-primary)]">NeoLog</h1>
        </div>
        <div className="flex items-center gap-2">
          {chatMessages.length > 0 && (
            <button
              onClick={archiveChat}
              disabled={isArchiving}
              className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all"
            >
              {isArchiving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
              {isArchiving ? 'Saving...' : 'Save Session'}
            </button>
          )}
        </div>
      </div>

      {/* ── Entity Rail ── */}
      {entities.length > 0 && (
        <div className="flex-shrink-0 border-b border-[var(--border-light)]">
          <div className="flex gap-2 px-6 py-3 overflow-x-auto no-scrollbar">
            {entities.map(e => {
              const isExpanded = expandedEntityId === e.id
              const colorClass = ENTITY_COLOR[e.type] || 'text-[var(--text-tertiary)] bg-[var(--bg-card)] border-[var(--border-light)]'
              return (
                <button
                  key={e.id}
                  onClick={() => toggleEntity(e.id)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${colorClass} ${isExpanded ? 'ring-1 ring-current ring-offset-1 ring-offset-[var(--bg-primary)]' : 'hover:opacity-80'}`}
                >
                  <span>{ENTITY_EMOJI[e.type] || '·'}</span>
                  <span className="max-w-[140px] truncate">{e.name}</span>
                  <span className="opacity-50 text-[10px]">×{e.mention_count}</span>
                </button>
              )
            })}
          </div>

          {/* Entity detail panel */}
          {expandedEntityId && (
            <div className="px-6 pb-4 border-t border-[var(--border-light)] bg-[var(--bg-card)]/40">
              {(() => {
                const entity = entities.find(e => e.id === expandedEntityId)
                if (!entity) return null
                return (
                  <div className="pt-3">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{entity.type} · {entity.mention_count} mentions · last {reltime(entity.last_mentioned_at)}</p>
                        <p className="text-sm font-medium text-[var(--text-primary)] mt-0.5">{entity.name}</p>
                      </div>
                      <button onClick={() => { setExpandedEntityId(null); setEntityMentions([]) }} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                        <X size={14} />
                      </button>
                    </div>
                    {entity.summary && (
                      <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">{entity.summary}</p>
                    )}
                    {loadingMentions ? (
                      <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />
                    ) : (
                      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {entityMentions.slice(0, 6).map(m => (
                          <div key={m.id} className="flex-shrink-0 max-w-[240px] p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                            <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">{SOURCE_LABEL[m.source_type] || m.source_type} · {reltime(m.created_at)}</p>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-3">{m.context}</p>
                          </div>
                        ))}
                        {entityMentions.length === 0 && (
                          <p className="text-xs text-[var(--text-tertiary)]">No mentions yet.</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Feed ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar">

        {/* Chat panel (slides in above feed when chat mode active) */}
        {showChat && chatMessages.length > 0 && (
          <div className="border-b border-[var(--border-light)] bg-[var(--bg-card)]/30">
            <div className="max-w-2xl mx-auto px-6 py-4 space-y-4">
              {chatMessages.map((m, i) => (
                <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === 'assistant' ? 'bg-[var(--accent-soft)]' : 'bg-[var(--bg-tertiary)]'}`}>
                    {m.role === 'assistant' ? <Bot size={12} className="text-[var(--accent)]" /> : <User size={12} className="text-[var(--text-secondary)]" />}
                  </div>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${m.role === 'user' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-primary)]'}`}>
                    <Markdown content={m.content} />
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-soft)] flex items-center justify-center mt-0.5">
                    <Bot size={12} className="text-[var(--accent)]" />
                  </div>
                  <div className="px-4 py-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] flex gap-1 items-center">
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          </div>
        )}

        {/* Feed items */}
        <div className="max-w-2xl mx-auto px-6 py-6 space-y-3">
          {feedLoading ? (
            <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : feed.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-[var(--text-tertiary)] mb-2">Nothing logged yet.</p>
              <p className="text-xs text-[var(--text-tertiary)]">Type a thought, record your voice, or drop a file.</p>
            </div>
          ) : (
            feed.map(item => {
              const isExpanded = expandedFeedId === item.id
              const typeLabel = item.kind === 'upload' ? 'video' : (item.source_type || 'log')

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-card)]/60 overflow-hidden transition-all hover:border-[var(--border-medium)]"
                >
                  <button
                    onClick={() => setExpandedFeedId(isExpanded ? null : item.id)}
                    className="w-full text-left px-5 py-4 flex items-start justify-between gap-4"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)]">{typeLabel}</span>
                        {item.status && item.status !== 'processed' && (
                          <span className={`font-mono text-[9px] uppercase tracking-widest px-1.5 py-0.5 rounded ${item.status === 'error' ? 'text-red-400 bg-red-400/10' : 'text-yellow-400 bg-yellow-400/10'}`}>
                            {item.status}
                          </span>
                        )}
                        <span className="font-mono text-[9px] text-[var(--text-tertiary)]">{reltime(item.timestamp)}</span>
                      </div>
                      <p className="text-sm font-medium text-[var(--text-primary)] truncate pr-2">{item.title}</p>
                      {item.body && !isExpanded && (
                        <p className="text-xs text-[var(--text-secondary)] mt-1 line-clamp-2 leading-relaxed">{item.body}</p>
                      )}
                    </div>
                    <div className="flex-shrink-0 text-[var(--text-tertiary)]">
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[var(--border-light)] pt-4 space-y-4">
                      {item.body && (
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                          <Markdown content={item.body} />
                        </p>
                      )}

                      {item.analysis && (
                        <div className="grid grid-cols-2 gap-3">
                          {item.analysis.projects?.length > 0 && (
                            <div>
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Projects</p>
                              <div className="space-y-1">
                                {item.analysis.projects.slice(0, 4).map((p: any, i: number) => (
                                  <p key={i} className="text-xs text-[var(--text-primary)]">🏗 {typeof p === 'object' ? p.name : p}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.analysis.ideas?.length > 0 && (
                            <div>
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Ideas</p>
                              <div className="space-y-1">
                                {item.analysis.ideas.slice(0, 4).map((idea: any, i: number) => (
                                  <p key={i} className="text-xs text-[var(--text-primary)]">💡 {typeof idea === 'object' ? idea.text : idea}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.analysis.action_items?.length > 0 && (
                            <div>
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Actions</p>
                              <div className="space-y-1">
                                {item.analysis.action_items.slice(0, 3).map((a: string, i: number) => (
                                  <p key={i} className="text-xs text-[var(--text-primary)]">→ {a}</p>
                                ))}
                              </div>
                            </div>
                          )}
                          {item.analysis.key_quotes?.length > 0 && (
                            <div>
                              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--text-tertiary)] mb-1.5">Quotes</p>
                              <p className="text-xs text-[var(--text-secondary)] italic leading-relaxed line-clamp-3">&ldquo;{item.analysis.key_quotes[0]}&rdquo;</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* ── Upload progress toast ── */}
      {(isUploading || uploadDone || uploadError) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-medium shadow-lg backdrop-blur-md border ${uploadError ? 'bg-red-500/90 text-white border-red-400' : uploadDone ? 'bg-green-500/90 text-white border-green-400' : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-medium)]'}`}>
            {uploadError ? (
              <>{uploadError}</>
            ) : uploadDone ? (
              <><CheckCircle2 size={14} /> File received — processing</>
            ) : (
              <><Loader2 size={14} className="animate-spin" /> Uploading {uploadProgress}%</>
            )}
          </div>
        </div>
      )}

      {/* ── Error toast ── */}
      {error && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className="flex items-center gap-2 px-4 py-2 rounded-full text-xs bg-red-500/90 text-white shadow-lg">
            {error}
            <button onClick={() => setError(null)}><X size={12} /></button>
          </div>
        </div>
      )}

      {/* ── Input Bar ── */}
      <div className="flex-shrink-0 border-t border-[var(--border-light)] bg-[var(--bg-primary)]/90 backdrop-blur-md px-4 py-3">
        <div className="max-w-2xl mx-auto">
          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-xs font-mono text-red-400">
                {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
              <span className="text-xs text-[var(--text-tertiary)]">Recording — tap stop when done</span>
            </div>
          )}

          <div className="flex items-end gap-2">
            {/* Record / Stop button */}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploading}
              className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white' : 'bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40'}`}
            >
              {isRecording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
            </button>

            {/* Text input */}
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={mode === 'log' ? 'Log a thought...' : 'Talk to your assistant...'}
                rows={1}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]/60 resize-none overflow-hidden no-scrollbar leading-relaxed"
              />
            </div>

            {/* Mode toggle */}
            <button
              onClick={() => {
                const next = mode === 'log' ? 'chat' : 'log'
                setMode(next)
                if (next === 'chat') setShowChat(true)
              }}
              className="flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider border transition-all"
              style={{
                color: mode === 'chat' ? 'var(--accent)' : 'var(--text-tertiary)',
                borderColor: mode === 'chat' ? 'var(--accent)' : 'var(--border-light)',
                background: mode === 'chat' ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
              }}
            >
              {mode === 'log' ? 'log' : 'chat'}
            </button>

            {/* Upload button */}
            <button
              onClick={() => fileRef.current?.click()}
              disabled={isUploading}
              className="flex-shrink-0 w-9 h-9 rounded-full bg-[var(--bg-card)] border border-[var(--border-medium)] flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-all"
            >
              <Paperclip size={15} />
            </button>

            {/* Send button */}
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || isThinking}
              className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${input.trim() ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-card)] border border-[var(--border-light)] text-[var(--text-tertiary)]'}`}
            >
              <Send size={15} />
            </button>
          </div>

          <input ref={fileRef} type="file" className="hidden" onChange={e => { if (e.target.files?.length) handleFiles(e.target.files) }} />
        </div>
      </div>

    </div>
  )
}
