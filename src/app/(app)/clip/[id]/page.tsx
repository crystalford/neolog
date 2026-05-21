/**
 * Clip detail — preview, trim, approve, ship. UI staged until clip-publish
 * Workflow ships.
 */
'use client'

import { useEffect, useState } from 'react'

interface ClipDetail {
  id: string
  start_time: number
  end_time: number
  headline: string
  quote: string | null
  why_clippable: string | null
  status: string
  vlog_id: string
}

export default function ClipDetailPage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<ClipDetail | null>(null)
  useEffect(() => {
    fetch(`/api/v2/clips/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { clip: null })
      .then((d: any) => setC(d.clip))
      .catch(() => {})
  }, [params.id])

  if (!c) return <main><div className="empty-row"><p style={{ color: 'var(--fg-3)' }}>Loading…</p></div></main>

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`
  const dur = c.end_time - c.start_time

  return (
    <main>
      <a href="/timeline" className="detail-back">← Timeline</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker" style={{ marginBottom: 12 }}>Clip · {c.status}</div>
          <h1 style={{ fontWeight: 500, fontSize: 26, letterSpacing: '-0.5px', lineHeight: 1.2 }}>{c.headline}</h1>
        </section>

        <div className="section">
          <div className="tcard clip has-topic" style={{ ['--topic' as any]: 'var(--t-sage)' }}>
            <div className="clip-preview">
              <span className="timecode">{fmt(c.start_time)} → {fmt(c.end_time)}</span>
              <div className="play-cue-mid"><div><svg viewBox="0 0 11 11"><path d="M2 1 L9 5.5 L2 10 Z" /></svg></div></div>
              <span className="dur-mid">{fmt(dur)}</span>
            </div>
            {c.quote && <div className="quote-line">{c.quote}</div>}
          </div>
        </div>

        {c.why_clippable && (
          <div className="section">
            <div className="section-label">Why it's clippable</div>
            <p style={{ fontSize: 14, color: 'var(--fg-1)', lineHeight: 1.55, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12, padding: '14px 16px' }}>
              {c.why_clippable}
            </p>
          </div>
        )}

        <div className="section" style={{ paddingBottom: 32, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <a href={`/timeline/${c.vlog_id}`} style={{ padding: '10px 18px', border: '1px solid var(--line-2)', borderRadius: 100, fontSize: 13, color: 'var(--fg-2)' }}>Open source vlog →</a>
          <button onClick={() => alert('Clip publishing ships after the clip-publish Workflow.')} style={{ padding: '10px 18px', border: '1px solid var(--fg-3)', background: 'rgba(236,228,210,0.04)', borderRadius: 100, fontSize: 13, color: 'var(--fg)' }}>Approve + ship</button>
        </div>
      </div>
    </main>
  )
}
