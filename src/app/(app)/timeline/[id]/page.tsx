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
  const [tier, setTier] = useState<'free' | 'premium' | 'max'>('free')
  const [passes, setPasses] = useState<Set<'threads' | 'clip_candidates' | 'creative_elements' | 'entities'>>(
    new Set(['threads', 'clip_candidates', 'creative_elements', 'entities']),
  )

  const COST: Record<'free' | 'premium' | 'max', Record<string, number>> = {
    free:    { threads: 0.0006, clip_candidates: 0.0006, creative_elements: 0.0006, entities: 0.0006 },
    premium: { threads: 0.040,  clip_candidates: 0.0006, creative_elements: 0.040,  entities: 0.0006 },
    max:     { threads: 0.040,  clip_candidates: 0.040,  creative_elements: 0.040,  entities: 0.040 },
  }
  const estCost = Array.from(passes).reduce((sum, p) => sum + (COST[tier][p] ?? 0), 0)
  const fmtCost = (n: number) => n < 0.01 ? '<$0.01' : `$${n.toFixed(n < 1 ? 2 : 2)}`

  const load = async () => {
    setError(null)
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: any = await r.json()
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
      const r = await fetch(`/api/v2/vlogs/${params.id}/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, passes: Array.from(passes) }),
      })
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

      <div className="section">
        <div className="label">Re-extract</div>
        <p style={{ fontSize: 13, color: 'var(--bone-2)', marginBottom: 12 }}>
          Pick the tier and which passes to re-run. Workers AI Llama is essentially free; Claude Sonnet is higher quality where voice nuance matters.
        </p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {([
            ['free',    'Free',    'Llama 70B'],
            ['premium', 'Premium', 'Sonnet for threads + creative'],
            ['max',     'Max',     'Sonnet for all 4'],
          ] as const).map(([k, label, sub]) => (
            <button
              key={k}
              onClick={() => setTier(k)}
              className={`fchip ${tier === k ? 'active' : ''}`}
              style={{ padding: '8px 14px', flexDirection: 'column', alignItems: 'flex-start' }}
              title={sub}
            >{label}</button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['threads', 'clip_candidates', 'creative_elements', 'entities'] as const).map(p => {
            const on = passes.has(p)
            const labelMap = { threads: 'Threads', clip_candidates: 'Clips', creative_elements: 'Creative', entities: 'Entities' }
            return (
              <button
                key={p}
                onClick={() => {
                  const next = new Set(passes)
                  on ? next.delete(p) : next.add(p)
                  setPasses(next)
                }}
                className={`fchip ${on ? 'active' : ''}`}
              >
                {labelMap[p]} <span className="num">{fmtCost(COST[tier][p])}</span>
              </button>
            )
          })}
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 16px',
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          marginBottom: 16,
        }}>
          <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.5, color: 'var(--bone-3)' }}>
            ESTIMATED COST
          </div>
          <div style={{ fontWeight: 500, color: 'var(--bone)' }}>{fmtCost(estCost)}</div>
        </div>

        <button onClick={triggerProcess} disabled={processing || passes.size === 0} className="action-btn">
          {processing ? 'Dispatching…' : `Re-extract · ${fmtCost(estCost)}`}
        </button>
      </div>

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
