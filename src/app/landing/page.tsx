/**
 * Public landing page — neolog.ai/landing
 *
 * Ported from the Console-design landing prototype. Hero + premise +
 * pipeline + CTA + footer. Single-file static page (edge runtime), no
 * client state. Lives outside the (app) route group so it doesn't
 * render the sidebar/topbar shell.
 *
 * Design source: design bundle screens/landing.jsx (Anthropic Design
 * handoff). Filament logo kept verbatim. All colors come from tokens
 * already defined in src/app/globals.css (--bg, --fg-*, --accent,
 * --t-1..8) — no new tokens needed.
 */

import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { PublishedWork } from '@/components/PublishedWork'

export const runtime = 'edge'

export default function LandingPage() {
  return (
    <div style={{ display: 'block', overflow: 'auto', background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)' }}>
      {/* Topbar */}
      <div style={{
        padding: '24px 48px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        maxWidth: 1320,
        margin: '0 auto',
      }}>
        <Link href="/landing" style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg)', textDecoration: 'none' }}>
          <Logo size={22}/>
          <span style={{ fontSize: 18, fontWeight: 500, letterSpacing: '-0.4px' }}>neolog</span>
        </Link>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="#how" style={{ fontSize: 11, letterSpacing: 0.4, color: 'var(--fg-3)', textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace', textDecoration: 'none' }}>How it works</a>
          <a href="#pitch" style={{ fontSize: 11, letterSpacing: 0.4, color: 'var(--fg-3)', textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace', textDecoration: 'none' }}>Manifesto</a>
          <Link href="/signin" className="btn">Sign in →</Link>
        </div>
      </div>

      {/* Hero */}
      <section style={{ maxWidth: 1320, margin: '0 auto', padding: '60px 48px 100px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 80, alignItems: 'center' }}>
          <div>
            <div style={{
              fontSize: 11, letterSpacing: 0.5,
              color: 'var(--fg-3)', textTransform: 'uppercase',
              marginBottom: 24, display: 'inline-flex', alignItems: 'center', gap: 10,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              <span style={{ width: 22, height: 1, background: 'var(--fg-4)' }}/>
              A personal life graph
            </div>
            <h1 style={{
              fontWeight: 500, fontSize: 72, lineHeight: 1.04,
              letterSpacing: '-2.2px', color: 'var(--fg)', marginBottom: 32, marginTop: 0,
            }}>
              Your thinking,<br/>
              structured.<br/>
              <span style={{ color: 'var(--accent)' }}>Owned by you.</span>
            </h1>
            <p style={{
              fontSize: 18, color: 'var(--fg-2)', lineHeight: 1.55,
              marginBottom: 36, maxWidth: 480,
            }}>
              Record yourself talking. The system extracts threads, finds patterns across your work, and ships finished pieces back into the world. The graph is yours, complete, and it stays that way.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Link href="/signin" className="btn primary large">Start a graph →</Link>
              <a href="#how" className="btn large">How it works</a>
            </div>
          </div>

          {/* Hero graph — the radial topic-node centerpiece. Pure SVG,
              no JS. "you" at center, six cluster nodes radiating out
              with topic-tinted radial-gradient glows + a scatter of
              smaller dots in topic colors. Sells the "graph is yours"
              metaphor at a glance. */}
          <div style={{ position: 'relative', aspectRatio: '1', maxWidth: 460, marginLeft: 'auto', width: '100%' }}>
            <svg viewBox="0 0 460 460" style={{ width: '100%', height: '100%', display: 'block' }}>
              <defs>
                {[['1','#60a5fa'],['2','#a78bfa'],['3','#34d399'],['4','#fb923c'],['5','#f472b6'],['6','#2dd4bf'],['7','#fbbf24']].map(([id, c]) => (
                  <radialGradient key={id} id={`lg-${id}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={c} stopOpacity="0.55"/>
                    <stop offset="100%" stopColor={c} stopOpacity="0"/>
                  </radialGradient>
                ))}
              </defs>
              {/* Connection lines — center-to-node and inter-node */}
              {[
                [230,230, 130,140],[230,230, 330,130],[230,230, 370,250],
                [230,230, 310,350],[230,230, 120,320],[230,230, 195,375],
                [130,140, 330,130],[330,130, 370,250],[370,250, 310,350],
                [310,350, 195,375],[195,375, 120,320],[120,320, 130,140],
              ].map((e, i) => (
                <line key={i} x1={e[0]} y1={e[1]} x2={e[2]} y2={e[3]} stroke="rgba(255,255,255,0.16)" strokeWidth="0.7"/>
              ))}
              {/* Scatter dots in concentric rings */}
              {Array.from({length: 24}).map((_, i) => {
                const a = (i / 24) * Math.PI * 2
                const r = 90 + (i % 4) * 28
                const x = 230 + Math.cos(a) * r
                const y = 230 + Math.sin(a) * r
                return <circle key={i} cx={x} cy={y} r={2.8} fill={`var(--t-${(i % 7) + 1})`} opacity={0.7}/>
              })}
              {/* Cluster nodes with glow + solid */}
              {[
                { x: 130, y: 140, r: 56, c: '1', n: 18 },
                { x: 330, y: 130, r: 48, c: '2', n: 14 },
                { x: 370, y: 250, r: 38, c: '3', n: 12 },
                { x: 310, y: 350, r: 34, c: '5', n: 10 },
                { x: 195, y: 375, r: 30, c: '7', n: 9 },
                { x: 120, y: 320, r: 26, c: '6', n: 8 },
              ].map((n, i) => (
                <g key={i}>
                  <circle cx={n.x} cy={n.y} r={n.r * 1.6} fill={`url(#lg-${n.c})`}/>
                  <circle cx={n.x} cy={n.y} r={n.n + 10} fill={`var(--t-${n.c})`} opacity={0.95}/>
                </g>
              ))}
              {/* "you" anchor */}
              <circle cx={230} cy={230} r={36} fill="var(--fg)"/>
              <text x={230} y={237} textAnchor="middle" fill="var(--bg)" fontSize={15} fontFamily="Geist, system-ui, sans-serif" fontWeight={500}>you</text>
            </svg>
          </div>
        </div>
      </section>

      {/* Pitch */}
      <section id="pitch" style={{ maxWidth: 1320, margin: '0 auto', padding: '70px 48px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 60, alignItems: 'start' }}>
          <div>
            <div style={{
              fontSize: 11, letterSpacing: 0.5, color: 'var(--fg-3)',
              textTransform: 'uppercase', marginBottom: 14,
              fontFamily: 'Geist Mono, ui-monospace, monospace',
            }}>
              The premise
            </div>
            <h2 style={{
              fontSize: 36, fontWeight: 500, letterSpacing: '-0.9px',
              lineHeight: 1.15, marginTop: 0,
            }}>
              You already think out loud.{' '}
              <span style={{ color: 'var(--accent)' }}>Why isn&apos;t anyone holding it?</span>
            </h2>
          </div>
          <div>
            <p style={{ fontSize: 17, color: 'var(--fg-1)', lineHeight: 1.65, marginBottom: 18, maxWidth: 660, marginTop: 0 }}>
              You record vlogs. You riff into the void on walks. You return to the same idea from six different angles over three weeks and never connect them because they live in{' '}
              <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>different files on different days</strong>.
            </p>
            <p style={{ fontSize: 17, color: 'var(--fg-1)', lineHeight: 1.65, maxWidth: 660, marginBottom: 0 }}>
              Neolog refracts every vlog into{' '}
              <strong style={{ color: 'var(--fg)', fontWeight: 500 }}>threads</strong>{' '}
              — atomic takes with verbatim grounding. Threads cluster. Clusters surface. Productions ship. The graph stays yours, in your own R2 bucket, forever.
            </p>
          </div>
        </div>
      </section>

      {/* Pipeline */}
      <section id="how" style={{ maxWidth: 1320, margin: '0 auto', padding: '70px 48px', borderTop: '1px solid var(--line)' }}>
        <div style={{
          fontSize: 11, letterSpacing: 0.5, color: 'var(--fg-3)',
          textTransform: 'uppercase', marginBottom: 14,
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>
          How it works
        </div>
        <h2 style={{
          fontSize: 36, fontWeight: 500, letterSpacing: '-0.9px',
          marginBottom: 36, marginTop: 0, maxWidth: 720,
        }}>
          One stream in.{' '}
          <span style={{ color: 'var(--accent)' }}>Five surfaces out.</span>
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
          {[
            { n: '01', c: '1', name: 'Capture',     d: 'Record or drop. Multipart to R2. Audio + thumb extracted in-browser before upload completes.' },
            { n: '02', c: '7', name: 'Transcribe',  d: 'Whisper on Workers AI. Word-level timestamps. Voice preserved — no sanitization.' },
            { n: '03', c: '2', name: 'Extract',     d: 'Four parallel passes: threads, clip candidates, creative elements, entities. Free or premium.' },
            { n: '04', c: '6', name: 'Cluster',     d: 'Riffs form. Threshold-based auto-link. Studio surfaces "ready" clusters with names + gaps.' },
            { n: '05', c: '3', name: 'Produce',     d: 'Video essay, X thread, article, clip. Built from voice-grounded threads. You publish.' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderLeft: `2px solid var(--t-${s.c})`,
              borderRadius: '0 8px 8px 0',
              padding: 22,
            }}>
              <div style={{
                fontSize: 10, color: 'var(--fg-3)', letterSpacing: 0.4, marginBottom: 10,
                fontFamily: 'Geist Mono, ui-monospace, monospace',
              }}>
                {s.n}
              </div>
              <div style={{ fontWeight: 500, fontSize: 17, color: 'var(--fg)', letterSpacing: '-0.2px', marginBottom: 8 }}>
                {s.name}
              </div>
              <div style={{ fontSize: 12, color: 'var(--fg-2)', lineHeight: 1.55 }}>
                {s.d}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Published work — public productions gallery */}
      <PublishedWork/>

      {/* Footer CTA */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '100px 48px 80px', textAlign: 'center', borderTop: '1px solid var(--line)' }}>
        <h2 style={{
          fontSize: 52, fontWeight: 500, letterSpacing: '-1.4px',
          lineHeight: 1.1, marginBottom: 18, marginTop: 0,
        }}>
          The graph is yours.{' '}
          <span style={{ color: 'var(--accent)' }}>Make one.</span>
        </h2>
        <p style={{ fontSize: 17, color: 'var(--fg-2)', maxWidth: 520, margin: '0 auto 32px', lineHeight: 1.55 }}>
          Single operator. Cloudflare-backed. No team features, no quotas, no AI deciding what you think.
        </p>
        <Link href="/signin" className="btn primary large">Start a graph →</Link>
      </section>

      {/* Footer */}
      <div style={{
        maxWidth: 1320, margin: '0 auto', padding: '26px 48px',
        borderTop: '1px solid var(--line)',
        display: 'flex', justifyContent: 'space-between',
      }}>
        <span style={{
          fontSize: 10, letterSpacing: 0.4, color: 'var(--fg-4)',
          textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>
          Neolog · v2.4 · 2026
        </span>
        <div style={{
          display: 'flex', gap: 18, fontSize: 10, letterSpacing: 0.4,
          color: 'var(--fg-4)', textTransform: 'uppercase',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
        }}>
          <a href="https://github.com/crystalford/neolog" style={{ color: 'inherit', textDecoration: 'none' }}>Github</a>
          <a href="#pitch" style={{ color: 'inherit', textDecoration: 'none' }}>Manifesto</a>
          <Link href="/signin" style={{ color: 'inherit', textDecoration: 'none' }}>Sign in</Link>
        </div>
      </div>
    </div>
  )
}
