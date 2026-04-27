'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = {
  bg:          '#070706',
  bgSurface:   '#0e0d0b',
  bgRaised:    '#141210',
  border:      '#1e1b16',
  borderBright:'#2c2820',
  amber:       '#C8902A',
  amberDim:    '#7a5618',
  amberBright: '#E8A840',
  amberGlow:   'rgba(200,144,42,0.09)',
  textPrimary: '#EDE3CC',
  textSecond:  '#9A8E78',
  textDim:     '#5A5040',
  textDimmer:  '#2e2820',
  green:       '#4A8A60',
  blue:        '#4870A8',
  red:         '#8A4040',
}

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

// ── Terminal animation ───────────────────────────────────────────────────────

type TermLine = {
  text: string
  color?: string
  delay: number
  cursor?: boolean
}

const LINES: TermLine[] = [
  { text: '$ neolog ingest morning_dump_apr26.mov',         delay: 300 },
  { text: '  ↳ extracting audio…',                         delay: 1000, color: C.textDim },
  { text: '  ↳ transcribing (whisper-1) · 4m 32s · 847w', delay: 1700, color: C.textDim },
  { text: '  ✓ transcript complete',                        delay: 2700, color: C.green },
  { text: '  ↳ analysis via claude-sonnet-4-6…',           delay: 3100, color: C.textDim },
  { text: '  ✓ 3 ideas  ·  2 projects  ·  4 actions',      delay: 4400, color: C.green },
  { text: '  ✓ entities updated: Neolog +3  ·  Studio +1', delay: 4900, color: C.green },
  { text: '  ✓ 2 post candidates queued',                   delay: 5300, color: C.green },
  { text: '  → studio: 1 idea ready to develop',            delay: 5800, color: C.amberBright },
  { text: '',                                                delay: 6400 },
  { text: '$ brain status',                                  delay: 6700 },
  { text: '  sessions: 47  ·  entities: 89  ·  posts: 12', delay: 7200, color: C.textSecond },
  { text: '  energy: ↑ high this week',                     delay: 7600, color: C.textSecond },
  { text: '  3 ideas marinating  ·  2 blockers flagged',    delay: 8000, color: C.textSecond },
  { text: '',                                                delay: 8500 },
  { text: '$ _',                                             delay: 8800, cursor: true },
]

