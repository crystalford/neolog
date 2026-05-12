/**
 * Vlog detail. Renders the playback, basic metadata, the transcript, and the
 * threads extracted from this vlog. From here the operator can trigger
 * processing (archived vlogs), re-run extraction, or jump to a thread.
 */
'use client'

import { useEffect, useState } from 'react'

interface VlogDetail {
  id: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  recorded_at: string | null
  recorded_at_source: string | null
  thumbnail_url: string | null
  transcript_text: string | null
  pipeline_status: string
  pipeline_error: string | null
  playback_url: string | null
}

interface ThreadRow {
  id: string
  topic: string
  take: string
  key_quotes: string | null
  strength: number | null
  abstracted_topic: string | null
}

export default function VlogDetailPage({ params }: { params: { id: string } }) {
  const [vlog, setVlog] = useState<VlogDetail | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)

  const load = async () => {
    setError(null)
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setVlog(data.vlog)
      setThreads(data.threads || [])
    } catch (e: any) {
      setError(String(e.message || e))
    }
  }

  useEffect(() => { load() }, [params.id])

  const triggerProcess = async () => {
    setProcessing(true)
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}/process`, { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setProcessing(false)
    }
  }

  if (error) return <main><div className="error-row">Error: {error}</div></main>
  if (!vlog) return <main><div className="empty-row"><p style={{ color: 'var(--bone-3)' }}>Loading…</p></div></main>

  const sizeMb = vlog.file_size_bytes ? (vlog.file_size_bytes / 1_000_000).toFixed(1) : null
  const recorded = vlog.recorded_at ? new Date(vlog.recorded_at).toLocaleString() : 'Unknown'
  const status = vlog.pipeline_status
  const isVideo = (vlog.mime_type || '').startsWith('video/')

  return (
    <div className="vlog-detail">
      <a href="/timeline" style={{ fontSize: 12, color: 'var(--bone-3)', display: 'inline-block', marginBottom: 16 }}>← Timeline</a>

      <div className="vplayer">
        {vlog.playback_url && isVideo && (
          <video src={vlog.playback_url} controls poster={vlog.thumbnail_url || undefined} />
        )}
        {vlog.playback_url && !isVideo && (
          <audio src={vlog.playback_url} controls style={{ width: '100%' }} />
        )}
        {!vlog.playback_url && vlog.thumbnail_url && (
          <img src={vlog.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      <h2>{deriveTitle(vlog.original_filename)}</h2>
      <div className="meta-row">
        <span>{recorded}{vlog.recorded_at_source ? ` · ${vlog.recorded_at_source}` : ''}</span>
        {sizeMb && <span>{sizeMb} MB</span>}
        {vlog.mime_type && <span>{vlog.mime_type}</span>}
        <span className="status-pill">{status}</span>
      </div>

      {vlog.pipeline_error && (
        <div className="error-row" style={{ marginBottom: 16 }}>Pipeline error: {vlog.pipeline_error}</div>
      )}

      {(status === 'archived' || status === 'error' || status === 'failed') && (
        <button onClick={triggerProcess} disabled={processing} className="action-btn">
          {processing ? 'Dispatching…' : 'Process now'}
        </button>
      )}

      {vlog.transcript_text && (
        <div className="section">
          <div className="label">Transcript</div>
          <div className="transcript">{vlog.transcript_text}</div>
        </div>
      )}

      {threads.length > 0 && (
        <div className="section">
          <div className="label">{threads.length} thread{threads.length === 1 ? '' : 's'} extracted</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {threads.map(t => {
              const keyQuote = parseFirstQuote(t.key_quotes)
              return (
                <a key={t.id} href={`/thread/${t.id}`} className="tcard thread has-topic" style={{ ['--topic' as any]: 'var(--t-brass)' } as React.CSSProperties}>
                  <div className="t-meta">
                    <span className="type-tag">Thread</span>
                    <span className="sep">·</span>
                    <span className="status">{t.abstracted_topic || t.topic}</span>
                  </div>
                  <div className="t-headline">{t.take}</div>
                  {keyQuote && <div className="quote">{keyQuote}</div>}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}

function parseFirstQuote(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0])
  } catch {}
  return null
}
