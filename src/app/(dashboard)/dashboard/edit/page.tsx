'use client'

export const runtime = 'edge'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
  red:          '#8A4040',
}

type Segment = {
  upload_id: string
  upload_name: string
  start: number
  end: number
  reason: string
  quote: string
}

type Plan = {
  title: string
  segments: Segment[]
}

type Phase = 'input' | 'planning' | 'review' | 'assembling' | 'done' | 'error'

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function EditPage() {
  const supabase = createClient()
  const [phase, setPhase] = useState<Phase>('input')
  const [topic, setTopic] = useState('')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [productionId, setProductionId] = useState<string | null>(null)
  const [productionStatus, setProductionStatus] = useState<string>('queued')
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll production status while assembling
  useEffect(() => {
    if (phase !== 'assembling' || !productionId) return

    pollRef.current = setInterval(async () => {
      const res = await fetch(`/api/studio/production-status?id=${productionId}`)
      if (!res.ok) return
      const data = await res.json()
      setProductionStatus(data.status)

      if (data.status === 'done') {
        clearInterval(pollRef.current!)
        setPhase('done')
      } else if (data.status === 'error') {
        clearInterval(pollRef.current!)
        setError(data.error_message ?? 'Assembly failed')
        setPhase('error')
      }
    }, 4000)

    return () => clearInterval(pollRef.current!)
  }, [phase, productionId])

  const handlePlan = async () => {
    setPhase('planning')
    setError(null)
    try {
      const res = await fetch('/api/edit/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Planning failed'); setPhase('error'); return }
      setPlan(data)
      setPhase('review')
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }

  const handleAssemble = async () => {
    if (!plan) return
    setPhase('assembling')
    setError(null)
    try {
      const res = await fetch('/api/edit/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: topic.trim() || null, segments: plan.segments }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Assembly failed'); setPhase('error'); return }
      setProductionId(data.production_id)
    } catch (e: any) {
      setError(e.message)
      setPhase('error')
    }
  }

  const handleDownload = async () => {
    if (!productionId) return
    const res = await fetch(`/api/edit/download?id=${productionId}`)
    const data = await res.json()
    if (data.url) setDownloadUrl(data.url)
  }

  const handleReset = () => {
    setPlan(null)
    setProductionId(null)
    setProductionStatus('queued')
    setDownloadUrl(null)
    setError(null)
    setPhase('input')
  }

  const totalDuration = plan
    ? plan.segments.reduce((acc, s) => acc + (s.end - s.start), 0)
    : 0

  return (
    <div style={{ height: '100vh', overflowY: 'auto', fontFamily: "'JetBrains Mono', monospace" }}>
      {/* Header */}
      <div style={{ padding: '24px 40px 20px', borderBottom: `1px solid ${C.border}`, background: C.bgSurface }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary, marginBottom: 4 }}>
          Auto-Edit
        </div>
        <div style={{ fontSize: 11, color: C.textSecond }}>
          AI picks your best moments across all vlogs and assembles them into a finished video.
        </div>
      </div>

      <div style={{ maxWidth: 780, padding: '32px 40px 60px' }}>

        {/* ── Phase: Input ── */}
        {(phase === 'input' || phase === 'planning') && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 12 }}>
              Topic
            </div>
            <input
              value={topic}
              onChange={e => setTopic(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && phase === 'input' && handlePlan()}
              placeholder="e.g. 'building in public', 'lessons learned', or leave blank for best-of"
              style={{
                width: '100%', background: C.bgRaised, border: `1px solid ${C.border}`,
                color: C.textPrimary, fontSize: 13, padding: '11px 14px',
                outline: 'none', fontFamily: "'JetBrains Mono', monospace",
                boxSizing: 'border-box', marginBottom: 20,
              }}
              disabled={phase === 'planning'}
            />
            <button
              onClick={handlePlan}
              disabled={phase === 'planning'}
              style={{
                background: C.amber, border: `1px solid ${C.amber}`,
                color: C.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                padding: '10px 24px', cursor: phase === 'planning' ? 'default' : 'pointer',
                opacity: phase === 'planning' ? 0.6 : 1,
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              {phase === 'planning' ? 'ANALYZING VLOGS…' : 'GENERATE PLAN →'}
            </button>
            <div style={{ fontSize: 9, color: C.textDimmer, letterSpacing: 1, marginTop: 12 }}>
              Scans all processed uploads · picks best {topic.trim() ? 'topic' : 'moments'} · ~10 seconds
            </div>
          </div>
        )}

        {/* ── Phase: Review plan ── */}
        {phase === 'review' && plan && (
          <div>
            <div style={{ marginBottom: 28 }}>
              <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 6 }}>
                Proposed Edit
              </div>
              <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 18, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>
                {plan.title}
              </div>
              <div style={{ fontSize: 10, color: C.textDim }}>
                {plan.segments.length} clips · ~{fmt(totalDuration)} total
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 28 }}>
              {plan.segments.map((seg, i) => (
                <div
                  key={i}
                  style={{
                    padding: '14px 16px', background: C.bgSurface, border: `1px solid ${C.border}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
                    <div style={{ fontSize: 11, color: C.textPrimary, fontWeight: 600 }}>
                      {seg.upload_name}
                    </div>
                    <div style={{ fontSize: 9, color: C.amber, flexShrink: 0, letterSpacing: 1 }}>
                      {fmt(seg.start)} – {fmt(seg.end)} · {fmt(seg.end - seg.start)}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: C.textSecond, marginBottom: seg.quote ? 6 : 0, lineHeight: 1.5 }}>
                    {seg.reason}
                  </div>
                  {seg.quote && (
                    <div style={{ fontSize: 10, color: C.textDim, fontStyle: 'italic', lineHeight: 1.5 }}>
                      "{seg.quote}"
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <button
                onClick={handleAssemble}
                style={{
                  background: C.amber, border: `1px solid ${C.amber}`,
                  color: C.bg, fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  padding: '10px 24px', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                ASSEMBLE →
              </button>
              <button
                onClick={handleReset}
                style={{
                  background: 'none', border: `1px solid ${C.borderBright}`,
                  color: C.textDim, fontSize: 10, letterSpacing: 2,
                  padding: '10px 18px', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                START OVER
              </button>
            </div>
          </div>
        )}

        {/* ── Phase: Assembling ── */}
        {phase === 'assembling' && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 16 }}>
              Assembling
            </div>
            <div style={{ padding: '24px', border: `1px solid ${C.border}`, background: C.bgSurface, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: C.amber, animation: 'pulse 1.5s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 11, color: C.textPrimary, letterSpacing: 1 }}>
                  {productionStatus === 'queued' ? 'Queued — waiting for worker…' : 'Cutting and assembling clips…'}
                </span>
              </div>
              <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.6 }}>
                {plan && `"${plan.title}" · ${plan.segments.length} clips`}
              </div>
              <div style={{ fontSize: 9, color: C.textDimmer, marginTop: 8, letterSpacing: 1 }}>
                This takes 5–15 minutes depending on clip count and length.
              </div>
            </div>
          </div>
        )}

        {/* ── Phase: Done ── */}
        {phase === 'done' && (
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.green, textTransform: 'uppercase', marginBottom: 16 }}>
              Ready
            </div>
            <div style={{ padding: '20px 24px', border: `1px solid ${C.green}30`, background: `${C.green}08`, marginBottom: 24 }}>
              <div style={{ fontSize: 13, color: C.textPrimary, marginBottom: 8, fontFamily: "'Syne', sans-serif", fontWeight: 700 }}>
                {plan?.title ?? 'Auto-Edit Complete'}
              </div>
              <div style={{ fontSize: 10, color: C.textSecond }}>
                {plan?.segments.length} clips · ~{fmt(totalDuration)} · assembled and ready to download
              </div>
            </div>

            {downloadUrl ? (
              <a
                href={downloadUrl}
                download
                style={{
                  display: 'inline-block', background: C.green, border: `1px solid ${C.green}`,
                  color: '#fff', fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  padding: '10px 24px', cursor: 'pointer', textDecoration: 'none',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                DOWNLOAD MP4 ↓
              </a>
            ) : (
              <button
                onClick={handleDownload}
                style={{
                  background: C.green, border: `1px solid ${C.green}`,
                  color: '#fff', fontSize: 11, letterSpacing: 2, fontWeight: 700,
                  padding: '10px 24px', cursor: 'pointer',
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                GET DOWNLOAD LINK →
              </button>
            )}

            <button
              onClick={handleReset}
              style={{
                background: 'none', border: 'none',
                color: C.textDimmer, fontSize: 9, letterSpacing: 2,
                padding: '16px 0 0', cursor: 'pointer', display: 'block',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              Make another edit
            </button>
          </div>
        )}

        {/* ── Phase: Error ── */}
        {phase === 'error' && (
          <div>
            <div style={{ padding: '16px 20px', border: `1px solid ${C.red}40`, background: `${C.red}10`, marginBottom: 20 }}>
              <div style={{ fontSize: 10, color: '#CC6666', marginBottom: 4, letterSpacing: 1 }}>ERROR</div>
              <div style={{ fontSize: 11, color: C.textSecond }}>{error}</div>
            </div>
            <button
              onClick={handleReset}
              style={{
                background: 'none', border: `1px solid ${C.borderBright}`,
                color: C.textDim, fontSize: 10, letterSpacing: 2,
                padding: '9px 18px', cursor: 'pointer',
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              TRY AGAIN
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
