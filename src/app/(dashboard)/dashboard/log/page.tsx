'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Send, ArrowUpRight, Loader2, CheckCircle2, User, Bot, Paperclip, MoreHorizontal } from 'lucide-react'
import { chatWithManager, type ChatMessage } from '@/app/actions/chat'
import { createClient } from '@/lib/supabase/client'
import Markdown from '@/components/Markdown'
import * as tus from 'tus-js-client'

const mockExtractions = [
  { emoji: '💡', name: 'AI documentary idea', type: 'Idea', time: '12m ago' },
  { emoji: '🏗', name: 'Neolog', type: 'Project', time: '12m ago' },
  { emoji: '❓', name: 'How do I sell without selling?', type: 'Question', time: '12m ago' },
  { emoji: '🎯', name: 'Ship uploads this week', type: 'Commitment', time: '12m ago' },
  { emoji: '📖', name: 'The Crystal Ford', type: 'Creative', time: '12m ago' },
]

const days = [
  { date: 'Sat, Mar 8', sessions: 1, entities: 17 },
  { date: 'Thu, Mar 6', sessions: 2, entities: 31 },
  { date: 'Tue, Mar 4', sessions: 1, entities: 11 },
]

export default function DailyLogPage() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isTyping, setIsTyping] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const [entries, setEntries] = useState<any[]>([])
  const [loadingEntries, setLoadingEntries] = useState(true)
  const [view, setView] = useState<'chat' | 'timeline' | 'detail'>('timeline')
  const [selectedEntry, setSelectedEntry] = useState<any | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchEntries = useCallback(async () => {
    try {
      const res = await fetch('/api/log-entries')
      if (res.ok) {
        const data = await res.json()
        setEntries(data.entries || [])
      }
    } catch (err) {
      console.error('Failed to fetch entries:', err)
    } finally {
      setLoadingEntries(false)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  const handleEndSession = async () => {
    if (messages.length < 2 || isArchiving) return
    if (!confirm('End this session and archive it to your timeline? This will trigger a 3rd-person analysis.')) return

    setIsArchiving(true)
    try {
      const res = await fetch('/api/chat/archive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages }),
      })

      if (res.ok) {
        await fetchEntries()
        setView('timeline')
        setMessages([]) // Clear chat for next session
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to archive session')
      }
    } catch (err) {
      console.error('Archive error:', err)
      setError('Failed to archive session')
    } finally {
      setIsArchiving(false)
    }
  }

  const [username, setUsername] = useState<string | null>(null)

  useEffect(() => {
    const loadProfile = async () => {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data } = await supabase
          .from('profiles')
          .select('username')
          .eq('id', session.user.id)
          .single()
        setUsername(data?.username || null)
      }
    }
    loadProfile()
  }, [])

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])

  // Initialize with a welcome message if empty
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        { 
          role: 'assistant', 
          content: "Welcome to your Daily Log. I'm your Neolog assistant. You can brainstorm ideas, drop recordings, or ask me to draft something based on your context." 
        }
      ])
    }
  }, [])

  const startTusUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)
    setUploadSuccess(false)
    setError(null)
    
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setIsUploading(false)
      setError('You must be logged in to upload.')
      return
    }

    try {
      // Ensure infrastructure (bucket) is ready
      const prepRes = await fetch('/api/video-upload/prepare')
      if (!prepRes.ok) {
        console.warn('Infrastructure check failed, attempting upload anyway...')
      }
    } catch (err) {
      console.error('Failed to prepare infrastructure:', err)
    }

    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${session.user.id}/${timestamp}_${sanitizedName}`

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

    const tusUpload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'videos',
        objectName: storagePath,
        contentType: file.type || 'text/plain',
        cacheControl: '86400',
      },
      chunkSize: 6 * 1024 * 1024,
      onError: (error) => {
        console.error('TUS upload error:', error)
        setIsUploading(false)
        setError('Upload failed. Please try again.')
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const progress = Math.round((bytesUploaded / bytesTotal) * 100)
        setUploadProgress(progress)
      },
      onSuccess: async () => {
        try {
          // Register with backend -> creates DB record + fires Inngest
          await fetch('/api/video-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              storage_path: storagePath,
              file_name: file.name,
              file_size_bytes: file.size,
              mime_type: file.type || 'text/plain',
            }),
          })
          setUploadSuccess(true)
          
          // Add notification to chat
          setMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `I've received **${file.name}**. I'm analyzing it now to add to your daily log context.` 
          }])

          setTimeout(() => setUploadSuccess(false), 3000)
        } catch (err) {
          console.error('Failed to register upload:', err)
          setError('Failed to process upload.')
        } finally {
          setIsUploading(false)
        }
      },
    })

    tusUpload.findPreviousUploads().then(previous => {
      if (previous.length) tusUpload.resumeFromPreviousUpload(previous[0])
      tusUpload.start()
    })
  }, [])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files)
    if (fileArray.length > 0) {
      startTusUpload(fileArray[0]) // Only take the first one for simplicity in the log page
    }
  }, [startTusUpload])

  const handleTextSubmit = async () => {
    const trimmedInput = input.trim()
    if (!trimmedInput || isTyping || isUploading) return

    const userMessage: ChatMessage = { role: 'user', content: trimmedInput }
    const newMessages = [...messages, userMessage]
    
    setMessages(newMessages)
    setInput('')
    setIsTyping(true)
    setError(null)

    try {
      const response = await chatWithManager(newMessages)
      if (response.success && response.message) {
        setMessages(prev => [...prev, { role: 'assistant', content: response.message! }])
      } else if (response.error === 'NO_API_KEYS') {
        setError('API keys missing. Please configure them in Settings.')
      } else {
        setError(response.error || 'Something went wrong.')
      }
    } catch (err) {
      console.error('Chat error:', err)
      setError('Failed to send message.')
    } finally {
      setIsTyping(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleTextSubmit()
    }
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[var(--bg-primary)]" style={{ fontFamily: 'var(--font-sans)' }}>
      
      {/* Header */}
      <div className="pt-6 px-8 mb-4 flex-shrink-0 flex items-start justify-between border-b border-[var(--border-light)] pb-4 bg-[var(--bg-primary)]/80 backdrop-blur-md sticky top-0 z-20">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.2rem' }}>
            {dateStr} · {view === 'chat' ? 'ACTIVE SESSION' : view === 'detail' ? 'SESSION ARCHIVE' : 'CENTRAL LOG'}
          </p>
          <div className="flex items-center gap-6">
            <h1 
              className="cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setView('timeline')}
              style={{ fontSize: '22px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}
            >
              Daily Log
            </h1>
            
            {view === 'timeline' && (
              <button
                onClick={() => setView('chat')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent)] text-white text-[10px] font-semibold border border-[var(--accent)]/20 hover:opacity-90 transition-all uppercase tracking-wider"
              >
                <Bot size={12} />
                Open Chat
              </button>
            )}

            {view === 'chat' && messages.length > 2 && (
              <button
                onClick={handleEndSession}
                disabled={isArchiving}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[10px] font-semibold border border-[var(--accent)]/20 hover:bg-[var(--accent)]/20 transition-all uppercase tracking-wider"
              >
                {isArchiving ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Archiving...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    End Session & Archive
                  </>
                )}
              </button>
            )}

            {view === 'detail' && (
              <button
                onClick={() => setView('timeline')}
                className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-secondary)] text-[10px] font-semibold border border-[var(--border-light)] hover:bg-[var(--bg-secondary)] transition-all uppercase tracking-wider"
              >
                Back to Timeline
              </button>
            )}
          </div>
        </div>
        {username && (
          <a
            href={`/${username}/log`}
            target="_blank"
            className="btn btn-secondary btn-sm flex items-center gap-1 mt-4"
          >
            <ArrowUpRight size={13} />
            Public Log
          </a>
        )}
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {view === 'timeline' && (
          <div className="max-w-3xl mx-auto px-6 py-12">
            {loadingEntries ? (
              <div className="flex flex-col items-center justify-center py-24 opacity-40">
                <Loader2 size={32} className="animate-spin mb-4" />
                <p className="text-sm font-mono uppercase tracking-widest text-[10px]">Synchronizing Log...</p>
              </div>
            ) : entries.length === 0 ? (
              <div className="text-center py-24 border border-dashed border-[var(--border-light)] rounded-3xl bg-[var(--bg-card)]/30">
                <p className="text-sm text-[var(--text-tertiary)] mb-6">Your timeline is quiet. Start a conversation to capture your first session.</p>
                <button
                  onClick={() => setView('chat')}
                  className="px-6 py-2 rounded-full bg-[var(--accent)] text-white text-xs font-semibold hover:opacity-90 transition-all"
                >
                  Initiate Brainstorming Session
                </button>
              </div>
            ) : (
              <div className="space-y-16 relative">
                {/* Visual Timeline Wire */}
                <div className="absolute left-0 top-0 bottom-0 w-[1px] bg-gradient-to-b from-[var(--accent)]/40 via-[var(--border-light)] to-transparent" />
                
                {entries.map((entry, idx) => {
                  const date = new Date(entry.logged_at)
                  const meta = entry.meta || {}
                  const analysis = meta.analysis || {}
                  
                  return (
                    <div 
                      key={entry.id} 
                      className="pl-8 relative group cursor-pointer"
                      onClick={() => { setSelectedEntry(entry); setView('detail') }}
                    >
                      {/* Timeline Dot */}
                      <div className="absolute left-[-4px] top-1 w-2 h-2 rounded-full bg-[var(--accent)] ring-4 ring-[var(--bg-primary)] group-hover:scale-125 transition-transform" />
                      
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div>
                          <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase mb-1">
                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {entry.entry_type.replace('_', ' ')}
                          </p>
                          <h3 className="text-xl font-light tracking-tight text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                            {entry.title}
                          </h3>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-mono text-[var(--text-tertiary)]">
                            {date.toLocaleDateString('en-US', { day: '2-digit', month: 'short' }).toUpperCase()}
                          </p>
                        </div>
                      </div>

                      <div className="bg-[var(--bg-card)]/50 backdrop-blur-sm border border-[var(--border-light)] p-5 rounded-2xl group-hover:border-[var(--accent)]/30 group-hover:bg-[var(--bg-card)]/80 transition-all">
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-3">
                          {entry.body}
                        </p>
                        
                        {(analysis.ideas?.length > 0 || analysis.projects?.length > 0) && (
                          <div className="flex flex-wrap gap-2 mt-4">
                            {analysis.projects?.slice(0, 2).map((p: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded-md bg-blue-400/10 text-blue-400 text-[10px] font-medium border border-blue-400/20">
                                🏗 {p}
                              </span>
                            ))}
                            {analysis.ideas?.slice(0, 2).map((idea: string, i: number) => (
                              <span key={i} className="px-2 py-0.5 rounded-md bg-yellow-400/10 text-yellow-400 text-[10px] font-medium border border-yellow-400/20">
                                💡 {idea}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {view === 'chat' && (
          <div className="h-full flex flex-col">
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto pt-8 pb-12 px-8 md:px-24 xl:px-48 space-y-10 no-scrollbar"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                  <Bot size={48} strokeWidth={1} className="mb-4 text-[var(--accent)]" />
                  <p className="text-sm">Start a conversation or drop a recording.</p>
                </div>
              ) : (
                messages.map((m, i) => (
                  <div key={i} className={`flex gap-4 ${m.role === 'user' ? 'justify-end' : ''}`}>
                    {m.role === 'assistant' && (
                      <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 mt-1">
                        <Bot size={16} className="text-[var(--accent)]" />
                      </div>
                    )}
                    <div className={`max-w-[85%] group`}>
                      <div className={`
                        p-4 rounded-2xl text-sm leading-relaxed
                        ${m.role === 'user' 
                          ? 'bg-[var(--accent)] text-white ml-auto' 
                          : 'bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-primary)]'}
                      `}>
                        <Markdown content={m.content} />
                      </div>
                    </div>
                    {m.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-1">
                        <User size={16} className="text-[var(--text-secondary)]" />
                      </div>
                    )}
                  </div>
                ))
              )}
              {isTyping && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-soft)] flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot size={16} className="text-[var(--accent)]" />
                  </div>
                  <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center gap-1">
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce" />
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce delay-75" />
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce delay-150" />
                  </div>
                </div>
              )}
              {error && (
                <p className="text-xs text-center text-red-500 bg-red-500/10 py-2 rounded-lg">{error}</p>
              )}
            </div>

            {/* Input Zone */}
            <div className="pb-6 px-8 md:px-24 xl:px-48 flex-shrink-0">
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
                style={{
                  position: 'relative',
                  background: dragging ? 'rgba(124,106,245,0.06)' : 'rgba(13,13,22,0.7)',
                  backdropFilter: 'blur(16px)',
                  border: `1px solid ${dragging ? 'var(--border-glow)' : 'var(--border-medium)'}`,
                  borderRadius: '12px',
                  padding: '1rem',
                }}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Talk to your assistant..."
                  rows={1}
                  className="w-full bg-transparent border-none outline-none resize-none color-[var(--text-primary)] text-sm leading-relaxed no-scrollbar"
                />
                <div className="flex items-center justify-between mt-2">
                  <button onClick={() => fileRef.current?.click()} className="p-1 text-[var(--text-tertiary)] hover:text-[var(--accent)]">
                    <Paperclip size={18} />
                  </button>
                  <input ref={fileRef} type="file" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }} style={{ display: 'none' }} />
                  <button
                    onClick={handleTextSubmit}
                    disabled={!input.trim() || isTyping}
                    className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      input.trim() ? 'bg-[var(--accent)] text-white' : 'bg-transparent border border-[var(--border-light)] text-[var(--text-tertiary)]'
                    }`}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {view === 'detail' && selectedEntry && (
          <div className="max-w-4xl mx-auto px-8 py-12">
            <div className="mb-12">
              <p className="text-xs font-mono text-[var(--accent)] mb-2 uppercase tracking-widest">
                SESSION REPORT · {new Date(selectedEntry.logged_at).toLocaleDateString()}
              </p>
              <h2 className="text-4xl font-light tracking-tight text-[var(--text-primary)] mb-6">
                {selectedEntry.title}
              </h2>
              
              <div className="aspect-video w-full rounded-3xl bg-[var(--bg-card)] border border-[var(--border-light)] overflow-hidden mb-12 flex items-center justify-center bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-secondary)] shadow-2xl relative">
                <div className="absolute inset-0 bg-grid-white/[0.02]" />
                <div className="text-center relative z-10">
                  <Bot size={48} className="text-[var(--accent)]/40 mx-auto mb-4" />
                  <p className="text-xs font-mono text-[var(--text-tertiary)] uppercase tracking-tighter">AI Analysis Protocol v1.4.2</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                <div className="md:col-span-2 space-y-10">
                  <section>
                    <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">The Narrative Report</h4>
                    <div className="text-lg leading-relaxed text-[var(--text-secondary)] space-y-4">
                      <Markdown content={selectedEntry.body} />
                    </div>
                  </section>
                </div>

                <div className="space-y-10">
                  {selectedEntry.meta?.analysis?.projects?.length > 0 && (
                    <section>
                      <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Projects Tracked</h4>
                      <div className="space-y-3">
                        {selectedEntry.meta.analysis.projects.map((p: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                            <span className="text-lg">🏗</span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">{p}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectedEntry.meta?.analysis?.ideas?.length > 0 && (
                    <section>
                      <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Extracted Ideas</h4>
                      <div className="space-y-3">
                        {selectedEntry.meta.analysis.ideas.map((idea: string, i: number) => (
                          <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                            <span className="text-lg">💡</span>
                            <span className="text-xs font-medium text-[var(--text-primary)]">{idea}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {selectedEntry.meta?.analysis?.decisions?.length > 0 && (
                    <section>
                      <h4 className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-4">Core Decisions</h4>
                      <div className="space-y-2">
                        {selectedEntry.meta.analysis.decisions.map((d: string, i: number) => (
                          <div key={i} className="text-xs text-[var(--text-secondary)] pl-4 border-l-2 border-[var(--accent)]">
                            {d}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {uploadSuccess && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-green-500 text-white text-xs rounded-full shadow-lg flex items-center gap-2 z-50">
          <CheckCircle2 size={14} />
          File accepted for analysis
        </div>
      )}
    </div>
  )
}