function Terminal() {
  const [visible, setVisible] = useState(0)

  useEffect(() => {
    if (visible >= LINES.length) return
    const t = setTimeout(() => setVisible(v => v + 1), LINES[visible].delay - (visible > 0 ? LINES[visible - 1].delay : 0))
    return () => clearTimeout(t)
  }, [visible])

  return (
    <div style={{
      background: '#030302',
      border: `1px solid ${C.borderBright}`,
      padding: '20px 22px',
      ...mono,
      fontSize: 11,
      lineHeight: 1.8,
      minHeight: 320,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[C.red, C.amber, C.green].map((col, i) => (
          <div key={i} style={{ width: 9, height: 9, borderRadius: '50%', background: col, opacity: 0.6 }} />
        ))}
      </div>
      {LINES.slice(0, visible).map((line, i) => (
        <div key={i} style={{ color: line.color ?? C.textPrimary, whiteSpace: 'pre' as const }}>
          {line.cursor ? (
            <span>
              {'$ '}
              <span style={{ borderRight: `2px solid ${C.amber}`, animation: 'blink 1s step-end infinite' }}>&nbsp;</span>
            </span>
          ) : line.text}
        </div>
      ))}
    </div>
  )
}

// ── Outputs grid ─────────────────────────────────────────────────────────────

const OUTPUTS = [
  {
    label: 'Brain',
    accent: C.amber,
    desc: 'Every entity, pattern, blocker and idea accumulated across all your recordings into six cognitive regions.',
    items: ['Entity graph', 'Recurring themes', 'Energy trends', 'Conflict detection'],
  },
  {
    label: 'Studio',
    accent: C.green,
    desc: 'From recorded idea to structured script to produced video in a single pipeline. No timeline editing.',
    items: ['AI debrief', 'Style cards', 'Claude-written script', 'Video production'],
  },
  {
    label: 'Posts',
    accent: C.blue,
    desc: 'Quotes, opinions and ideas surface automatically as post candidates ready for your social queue.',
    items: ['Auto-surfaced from analysis', 'One-click to queue', 'X / Twitter publish'],
  },
  {
    label: 'Timeline',
    accent: C.textDim,
    desc: 'Every word you\'ve ever recorded, fully searchable, in chronological order. Your permanent transcript record.',
    items: ['Full-text search', 'Session detail view', 'Linked to entities'],
  },
]

// ── Pipeline steps ────────────────────────────────────────────────────────────

const PIPELINE = [
  { step: '01', label: 'Record', desc: 'iPhone video, voice note, screen recording — anything up to 5 GB.' },
  { step: '02', label: 'Process', desc: 'Whisper transcribes. Claude extracts ideas, projects, decisions, actions.' },
  { step: '03', label: 'Accumulate', desc: 'Entities get richer with every session. Patterns emerge over weeks.' },
  { step: '04', label: 'Debrief', desc: 'Open Studio. Talk to your AI producer. Pick the idea worth making.' },
  { step: '05', label: 'Produce', desc: 'Style card + script + video assembly. Publish to your platforms.' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.textPrimary, ...mono }}>
      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
      `}</style>

      {/* Nav */}
      <nav style={{
        height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', borderBottom: `1px solid ${C.border}`,
        background: C.bgSurface, position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 17, letterSpacing: -0.5 }}>
          NEO<span style={{ color: C.amber }}>LOG</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Link href="/login" style={{ ...mono, fontSize: 9, letterSpacing: 2, color: C.textDim, textDecoration: 'none', padding: '7px 14px', border: `1px solid ${C.border}`, textTransform: 'uppercase' as const }}>
            Sign in
          </Link>
          <Link href="/login" style={{ ...mono, fontSize: 9, letterSpacing: 2, color: C.bg, textDecoration: 'none', padding: '7px 14px', background: C.amber, fontWeight: 700, textTransform: 'uppercase' as const }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '72px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' as const, marginBottom: 22 }}>
              Personal intelligence system
            </div>
            <h1 style={{
              fontFamily: "'Syne', sans-serif", fontWeight: 800,
              fontSize: 'clamp(36px, 4.5vw, 58px)', lineHeight: 1.05,
              letterSpacing: -1, margin: '0 0 22px', color: C.textPrimary,
            }}>
              Record yourself<br />thinking.<br />
              <span style={{ color: C.amber }}>Neolog handles<br />the rest.</span>
            </h1>
            <p style={{ fontSize: 13, color: C.textSecond, lineHeight: 1.75, maxWidth: 420, margin: '0 0 36px' }}>
              Drop in a video brain-dump. Neolog transcribes it, extracts every idea and entity,
              writes a script from the strongest one, and queues posts for your platforms — automatically.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
              <Link href="/login" style={{ ...mono, fontSize: 10, letterSpacing: 2, textDecoration: 'none', padding: '12px 26px', background: C.amber, color: C.bg, fontWeight: 700, textTransform: 'uppercase' as const }}>
                Open Neolog →
              </Link>
              <Link href="/login" style={{ ...mono, fontSize: 10, letterSpacing: 2, textDecoration: 'none', padding: '12px 26px', border: `1px solid ${C.border}`, color: C.textDim, textTransform: 'uppercase' as const }}>
                Sign in
              </Link>
            </div>
            <div style={{ marginTop: 28, display: 'flex', gap: 28 }}>
              {[['BYOK', 'Your API keys'], ['Edge', 'Cloudflare runtime'], ['4 GB+', 'Video uploads']].map(([val, label]) => (
                <div key={val}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.amberBright }}>{val}</div>
                  <div style={{ fontSize: 8, letterSpacing: 1, color: C.textDimmer, marginTop: 2 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Terminal />
          </div>
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* What it produces */}
      <section style={{ padding: '64px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' as const, marginBottom: 36 }}>
          What you get
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {OUTPUTS.map(o => (
            <div key={o.label} style={{ background: C.bgSurface, border: `1px solid ${C.border}`, borderTop: `2px solid ${o.accent}`, padding: '20px 18px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: o.accent, fontFamily: "'Syne', sans-serif", marginBottom: 10 }}>{o.label}</div>
              <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.6, marginBottom: 14 }}>{o.desc}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {o.items.map(item => (
                  <div key={item} style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
                    <div style={{ width: 4, height: 4, background: o.accent, opacity: 0.6, flexShrink: 0 }} />
                    <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5 }}>{item}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* Pipeline */}
      <section style={{ padding: '64px 48px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' as const, marginBottom: 36 }}>
          The pipeline
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0 }}>
          {PIPELINE.map((p, i) => (
            <div key={p.step} style={{ padding: '0 20px 0 0', borderLeft: i > 0 ? `1px solid ${C.border}` : 'none', paddingLeft: i > 0 ? 20 : 0 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: C.amberDim, marginBottom: 10 }}>{p.step}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary, fontFamily: "'Syne', sans-serif", marginBottom: 8 }}>{p.label}</div>
              <div style={{ fontSize: 10, color: C.textSecond, lineHeight: 1.6 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* CTA */}
      <section style={{ padding: '72px 48px', textAlign: 'center' as const }}>
        <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 'clamp(26px, 3.5vw, 44px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 18 }}>
          Stop losing your best thinking.
        </div>
        <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 32, maxWidth: 420, margin: '0 auto 32px' }}>
          Every recording becomes a permanent, searchable, producible record.
        </div>
        <Link href="/login" style={{ ...mono, fontSize: 10, letterSpacing: 2, textDecoration: 'none', padding: '13px 32px', background: C.amber, color: C.bg, fontWeight: 700, textTransform: 'uppercase' as const }}>
          Start recording →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: `1px solid ${C.border}`, padding: '18px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.bgSurface, flexWrap: 'wrap' as const, gap: 8 }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' as const }}>Neolog © 2026</span>
        <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' as const }}>BYOK · Edge runtime · Your data</span>
      </footer>
    </div>
  )
}
