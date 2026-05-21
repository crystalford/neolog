'use client'

/**
 * Production detail — canon rebuild per 06-Project.html.
 *
 * Sections:
 *   1. Crumbs (Timeline / Productions / project name)
 *   2. Hero — Production tag pill + 64-84px h1 + logline pull-quote +
 *             meta strip + actions column (Generate treatment / etc.)
 *   3. 5-cell digest (Characters / Scenes / Themes / Dialogues / Refs)
 *   4. Characters section — auto-fill grid of canon character cards
 *   5. Body grid — recent elements + rail (gen pipeline / refs / prov)
 *   6. Provenance grid + footer
 *
 * Data: /api/v2/projects/[id] (table is `projects`; UI is "Productions").
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate, formatFullDate } from '@/components/threadkit'

interface Character { id: string; name: string; role: string | null }
interface Project {
  id: string
  name: string
  tagline: string | null
  blurb: string | null
  state: string
  themes: string[]
  characters: Character[]
}

export default function ProductionDetailPage({ params }: { params: { id: string } }) {
  const [project, setProject] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/projects/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setProject(d.project))
      .catch(e => setError(String(e?.message || e)))
  }, [params.id])

  if (error) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, 'Error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!project) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, '…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const color = topicColor(project.name)
  const isReady = project.state === 'materializing' || project.state === 'produced'

  return (
    <Shell>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>
        <CanonCrumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Productions', href: '/productions' },
            { label: truncate(project.name, 50) },
          ]}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <span className="topic-pill" style={{ '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 12%, transparent)` } as any}>
                <span className="type">Production</span>
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 11px',
                background: isReady ? 'var(--sig-soft)' : 'var(--bg-2)',
                border: `1px solid ${isReady ? 'color-mix(in srgb, var(--sig) 35%, transparent)' : 'var(--line-1)'}`,
                borderRadius: 100,
                fontFamily: 'var(--font-mono)',
                fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', fontWeight: 500,
                color: isReady ? 'var(--sig)' : 'var(--fg-2)',
              }}>
                {project.state}
              </span>
            </div>
            <h1 style={{ fontSize: 76, letterSpacing: '-2.8px' }}>{project.name}</h1>
            {project.tagline && (
              <div style={{
                fontSize: 19, color: 'var(--fg-1)',
                lineHeight: 1.5, padding: '14px 20px',
                borderLeft: `2px solid ${color}`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${color} 8%, transparent), transparent)`,
                borderRadius: '0 12px 12px 0',
                maxWidth: 760, marginTop: 24,
                fontStyle: 'italic',
              }}>
                {project.tagline}
              </div>
            )}
            {project.blurb && !project.tagline && (
              <p style={{
                fontSize: 17, color: 'var(--fg-2)',
                lineHeight: 1.55, marginTop: 22,
                maxWidth: 760,
              }}>
                {project.blurb}
              </p>
            )}
          </div>
          <div className="actions">
            <button className="action primary" onClick={() => alert('Generate treatment — coming in a later deploy.')}>
              Generate treatment
            </button>
            <button className="action" onClick={() => alert('Outline — coming later.')}>
              Open outline
            </button>
            <button className="action" onClick={() => alert('Cast board — coming later.')}>
              Cast board
            </button>
          </div>
        </section>

        {/* Digest */}
        <section className="canon-digest canon-reveal d3" style={{ marginBottom: 32 }}>
          <DigestCell n={project.characters.length} l="Characters"/>
          <DigestCell n={project.themes.length} l="Themes"/>
          <DigestCell n={0} l="Scenes"/>
          <DigestCell n={0} l="Dialogues"/>
          <DigestCell n={0} l="References"/>
        </section>

        {/* Characters */}
        {project.characters.length > 0 && (
          <section className="canon-section canon-reveal d4" style={{ marginBottom: 32 }}>
            <div className="canon-section-head">
              <h2>Characters <span className="meta">· {project.characters.length}</span></h2>
              <div className="meta">the cast</div>
            </div>
            <div className="canon-characters">
              {project.characters.map((c, i) => {
                const c1 = topicColor(c.name)
                const c2 = topicColor(c.role ?? c.name + '-2')
                return (
                  <div key={c.id} className="canon-char-card" style={{ '--c1': c1, '--c2': c2 } as any}>
                    <div className="row1">
                      <span className="face">{c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                      <div>
                        <div className="nm">{c.name}</div>
                        {c.role && <div className="role">{c.role}</div>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* Body grid */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">

            {project.themes.length > 0 && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Themes <span className="meta">· {project.themes.length}</span></h2>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {project.themes.map((t, i) => (
                    <span key={i} style={{
                      padding: '7px 14px',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--line-1)',
                      borderLeft: `2px solid ${color}`,
                      borderRadius: '0 100px 100px 0',
                      fontSize: 13, color: 'var(--fg-1)',
                    }}>{t}</span>
                  ))}
                </div>
              </section>
            )}

            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Recent elements <span className="meta">· none yet</span></h2>
              </div>
              <div className="canon-empty-hint">
                Scene fragments, dialogue captures, beats, and references land here as the
                extraction pipeline finds creative material in your vlogs.
              </div>
            </section>
          </div>

          <aside className="canon-detail-rail">
            <div className="rail-card">
              <div className="rc-head">
                <h3>Generation pipeline</h3>
                <span className="more">setup →</span>
              </div>
              <div className="canon-gen-list">
                <div className="canon-gen-row">
                  <div className="body">
                    <div className="lbl">Treatment</div>
                    <div className="v">Not started</div>
                  </div>
                  <span className="pct">—</span>
                </div>
                <div className="canon-gen-row">
                  <div className="body">
                    <div className="lbl">Scriptment</div>
                    <div className="v">Not started</div>
                  </div>
                  <span className="pct">—</span>
                </div>
                <div className="canon-gen-row">
                  <div className="body">
                    <div className="lbl">Moodboard</div>
                    <div className="v">Not started</div>
                  </div>
                  <span className="pct">—</span>
                </div>
              </div>
            </div>

            <div className="rail-card">
              <div className="rc-head">
                <h3>Contributing threads</h3>
              </div>
              <div className="canon-empty-hint" style={{ padding: 14, fontSize: 12 }}>
                Threads that contributed to this production will surface here once
                creative_elements are linked.
              </div>
            </div>

            <div className="rail-card">
              <div className="rc-head">
                <h3>References</h3>
                <span className="more">add →</span>
              </div>
              <div className="canon-empty-hint" style={{ padding: 14, fontSize: 12 }}>
                Films, books, articles — tonal anchors for this production.
              </div>
            </div>
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid" style={{ marginTop: 32 }}>
          <ProvCell label="State" value={project.state}/>
          <ProvCell label="Characters" value={`${project.characters.length}`}/>
          <ProvCell label="Themes" value={`${project.themes.length}`}/>
          <ProvCell label="Production id" value={truncate(project.id, 22)} mono/>
        </section>

        {/* Footer */}
        <footer className="canon-detail-footer">
          <span>neolog · production {truncate(project.id, 22)}</span>
          <span className="kbd-row"/>
        </footer>
      </div>
    </Shell>
  )
}

type CrumbItem = { label: string; href?: string } | string

function CanonCrumbs({ trail }: { trail: CrumbItem[] }) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'here' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
    </div>
  )
}

function DigestCell({ n, l }: { n: number; l: string }) {
  return (
    <div className="canon-digest-cell">
      <span className="n">{n.toLocaleString()}</span>
      <span className="l">{l}</span>
    </div>
  )
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}
