'use client'

import { useState, useRef, useCallback } from 'react'
import { Upload, Send, ArrowUpRight, Loader2, CheckCircle2 } from 'lucide-react'
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
  const [dragging, setDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const startTusUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setUploadProgress(0)
    setUploadSuccess(false)
    
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setIsUploading(false)
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
          setTimeout(() => setUploadSuccess(false), 3000)
        } catch (err) {
          console.error('Failed to register upload:', err)
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

  const handleTextSubmit = () => {
    if (!input.trim()) return
    const file = new File([input], 'text_log.txt', { type: 'text/plain' })
    startTusUpload(file)
    setInput('')
  }

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase()

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12" style={{ fontFamily: 'var(--font-sans)' }}>

      {/* Date / session label */}
      <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem' }}>
        {dateStr} · SESSION 1
      </p>
      <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '2rem' }}>
        Daily Log
      </h1>

      {/* Glass input zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files) }}
        style={{
          position: 'relative',
          background: dragging ? 'rgba(124,106,245,0.06)' : 'rgba(13,13,22,0.7)',
          backdropFilter: 'blur(16px)',
          border: `1px solid ${dragging ? 'var(--border-glow)' : 'var(--border-medium)'}`,
          borderRadius: '10px',
          padding: '1rem 1rem 0.75rem',
          marginBottom: '0.75rem',
          transition: 'all 0.2s',
          boxShadow: dragging ? '0 0 24px -4px rgba(124,106,245,0.2)' : 'none',
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Drop a recording or type a thought..."
          rows={3}
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
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {['Video', 'Voice', 'Text'].map((mode) => (
              <button
                key={mode}
                onClick={() => mode === 'Video' || mode === 'Voice' ? fileRef.current?.click() : undefined}
                style={{
                  padding: '0.2rem 0.65rem', borderRadius: '4px',
                  border: '1px solid var(--border-light)',
                  background: 'transparent', color: 'var(--text-tertiary)',
                  fontSize: '11px', cursor: 'pointer', transition: 'all 0.15s',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {mode}
              </button>
            ))}
            <input ref={fileRef} type="file" accept="video/*,audio/*,text/plain" onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files) }} style={{ display: 'none' }} />
          </div>
          <button
            onClick={handleTextSubmit}
            disabled={!input.trim() || isUploading}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '30px', height: '30px', borderRadius: '6px',
              background: isUploading ? 'transparent' : input.trim() ? 'var(--accent)' : 'transparent',
              border: `1px solid ${input.trim() || isUploading ? 'transparent' : 'var(--border-light)'}`,
              color: isUploading ? 'var(--accent)' : input.trim() ? '#fff' : 'var(--text-tertiary)',
              cursor: input.trim() && !isUploading ? 'pointer' : 'default',
              transition: 'all 0.2s',
              flexShrink: 0,
            }}
          >
            {isUploading ? <Loader2 size={13} className="animate-spin" /> : uploadSuccess ? <CheckCircle2 size={13} className="text-green-500" /> : <Send size={13} />}
          </button>
        </div>
      </div>

      {/* Drop hint */}
      <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginBottom: '2.5rem', paddingLeft: '0.25rem' }}>
        Drag a video or audio file anywhere to upload ↑
      </p>

      {/* Today's extractions */}
      <section style={{ marginBottom: '3rem' }}>
        <p style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '0.75rem', fontWeight: 600 }}>
          Extracted today —
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {mockExtractions.map((e, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.55rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid transparent',
                transition: 'all 0.15s',
                cursor: 'default',
              }}
              onMouseEnter={(el) => { (el.currentTarget as HTMLDivElement).style.background = 'rgba(124,106,245,0.04)'; (el.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)' }}
              onMouseLeave={(el) => { (el.currentTarget as HTMLDivElement).style.background = 'transparent'; (el.currentTarget as HTMLDivElement).style.borderColor = 'transparent' }}
            >
              <span style={{ fontSize: '13px', flexShrink: 0, width: '18px', textAlign: 'center' }}>{e.emoji}</span>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</span>
              <span style={{
                fontSize: '10px', padding: '0.1rem 0.45rem', borderRadius: '3px',
                background: 'rgba(124,106,245,0.1)', color: 'var(--accent)',
                fontWeight: 500, flexShrink: 0,
              }}>{e.type}</span>
              <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{e.time}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Recent sessions */}
      <section>
        <p style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: '0.75rem', fontWeight: 600 }}>
          Recent sessions —
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {days.map((day, i) => (
            <div
              key={i}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.6rem 0.75rem',
                borderRadius: '6px',
                border: '1px solid transparent',
                transition: 'all 0.15s',
                cursor: 'pointer',
              }}
              onMouseEnter={(el) => { (el.currentTarget as HTMLDivElement).style.background = 'rgba(124,106,245,0.04)'; (el.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-light)' }}
              onMouseLeave={(el) => { (el.currentTarget as HTMLDivElement).style.background = 'transparent'; (el.currentTarget as HTMLDivElement).style.borderColor = 'transparent' }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--text-secondary)' }}>{day.date}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {day.sessions} session{day.sessions !== 1 ? 's' : ''} · {day.entities} entities
                </span>
                <ArrowUpRight size={12} style={{ color: 'var(--text-tertiary)' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}
