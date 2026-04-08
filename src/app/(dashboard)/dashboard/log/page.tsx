'use client'export const runtime = 'edge'


import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Mic, MicOff, Send, Upload, Loader2, CheckCircle2,
  User, Bot, X, ChevronDown, ChevronUp, Paperclip, Square, Sparkles,
  ClipboardPaste, MessageSquare
} from 'lucide-react'
import { chatWithManager, type ChatMessage } from '@/app/actions/chat'
import { createClient } from '@/lib/supabase/client'
import Markdown from '@/components/Markdown'
import { UploadPipelineStatus } from '@/components/UploadPipelineStatus'
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
  pipeline_log?: any[]
  error_message?: string | null
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
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  if (h < 24) return `${h}h ago`
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function abstime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function NeoLogPage() {
  // Chat
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const [showChat, setShowChat] = useState(false)
  
  // Feed & Entities (Stored but not shown in main UI to minimize clutter)
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  // Input mode: 'chat' = AI chat, 'paste' = direct log ingest
  const [inputMode, setInputMode] = useState<'chat' | 'paste'>('chat')
  const [pasteText, setPasteText] = useState('')
  const [isPasting, setIsPasting] = useState(false)
  const [pasteSuccess, setPasteSuccess] = useState(false)

  // Input & Refs
  const [input, setInput] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadDone, setUploadDone] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)

  const chatEndRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Data Fetching ──────────────────────────────────────────────────────────

  const fetchFeed = useCallback(async () => {
    setFeedLoading(true)
    try {
      const uploadRes = await fetch('/api/video-upload')
      if (uploadRes.ok) {
        const { uploads } = await uploadRes.json()
        setFeed(uploads || [])
      }
    } catch (err: any) {
      console.error('Feed fetch failed:', err)
    } finally {
      setFeedLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeed()
  }, [fetchFeed])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, isThinking])

  // ── Upload (TUS) ───────────────────────────────────────────────────────────

  const startUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)
    setUploadDone(false)
    setUploadError(null)

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setIsUploading(false); setUploadError('Not logged in'); return }

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
        contentType: file.type || 'application/octet-stream',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (err) => { 
        console.error('Upload error:', err)
        setIsUploading(false)
        setUploadError('Upload failed. Try again.') 
      },
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

  // ── Voice Recording ────────────────────────────────────────────────────────

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
        setError(res.error || 'Assistant error')
      }
    } catch {
      setError('Chat failed.')
    } finally {
      setIsThinking(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

  const handlePasteIngest = async () => {
    if (!pasteText.trim() || isPasting) return
    setIsPasting(true)
    try {
      const res = await fetch('/api/ingest/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: pasteText.trim() }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Ingest failed')
      setPasteSuccess(true)
      setPasteText('')
      setTimeout(() => setPasteSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsPasting(false)
    }
  }

  const archiveChat = async () => {
    if (chatMessages.length < 2 || isArchiving) return
    setIsArchiving(true)
    try {
      const res = await fetch('/api/chat/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          messages: chatMessages,
          meta: {
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
            clientTime: new Date().toISOString()
          }
        }),
      })
      if (res.ok) {
        setChatMessages([])
        setShowChat(false)
        fetchFeed()
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

  const dateStr = new Date().toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  }).toUpperCase()

  return (
    <div
      className="flex flex-col h-full overflow-hidden bg-[var(--bg-primary)]"
      onDragOver={e => e.preventDefault()}
      onDrop={e => { e.preventDefault(); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
    >
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-3 flex items-center justify-between border-b border-[var(--border-light)]">
        <div>
          <p className="font-mono text-[10px] tracking-widest text-[var(--text-tertiary)] mb-0.5">{dateStr}</p>
          <h1 className="text-lg font-light tracking-tight text-[var(--text-primary)]">NeoLog</h1>
        </div>
        <div className="flex items-center gap-2">
          {chatMessages.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setChatMessages([]); setShowChat(false) }}
                className="px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all"
              >
                Reset
              </button>
              <button
                onClick={archiveChat}
                disabled={isArchiving}
                className="flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-[var(--accent)] text-white hover:opacity-90 transition-all shadow-sm"
              >
                {isArchiving ? <Loader2 size={10} className="animate-spin" /> : <CheckCircle2 size={10} />}
                {isArchiving ? 'Saving...' : 'Commit to Log'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-[var(--bg-primary)]">
        <div className={`transition-all duration-300 min-h-full flex flex-col ${!showChat && chatMessages.length === 0 ? 'justify-center' : 'justify-end pb-12'}`}>
          <div className="max-w-4xl mx-auto w-full px-6 py-8 space-y-6">
            {!showChat && chatMessages.length === 0 ? (
              <div className="text-center space-y-4 py-20 opacity-40">
                <Sparkles size={48} className="mx-auto text-[var(--accent)]" />
                <div>
                  <h2 className="text-xl font-medium text-[var(--text-primary)] mb-1">How can I help you?</h2>
                  <p className="text-sm text-[var(--text-tertiary)]">Recording, analysis, and memory synthesis active.</p>
                </div>
              </div>
            ) : (
              chatMessages.map((m, i) => (
                <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'flex-row-reverse' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 border ${
                    m.role === 'assistant' 
                      ? 'bg-[var(--accent-soft)] border-[var(--accent)]/20 shadow-sm' 
                      : 'bg-[var(--bg-tertiary)] border-[var(--border-light)]'
                  }`}>
                    {m.role === 'assistant' ? <Bot size={14} className="text-[var(--accent)]" /> : <User size={14} className="text-[var(--text-secondary)]" />}
                  </div>
                  <div className={`max-w-[85%] px-5 py-3.5 rounded-2xl text-[14px] leading-relaxed shadow-sm ${
                    m.role === 'user' 
                      ? 'bg-[var(--accent)] text-white font-medium' 
                      : 'bg-[var(--bg-card)] border border-[var(--border-light)] text-[var(--text-primary)]'
                  }`}>
                    <Markdown content={m.content} />
                  </div>
                </div>
              ))
            )}
            
            {isThinking && (
              <div className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/20 flex items-center justify-center mt-0.5 shadow-sm">
                  <Bot size={14} className="text-[var(--accent)]" />
                </div>
                <div className="px-5 py-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] flex gap-1.5 items-center shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] opacity-40 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] opacity-40 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] opacity-40 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
        </div>
      </div>

      {/* Upload/Status Toasts */}
      {(isUploading || uploadDone || uploadError) && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-50">
          <div className={`flex items-center gap-3 px-4 py-2.5 rounded-full text-xs font-medium shadow-lg backdrop-blur-md border ${uploadError ? 'bg-red-500/90 text-white border-red-400' : uploadDone ? 'bg-green-500/90 text-white border-green-400' : 'bg-[var(--bg-card)] text-[var(--text-primary)] border-[var(--border-medium)]'}`}>
            {uploadError ? uploadError : uploadDone ? <><CheckCircle2 size={14} /> File received</> : <><Loader2 size={14} className="animate-spin" /> Uploading {uploadProgress}%</>}
          </div>
        </div>
      )}

      {/* Input Bar */}
      <div className="flex-shrink-0 border-t border-[var(--border-light)] bg-[var(--bg-primary)]/90 backdrop-blur-md px-4 py-4">
        <div className="max-w-4xl mx-auto">

          {/* Mode toggle */}
          <div className="flex items-center gap-1 mb-3">
            <button
              onClick={() => setInputMode('chat')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${inputMode === 'chat' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <MessageSquare size={11} /> Chat
            </button>
            <button
              onClick={() => setInputMode('paste')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all ${inputMode === 'paste' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
            >
              <ClipboardPaste size={11} /> Paste text
            </button>
          </div>

          {/* Paste mode panel */}
          {inputMode === 'paste' && (
            <div className="mb-3 space-y-2">
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste a chat log, meeting notes, article, code snippet..."
                rows={6}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]/60 resize-none font-mono leading-relaxed"
              />
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">
                  {pasteText.length} chars
                  {pasteSuccess && <span className="ml-2 text-emerald-400">✓ Ingested</span>}
                </span>
                <button
                  onClick={handlePasteIngest}
                  disabled={!pasteText.trim() || isPasting}
                  className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-medium disabled:opacity-40 transition-opacity"
                >
                  {isPasting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                  {isPasting ? 'Ingesting...' : 'Ingest'}
                </button>
              </div>
            </div>
          )}

          {isRecording && (
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-xs font-mono text-red-400">
                {Math.floor(recordingSeconds / 60).toString().padStart(2, '0')}:{(recordingSeconds % 60).toString().padStart(2, '0')}
              </span>
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isUploading}
              className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 text-white shadow-lg' : 'bg-[var(--bg-card)] border border-[var(--border-medium)] text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40'}`}
            >
              {isRecording ? <Square size={14} fill="currentColor" /> : <Mic size={16} />}
            </button>

            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Log a thought or chat..."
                rows={1}
                className="w-full bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-xl px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]/60 resize-none overflow-hidden no-scrollbar leading-relaxed"
              />
            </div>

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
