/**
 * Thread detail. Quote-shaped page: transcript span, the take, key quotes,
 * which cluster (if any), related threads, source vlog with playback jump.
 */
'use client'

import { useEffect, useState } from 'react'

interface ThreadDetail {
  id: string
  topic: string
  abstracted_topic: string | null
  take: string
  key_quotes: string[]
  questions_raised: string[]
  register: string | null
  strength: number | null
  transcript_span_start: number | null
  transcript_span_end: number | null
  cluster_id: string | null
  extracted_at: string
  extraction_prompt_version: string
  vlog: { id: string; original_filename: string | null; recorded_at: string | null; thumbnail_url: string | null }
}

export default function ThreadDetailPage({ params }: { params: { id: string } }) {
  const [t, setT] = useState<ThreadDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/threads/${params.id}`, { credentials: 'include' })
      .then(async (r: any) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((d: any) => setT(d.thread))
      .catch(e => setError(String(e.message || e)))
  }, [params.id])

  if (error) return <main><div className="error-row">Error: {error}</div></main>
  if (!t) return <main><div className="empty-row"><p style={{ color: 'var(--bone-3)' }}>Loading…</p></div></main>

  const topicVar = t.abstracted_topic ? `var(--t-${topicTokenFor(t.abstracted_topic)})` : 'var(--bone-3)'
  const sourceLabel = t.transcript_span_start != null
    ? `${Math.floor(t.transcript_span_start / 60)}:${String(Math.floor(t.transcript_span_start % 60)).padStart(2, '0')}`
    : null

  return (
    <main>
      <a href="/timeline" className="detail-back">← Timeline</a>

      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: topicVar }} />
            Thread · {t.abstracted_topic || t.topic}
            {t.register && <span style={{ color: 'var(--bone-5)' }}>·</span>}
            {t.register && <span>{t.register}</span>}
          </div>
          <h1 style={{ fontWeight: 500, fontSize: 28, letterSpacing: '-0.6px', lineHeight: 1.18, marginBottom: 18 }}>{t.take}</h1>
          {t.strength != null && (
            <div className="strength-row" style={{ marginBottom: 14, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 0.5, color: 'var(--bone-3)' }}>
              <span>Strength</span>
              <span className="pips" style={{ display: 'inline-flex', gap: 2, margin: '0 8px' }}>
                {[0, 1, 2, 3, 4].map(i => (
                  <span key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: i < (t.strength ?? 0) ? topicVar : 'var(--bone-4)' }} />
                ))}
              </span>
            </div>
          )}
        </section>

        {t.key_quotes.length > 0 && (
          <div className="section">
            <div className="section-label">Key quotes ({t.key_quotes.length})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {t.key_quotes.map((q, i) => (
                <blockquote key={i} style={{
                  fontSize: 15, lineHeight: 1.55, color: 'var(--bone)',
                  padding: '12px 16px',
                  background: 'var(--ink-2)',
                  borderLeft: `2px solid ${topicVar}`,
                  borderRadius: 8,
                }}>{q}</blockquote>
              ))}
            </div>
          </div>
        )}

        {t.questions_raised.length > 0 && (
          <div className="section">
            <div className="section-label">Questions raised</div>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {t.questions_raised.map((q, i) => (
                <li key={i} style={{ fontSize: 14, color: 'var(--bone-1)', lineHeight: 1.55, paddingLeft: 16, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: 'var(--bone-4)' }}>?</span>
                  {q}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="section">
          <div className="section-label">Source</div>
          <a href={`/timeline/${t.vlog.id}`} className="tcard vlog has-topic" style={{ ['--topic' as any]: topicVar }}>
            <div className="t-meta">
              <span className="type-tag">Vlog</span>
              <span className="sep">·</span>
              <span className="status">{t.vlog.original_filename?.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ') || 'Untitled'}</span>
              {sourceLabel && <span className="time">{sourceLabel}</span>}
            </div>
            <div className="vlog-row">
              <div className="vlog-thumb" style={t.vlog.thumbnail_url ? { backgroundImage: `url(${t.vlog.thumbnail_url})` } : undefined}>
                <div className="play-mini"><div><svg viewBox="0 0 8 8"><path d="M2 1 L7 4 L2 7 Z" /></svg></div></div>
              </div>
              <div className="vlog-info">
                <div className="title">Jump to {sourceLabel ?? 'source'}</div>
                <div className="extracted">{t.vlog.recorded_at ? new Date(t.vlog.recorded_at).toLocaleDateString() : ''}</div>
              </div>
            </div>
          </a>
        </div>

        <div className="section" style={{ paddingBottom: 32 }}>
          <div className="section-label">Provenance</div>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: 1,
            color: 'var(--bone-3)',
            background: 'var(--ink-2)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            padding: '10px 14px',
          }}>
            Extracted {new Date(t.extracted_at).toLocaleString()} · prompt {t.extraction_prompt_version}
          </div>
        </div>
      </div>
    </main>
  )
}

function topicTokenFor(text: string): string {
  // Cheap deterministic mapping — until topic_color is actually stored on threads.
  const tokens = ['brass', 'terra', 'ochre', 'rose', 'plum', 'violet', 'steel', 'teal', 'sage', 'moss']
  let h = 0
  for (let i = 0; i < text.length; i++) h = ((h << 5) - h + text.charCodeAt(i)) | 0
  return tokens[Math.abs(h) % tokens.length]
}
