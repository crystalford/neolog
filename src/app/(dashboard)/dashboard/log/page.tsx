'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { Upload, Send, ArrowUpRight, Loader2, CheckCircle2, User, Bot, Paperclip, MoreHorizontal } from 'lucide-react'
import { chatWithManager, type ChatMessage } from '@/app/actions/chat'
import { createClient } from '@/lib/supabase/client'
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
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

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

    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${session.user.id}/videos/${timestamp}_${sanitizedName}`

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
    <div className="flex flex-col h-[calc(100vh-64px)] max-w-4xl mx-auto px-6" style={{ fontFamily: 'var(--font-sans)' }}>
      
      {/* Header */}
      <div className="pt-8 md:pt-12 mb-6 flex-shrink-0">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
          {dateStr} · SESSION 1
        </p>
        <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>
          Daily Log
        </h1>
      </div>

      {/* Message Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto mb-6 pr-2 -mr-2 space-y-8 no-scrollbar"
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
                  {m.content}
                </div>
                {m.role === 'assistant' && i === messages.length - 1 && isTyping && (
                   <div className="mt-2 flex gap-1 px-1">
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce" />
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce delay-75" />
                     <span className="w-1 h-1 rounded-full bg-[var(--text-tertiary)] animate-bounce delay-150" />
                   </div>
                )}
              </div>
              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0 mt-1">
                  <User size={16} className="text-[var(--text-secondary)]" />
                </div>
              )}
            </div>
          ))
        )}
        
        {isTyping && !messages.find(m => m.role === 'assistant' && m === messages[messages.length-1]) && (
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
          <p className="text-xs text-center text-red-500 bg-red-500/10 py-2 rounded-lg">
            {error}
          </p>
        )}
      </div>

      {/* Input Zone */}
      <div className="pb-8 md:pb-12 flex-shrink-0">
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
            transition: 'all 0.2s',
            boxShadow: dragging ? '0 0 24px -4px rgba(124,106,245,0.2)' : '0 4px 24px -4px rgba(0,0,0,0.2)',
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Talk to your assistant or drop a file..."
            rows={1}
            className="no-scrollbar"
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              resize: 'none',
              color: 'var(--text-primary)',
              fontSize: '14px',
              lineHeight: 1.6,
              fontFamily: 'var(--font-sans)',
              marginBottom: '0.5rem',
              maxHeight: '120px'
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => fileRef.current?.click()}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--accent-soft)] transition-all"
                title="Attach file"
              >
                <Paperclip size={18} />
              </button>
              <input ref={fileRef} type="file" accept="video/*,audio/*,image/*,text/plain" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }} style={{ display: 'none' }} />
              
              <div className="w-[1px] h-4 bg-[var(--border-light)] self-center mx-1" />
              
              <p className="text-[10px] text-[var(--text-tertiary)] self-center font-mono opacity-50 hidden sm:block">
                TIPS: COMMAND + V TO PASTE
              </p>
            </div>
            
            <button
              onClick={handleTextSubmit}
              disabled={!input.trim() || isTyping || isUploading}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0.4rem 1rem', borderRadius: '8px',
                background: input.trim() && !isTyping && !isUploading ? 'var(--accent)' : 'transparent',
                border: `1px solid ${input.trim() ? 'transparent' : 'var(--border-light)'}`,
                color: input.trim() && !isTyping && !isUploading ? '#fff' : 'var(--text-tertiary)',
                cursor: input.trim() && !isTyping && !isUploading ? 'pointer' : 'default',
                transition: 'all 0.2s',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {isUploading ? (
                <div className="flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" />
                  <span>{uploadProgress}%</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span>Send</span>
                  <Send size={13} />
                </div>
              )}
            </button>
          </div>
        </div>

        {uploadSuccess && (
          <p className="text-[11px] text-green-500 mt-2 px-1 flex items-center gap-1.5 animation-fade-in">
            <CheckCircle2 size={12} />
            File successfully uploaded to your context.
          </p>
        )}
      </div>
    </div>
  )
}
