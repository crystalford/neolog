'use client'

/**
 * Transcript — the cross-vlog transcript timeline.
 *
 * Every vlog with a transcript_text, ordered by recorded_at descending,
 * rendered as collapsible blocks. The operator can scroll through their
 * own words across days/weeks/months without bouncing between detail
 * pages. Click the date header to expand/collapse a block.
 *
 * No new queries — uses the existing /api/v2/vlogs?limit=500 list endpoint
 * (which returns has_transcript) and fetches transcript_text per-vlog
 * lazily when the operator expands a block.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons } from '@/components/Shell'

interface VlogRow {
  id: string
  original_filename: string | null
  recorded_at: string | null
  uploaded_at: string
  duration_seconds: number | null
  file_size_bytes: number | null
  pipeline_status: string
  has_transcript?: 0 | 1 | boolean
  summary?: string | null
}

export default function TranscriptPage() {
  const [vlogs, setVlogs] = useState<VlogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const [transcripts, setTranscripts] = useState<Record<string, string | null>>({})
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then((d: any) => {
        const all: VlogRow[] = d.vlogs ?? []
        // Only vlogs with a transcript are worth showing here.
        const withTranscript = all.filter(v => v.has_transcript)
        // Sort by recorded_at desc (or uploaded_at fallback)
        withTranscript.sort((a, b) => {
          const at = a.recorded_at ? new Date(a.recorded_at).getTime() : new Date(a.uploaded_at).getTime()
          const bt = b.recorded_at ? new Date(b.recorded_at).getTime() : new Date(b.uploaded_at).getTime()
          return bt - at
        })
        setVlogs(withTranscript)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const toggle = async (id: string) => {
    const next = new Set(openIds)
    if (next.has(id)) {
      next.delete(id)
      setOpenIds(next)
      return
    }
    next.add(id)
    setOpenIds(next)
    // Fetch transcript text lazily on first expand.
    if (transcripts[id] === undefined) {
      const loading = new Set(loadingIds); loading.add(id); setLoadingIds(loading)
      try {
        const r = await fetch(`/api/v2/vlogs/${id}`, { credentials: 'include' })
        const d: any = r.ok ? await r.json() : null
        setTranscripts(prev => ({ ...prev, [id]: d?.vlog?.transcript_text ?? null }))
      } finally {
        const done = new Set(loadingIds); done.delete(id); setLoadingIds(done)
      }
    }
  }

  return (
    <Shell active="transcript" breadcrumb={['Transcript']}>
      <div className="pad" style={{ maxWidth: 880, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="h1-row">
          <div>
            <h1>Transcript</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 6 }}>
              Every vlog you've transcribed, oldest at the bottom. Click a date to read the full text.
            </p>
          </div>
        </div>

        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : vlogs.length === 0 ? (
          <div className="empty">
            <div className="ico">{NavIcons.Vlogs}</div>
            <h3>No transcribed vlogs yet</h3>
            <p>The transcript timeline fills in as you upload + transcribe vlogs. Drop one on Capture to seed it.</p>
            <Link href="/capture" className="btn primary"><span className="ico">{NavIcons.Plus}</span>Add vlog</Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 24 }}>
            {vlogs.map(v => {
              const isOpen = openIds.has(v.id)
              const isLoading = loadingIds.has(v.id)
              const t = transcripts[v.id]
              const date = v.recorded_at ? new Date(v.recorded_at) : new Date(v.uploaded_at)
              return (
                <article key={v.id} style={{
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}>
                  <button
                    onClick={() => toggle(v.id)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 14,
                      padding: '12px 16px',
                      background: 'transparent',
                      textAlign: 'left',
                      cursor: 'pointer',
                    }}
                  >
                    <span className="mono" style={{
                      fontSize: 11, color: 'var(--fg-3)',
                      textTransform: 'uppercase', letterSpacing: 0.5,
                      minWidth: 130,
                    }}>
                      {date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {' · '}
                      {date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })}
                    </span>
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--fg-1)' }}>
                      {v.original_filename ?? v.id}
                    </span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--fg-4)' }}>
                      {isOpen ? '▼' : '▶'}
                    </span>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 16px 16px' }}>
                      {v.summary && (
                        <div style={{
                          fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6,
                          paddingLeft: 12, borderLeft: '2px solid var(--accent)',
                          marginBottom: 12,
                          fontStyle: 'italic',
                        }}>
                          {v.summary}
                        </div>
                      )}
                      {isLoading && <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>Loading transcript…</div>}
                      {!isLoading && t === null && <div style={{ color: 'var(--fg-3)', fontSize: 12 }}>(no transcript)</div>}
                      {!isLoading && t && (
                        <div className="transcript" style={{ marginTop: 8 }}>{t}</div>
                      )}
                      <div style={{ marginTop: 12 }}>
                        <Link href={`/timeline/${v.id}`} className="btn ghost small">Open vlog →</Link>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
