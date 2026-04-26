'use client'

export const runtime = 'edge'

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
}

const mono: React.CSSProperties = { fontFamily: "'JetBrains Mono', monospace" }

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      ...mono,
      fontSize: 9, letterSpacing: 2, color: C.amber,
      background: `${C.amber}12`, border: `1px solid ${C.amber}25`,
      padding: '3px 10px', textTransform: 'uppercase' as const, fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

const STEPS = [
  {
    num: '01',
    title: 'Record',
    body: 'iPhone video, voice note, or screen recording. Anything. Drop it in and Neolog handles the rest.',
  },
  {
    num: '02',
    title: 'Analyse',
    body: 'Claude transcribes and extracts every idea, project, decision, quote, and action item. Entities accumulate across sessions.',
  },
  {
    num: '03',
    title: 'Debrief',
    body: 'Open Studio. Talk to your AI producer about the session — it surfaces the strongest ideas and helps you choose what to make.',
  },
  {
    num: '04',
    title: 'Produce',
    body: 'Pick a style card, approve the script, hit Produce. Neolog generates the video and queues posts for every platform.',
  },
]

const FEATURES = [
  { label: 'BYOK', desc: 'Your OpenAI and Anthropic keys. Zero markup.' },
  { label: 'TUS upload', desc: '4 GB+ iPhone videos over resumable upload.' },
  { label: 'Entity graph', desc: 'Projects, people, goals — richer with every recording.' },
  { label: 'Hard cuts only', desc: 'No transitions. Clean editorial assembly.' },
  { label: 'Social queue', desc: 'Posts surface from analysis, ready to publish.' },
  { label: 'Own storage', desc: 'Direct to Supabase Storage. Your bucket.' },
]

export default function HomePage() {
  return (
    <div style={{ background: C.bg, minHeight: '100vh', color: C.textPrimary, ...mono }}>

      {/* Nav */}
      <nav style={{
        borderBottom: `1px solid ${C.border}`,
        height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 48px', background: C.bgSurface,
        position: 'sticky', top: 0, zIndex: 10,
      }}>
        <div>
          <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: -0.5 }}>
            NEO<span style={{ color: C.amber }}>LOG</span>
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Link href="/login" style={{
            fontSize: 10, letterSpacing: 2, color: C.textDim, textDecoration: 'none',
            padding: '7px 16px', border: `1px solid ${C.border}`,
            textTransform: 'uppercase',
          }}>
            Sign in
          </Link>
          <Link href="/login" style={{
            fontSize: 10, letterSpacing: 2, color: C.bg, textDecoration: 'none',
            padding: '7px 16px', background: C.amber, fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ padding: '80px 48px 72px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <Tag>Creative intelligence system</Tag>
        </div>
        <h1 style={{
          fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(40px, 6vw, 72px)',
          lineHeight: 1.05, letterSpacing: -1, margin: '0 0 28px',
          color: C.textPrimary,
        }}>
          Record yourself thinking.<br />
          <span style={{ color: C.amber }}>Publish the best of it.</span>
        </h1>
        <p style={{ fontSize: 16, color: C.textSecond, lineHeight: 1.7, maxWidth: 560, margin: '0 0 40px' }}>
          Neolog turns raw video brain-dumps into structured intelligence, then all the way to a finished, AI-produced video — ready to post.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' as const }}>
          <Link href="/login" style={{
            fontSize: 11, letterSpacing: 2, textDecoration: 'none',
            padding: '13px 28px', background: C.amber, color: C.bg, fontWeight: 700,
            textTransform: 'uppercase',
          }}>
            Open Neolog →
          </Link>
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* Steps */}
      <section style={{ padding: '72px 48px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 48 }}>
          How it works
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 0 }}>
          {STEPS.map((s, i) => (
            <div key={s.num} style={{
              padding: '28px 28px 28px 0',
              borderLeft: i > 0 ? `1px solid ${C.border}` : 'none',
              paddingLeft: i > 0 ? 28 : 0,
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.amberDim, marginBottom: 12 }}>
                {s.num}
              </div>
              <div style={{
                fontFamily: "'Syne', sans-serif", fontSize: 16, fontWeight: 700,
                color: C.textPrimary, marginBottom: 10,
              }}>
                {s.title}
              </div>
              <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.65 }}>
                {s.body}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* Feature grid */}
      <section style={{ padding: '72px 48px', maxWidth: 860, margin: '0 auto' }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase', marginBottom: 48 }}>
          What&apos;s included
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 2 }}>
          {FEATURES.map(f => (
            <div key={f.label} style={{
              padding: '18px 20px', background: C.bgSurface, border: `1px solid ${C.border}`,
            }}>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.amber, textTransform: 'uppercase', marginBottom: 8 }}>
                {f.label}
              </div>
              <div style={{ fontSize: 11, color: C.textSecond, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${C.border}` }} />

      {/* CTA */}
      <section style={{ padding: '80px 48px', textAlign: 'center' as const }}>
        <div style={{
          fontFamily: "'Syne', sans-serif", fontSize: 'clamp(28px, 4vw, 46px)',
          fontWeight: 800, lineHeight: 1.1, marginBottom: 20,
        }}>
          Stop losing your best ideas.
        </div>
        <div style={{ fontSize: 13, color: C.textSecond, marginBottom: 36 }}>
          Every recording becomes a permanent record. Every idea gets a chance to become something.
        </div>
        <Link href="/login" style={{
          fontSize: 11, letterSpacing: 2, textDecoration: 'none',
          padding: '13px 32px', background: C.amber, color: C.bg, fontWeight: 700,
          textTransform: 'uppercase',
        }}>
          Start recording →
        </Link>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: `1px solid ${C.border}`, padding: '20px 48px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap' as const, gap: 12, background: C.bgSurface,
      }}>
        <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' }}>
          Neolog © 2026
        </span>
        <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDimmer, textTransform: 'uppercase' }}>
          Creative intelligence · BYOK · Your data
        </span>
      </footer>
    </div>
  )
}
