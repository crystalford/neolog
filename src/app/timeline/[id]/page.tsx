/**
 * Timeline detail page — one vlog with its transcript and extracted threads.
 *
 * Reads from /api/v2/vlogs/[id]. The legacy /dashboard/timeline/[id] keeps
 * working off Supabase until cutover.
 */

'use client'
export const runtime = 'edge'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { INK, BONE, STATE, FONT_BODY, FONT_MONO, topicColorFor } from '@/lib/design'

interface Vlog {
  id: string
  operator_id: string
  r2_key: string
  transcoded_r2_key: string | null
  original_filename: string
  file_size_bytes: number
  mime_type: string
  duration_seconds: number | null
  recorded_at: string | null
  recorded_at_source: string | null
  uploaded_at: string
  thumbnail_url: string | null
  transcript_text: string | null
  transcript_provider: string | null
  pipeline_status: string
  pipeline_error: string | null
  visibility: string
}

interface Thread {
  id: string
  topic: string
  take: string | null
  register: string | null
  strength: number | null
  transcript_span_start: number | null
  transcript_span_end: number | null
  extracted_at: string
}

function formatDuration(secs: number | null) {
  if (!secs || secs <= 0) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function VlogDetailPage() {
  const { id } = useParams<{ id: string }>()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)

  const [vlog, setVlog] = useState<Vlog | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  async function loadData() {
    try {
      const res = await fetch(`/api/v2/vlogs/${id}`)
      if (!res.ok) {
        if (res.status === 404) throw new Error('Vlog not found')
        throw new Error(`HTTP ${res.status}`)
      }
      const data = await res.json()
      setVlog(data.vlog)
      setVideoUrl(data.video_url)
      setThreads(data.threads || [])
      setLoading(false)
    } catch (err: any) {
      setError(err.message || 'Failed to load')
      setLoading(false)
    }
  }

  useEffect(() => { loadData() /* eslint-disable-line react-hooks/exhaustive-deps */ }, [id])

  // Poll while processing
  useEffect(() => {
    if (!vlog) return
    if (['complete', 'archived', 'failed'].includes(vlog.pipeline_status)) return
    const t = setInterval(loadData, 5000)
    return () => clearInterval(t)
  /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [vlog?.pipeline_status])

  async function triggerProcess() {
    setProcessing(true)
    try {
      const res = await fetch(`/api/v2/vlogs/${id}/process`, { method: 'POST' })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Process failed')
    } finally {
      setProcessing(false)
    }
  }

  const isAudio = vlog?.mime_type?.startsWith('audio/')
  const isArchived = vlog?.pipeline_status === 'archived'
  const isProcessing = vlog && !['complete', 'archived', 'failed'].includes(vlog.pipeline_status)
  const isError = vlog?.pipeline_status === 'failed'

  return (
    <div style={{
      minHeight: '100vh',
      background: INK.bg,
      color: BONE.bone,
      fontFamily: FONT_BODY,
      padding: '20px 24px 80px',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <Link
          href="/timeline"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 2,
            color: BONE.bone3,
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Timeline
        </Link>

        {loading && (
          <div style={{ fontFamily: FONT_MONO, fontSize: 11, letterSpacing: 2, color: BONE.bone4, textTransform: 'uppercase' }}>
            LOADING…
          </div>
        )}

        {!loading && (error || !vlog) && (
          <div style={{ color: STATE.err, fontSize: 13 }}>
            {error || 'Not found.'}
          </div>
        )}

        {!loading && vlog && (
          <>
            <div style={{ marginBottom: 24 }}>
              <div style={{
                fontFamily: FONT_MONO,
                fontSize: 10,
                letterSpacing: 2,
                color: BONE.bone3,
                textTransform: 'uppercase',
                marginBottom: 4,
              }}>
                {new Date(vlog.recorded_at || vlog.uploaded_at).toLocaleString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
                {vlog.recorded_at_source && (
                  <span style={{ marginLeft: 8, opacity: 0.6 }}>· {vlog.recorded_at_source}</span>
                )}
              </div>
              <h1 style={{
                fontWeight: 500,
                fontSize: 20,
                color: BONE.bone,
                margin: 0,
                letterSpacing: '-0.01em',
              }}>
                {vlog.original_filename.replace(/\.[^.]+$/, '')}
                {formatDuration(vlog.duration_seconds) && (
                  <span style={{ color: BONE.bone3, fontWeight: 400, marginLeft: 10, fontSize: 16 }}>
                    · {formatDuration(vlog.duration_seconds)}
                  </span>
                )}
              </h1>

              {/* Status */}
              <div style={{ marginTop: 8, fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                {isArchived && <span style={{ color: BONE.bone3 }}>Archived · not yet processed</span>}
                {isProcessing && <span style={{ color: STATE.warn }}>{vlog.pipeline_status.replace(/_/g, ' ')}…</span>}
                {isError && <span style={{ color: STATE.err }}>Error{vlog.pipeline_error ? `: ${vlog.pipeline_error}` : ''}</span>}
                {vlog.pipeline_status === 'complete' && <span style={{ color: STATE.ok }}>Complete</span>}
              </div>

              {isArchived && (
                <button
                  onClick={triggerProcess}
                  disabled={processing}
                  style={{
                    marginTop: 12,
                    fontFamily: FONT_MONO,
                    fontSize: 10,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    padding: '7px 14px',
                    background: 'transparent',
                    color: processing ? BONE.bone3 : BONE.bone,
                    border: `1px solid ${BONE.bone3}`,
                    cursor: processing ? 'wait' : 'pointer',
                  }}
                >
                  {processing ? 'Queueing…' : 'Process now → transcribe + extract'}
                </button>
              )}
            </div>

            {/* Player */}
            {videoUrl && (
              <div style={{
                marginBottom: 28,
                background: '#000',
                border: `1px solid ${INK.line}`,
              }}>
                {isAudio ? (
                  <audio
                    ref={mediaRef as React.RefObject<HTMLAudioElement>}
                    controls
                    src={videoUrl}
                    style={{ width: '100%', display: 'block' }}
                  />
                ) : (
                  <video
                    ref={mediaRef as React.RefObject<HTMLVideoElement>}
                    controls
                    src={videoUrl}
                    poster={vlog.thumbnail_url || undefined}
                    style={{ width: '100%', display: 'block' }}
                  />
                )}
              </div>
            )}

            {/* Threads */}
            {threads.length > 0 && (
              <section style={{ marginBottom: 28 }}>
                <div style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: BONE.bone3,
                  marginBottom: 12,
                }}>
                  Threads · {threads.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {threads.map(t => (
                    <ThreadRow key={t.id} thread={t} onJump={s => {
                      if (mediaRef.current && typeof s === 'number') {
                        mediaRef.current.currentTime = s
                        mediaRef.current.play().catch(() => null)
                      }
                    }} />
                  ))}
                </div>
              </section>
            )}

            {/* Transcript */}
            {vlog.transcript_text && (
              <section>
                <div style={{
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: BONE.bone3,
                  marginBottom: 12,
                }}>
                  Transcript
                </div>
                <div style={{
                  fontSize: 14,
                  lineHeight: 1.7,
                  color: BONE.bone1,
                  whiteSpace: 'pre-wrap',
                }}>
                  {vlog.transcript_text}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function ThreadRow({ thread, onJump }: { thread: Thread; onJump: (start: number | null) => void }) {
  const color = topicColorFor(thread.topic)
  const strengthDots = '●'.repeat(thread.strength || 1) + '○'.repeat(5 - (thread.strength || 1))
  return (
    <div style={{
      padding: '12px 14px',
      background: INK.ink,
      border: `1px solid ${INK.ink3}`,
      borderLeft: `2px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 2, color, textTransform: 'uppercase' }}>
          {thread.register || 'thread'}
        </span>
        <span style={{ fontFamily: FONT_MONO, fontSize: 9, letterSpacing: 1, color: BONE.bone3 }}>
          {strengthDots}
        </span>
        <span style={{ flex: 1 }} />
        {thread.transcript_span_start != null && (
          <button
            onClick={() => onJump(thread.transcript_span_start)}
            style={{
              fontFamily: FONT_MONO,
              fontSize: 9,
              letterSpacing: 1,
              color: BONE.bone2,
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ▶ {Math.floor(thread.transcript_span_start)}s
          </button>
        )}
      </div>
      <div style={{ fontSize: 13, color: BONE.bone, marginBottom: 4 }}>{thread.topic}</div>
      {thread.take && (
        <div style={{ fontSize: 13, color: BONE.bone1, fontStyle: 'italic' }}>
          {thread.take}
        </div>
      )}
    </div>
  )
}
