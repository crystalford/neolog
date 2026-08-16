'use client'

/**
 * About — the system, mapped. Canon rebuild per
 * /tmp/neolognextlevel/design-reference/00-Sitemap.html
 *
 * Hero (92px h1 "Make thinking legible.") + 4-principle strip
 * (The work itself / Where it came from / Where it sits / What it
 * became) + 6-surface tiled cards (Timeline / Thread / Studio / Vlog /
 * Graph / Productions). Editorial-spread layout.
 */

export const runtime = 'edge'

import Link from 'next/link'
import Shell from '@/components/Shell'

const PRINCIPLES = [
  { n: '01', c: '--sig',      title: 'The work itself.',     body: 'Audio, video, transcript, draft — full resolution. Not a preview. The page lets you read or hear the actual thing.' },
  { n: '02', c: '--t-terra',  title: 'Where it came from.',  body: 'Parent vlog, source threads, extraction model, prompt version, recording GPS. Provenance is first-class.' },
  { n: '03', c: '--t-violet', title: 'Where it sits.',       body: 'Cluster context, sibling threads, related nodes, entity neighborhood, macro-position. Every node knows its place.' },
  { n: '04', c: '--t-teal',   title: 'What it became.',      body: 'Productions that used the material — clips, posts, articles, video essays. Plus gaps and what\'s next.' },
]

const SURFACES = [
  {
    n: '01', tag: 'Public · timeline', c: '--sig',
    href: '/', title: 'Timeline',
    blurb: 'The operator\'s own FYP — every vlog, thread, post, clip, surfaced insight, and project update in one chronological feed. Day-banded, riff-bracketed, topic-tinted.',
    file: 'page.tsx',
  },
  {
    n: '02', tag: 'Atomic · detail', c: '--t-terra',
    href: '/?filter=thread', title: 'Thread',
    blurb: 'One captured moment, fully legible. The take pulled out big, the audio waveform with the span highlighted, the transcript with words in scope lit up, sibling threads, related nodes, adjacent insights, entities, productions.',
    file: 'thread/[id]',
  },
  {
    n: '03', tag: 'Studio · cultivation', c: '--sig',
    href: '/studio', title: 'Studio',
    blurb: 'A position braided across weeks of riffs. Ripeness gauge with composite breakdown, riff-progression timeline showing how the cluster ripened, production candidates ready to ship, contributing threads, gap question, adjacent bounce.',
    file: 'studio/[id]',
  },
  {
    n: '04', tag: 'Source · session', c: '--t-ochre',
    href: '/vlogs', title: 'Vlog',
    blurb: 'A recording shown as source material. Big player + multi-track timeline below (audio / thread spans / clip brackets / entity mentions). Transcript with thread spans inline-colored. Right rail: every thread, clip, entity, and cluster the session produced.',
    file: 'vlog/[id]',
  },
  {
    n: '05', tag: 'Substrate · territory', c: '--t-steel',
    href: '/graph', title: 'Graph',
    blurb: 'The graph as territory — topic regions, cluster centers, thread satellites, entity dots, productions on the rim. Selected-node panel with neighbors. Time-lapse scrubber showing the graph grow.',
    file: 'graph',
  },
  {
    n: '06', tag: 'Creative · longform', c: '--t-plum',
    href: '/projects', title: 'Projects',
    blurb: 'A long-running creative work as accumulating artifact — characters, scene fragments, themes, dialogue captures, tonal references. Generation pipeline for treatment / sizzle / moodboard. Linked threads that contributed.',
    file: 'projects/[id]',
  },
]

export default function AboutPage() {
  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '8px 0 48px', maxWidth: 880 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
          The system · mapped
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 300,
          fontSize: 92, lineHeight: 0.94, letterSpacing: '-3.8px',
          color: 'var(--fg)', margin: '0 0 28px', textWrap: 'balance',
        }}>
          Make <span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>thinking</span> legible<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 18, lineHeight: 1.55, color: 'var(--fg-1)',
          maxWidth: 660, letterSpacing: '-0.2px', marginBottom: 20,
        }}>
          neolog is a personal life graph and production engine. You talk into it — raw, unedited.
          It threads, clusters, and ships in your voice. <em style={{ fontStyle: 'normal', color: 'var(--fg)', fontWeight: 500 }}>Every page in the system is built to make the work visible</em> — the actual moment, where it came from, how it connects, and what it became.
        </p>
        <p style={{
          fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.55,
          maxWidth: 660, letterSpacing: '-0.1px',
        }}>
          Six surfaces. One vocabulary. Pure black, cool gray, cobalt signal, ten topic territories.
          Geist + JetBrains Mono. Each page treats its subject — a vlog, a thread, a cluster, a project — as
          worth an editorial spread, not a row in a table.
        </p>
      </section>

      {/* Principles strip */}
      <section className="canon-reveal d2" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        background: 'var(--line-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 14,
        overflow: 'hidden',
        marginBottom: 72,
      }}>
        {PRINCIPLES.map(p => (
          <div key={p.n} style={{
            background: 'var(--bg-1)',
            padding: '24px 26px 22px',
            display: 'flex', flexDirection: 'column', gap: 8,
            position: 'relative',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: 2, color: `var(${p.c})`, fontWeight: 500,
            }}>{p.n}</span>
            <h3 style={{
              fontFamily: 'var(--font-body)', fontWeight: 500,
              fontSize: 22, color: 'var(--fg)',
              letterSpacing: '-0.5px', lineHeight: 1.15,
              margin: 0, textWrap: 'balance',
            }}>{p.title}</h3>
            <p style={{
              fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55,
              marginTop: 6, letterSpacing: '-0.1px',
            }}>{p.body}</p>
          </div>
        ))}
      </section>

      {/* Section heading */}
      <div className="canon-reveal d3" style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 12, marginBottom: 22, padding: '0 0 14px',
        borderBottom: '1px solid var(--line)',
      }}>
        <h2 style={{
          fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: 2.5,
          textTransform: 'uppercase', color: 'var(--fg-1)', fontWeight: 500, margin: 0,
        }}>The surfaces</h2>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.4,
          textTransform: 'uppercase', color: 'var(--fg-3)',
        }}>six pages · click to walk</span>
      </div>

      {/* Sitemap tiles */}
      <section className="canon-reveal d3" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 12, marginBottom: 64,
      }}>
        {SURFACES.map(s => (
          <Link key={s.n} href={s.href} className="canon-surface-card" style={{ ['--c' as any]: `var(${s.c})` } as React.CSSProperties}>
            <div className="head">
              <span className="tag">{s.tag}</span>
              <span className="num">{s.n}</span>
            </div>
            <h3>{s.title}</h3>
            <p className="blurb">{s.blurb}</p>
            <div className="foot">
              <span>{s.file}</span>
              <span className="go">
                Open
                <svg viewBox="0 0 12 12" width="11" height="11"><path d="M3 6 L9 6 M6.5 3.5 L9 6 L6.5 8.5" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
              </span>
            </div>
          </Link>
        ))}
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--line)',
        padding: '36px 0 56px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
        textTransform: 'uppercase', color: 'var(--fg-3)', fontWeight: 500,
      }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
          neolog · v 2.0
        </span>
        <span>walk in any order · the masthead carries you between</span>
      </footer>
    </Shell>
  )
}
