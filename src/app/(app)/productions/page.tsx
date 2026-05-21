'use client'

/**
 * Productions — long-form creative containers. Canon rebuild
 * extending the vocabulary from 06-Project.html (canon's "Project" =
 * our "Productions"; operator confirmed we keep "Productions"
 * naming).
 *
 * Hero (68px h1) + state tabs (Developing / Materializing / Produced /
 * Dormant) + grid of canon production cards (topic-bordered + state
 * pill + character count + last-touched + blurb).
 *
 * Data: GET /api/v2/projects (table is `projects`; only the UI label
 * changed per HANDOFF.md §3 history).
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface ProductionRow {
  id: string
  name: string | null
  state: 'developing' | 'materializing' | 'produced' | 'dormant' | string
  headline: string | null
  blurb: string | null
  topic?: string
  stats?: { label: string; value: string }[]
  last_touched?: string
}

type Tab = 'all' | 'developing' | 'materializing' | 'produced' | 'dormant'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',           label: 'All' },
  { key: 'developing',    label: 'Developing' },
  { key: 'materializing', label: 'Materializing' },
  { key: 'produced',      label: 'Produced' },
  { key: 'dormant',       label: 'Dormant' },
]

interface DraftRow {
  id: string
  production_type: string
  state: string
  script_text: string | null
  source_kind: string
  source_id: string
  created_at: string
  updated_at: string
  produced_at: string | null
  visibility: string
}

export default function ProductionsListPage() {
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [drafts, setDrafts] = useState<DraftRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/v2/projects?limit=200', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { projects: [] })
        .catch(() => ({ projects: [] })),
      fetch('/api/v2/library?limit=100', { credentials: 'include' })
        .then(r => r.ok ? r.json() : { productions: [] })
        .catch(() => ({ productions: [] })),
    ]).then(([proj, lib]: any[]) => {
      setProductions(proj?.projects ?? proj?.productions ?? [])
      setDrafts(lib?.productions ?? [])
      setLoading(false)
    })
  }
  useEffect(load, [])

  const counts = useMemo(() => ({
    all: productions.length,
    developing:    productions.filter(p => p.state === 'developing').length,
    materializing: productions.filter(p => p.state === 'materializing').length,
    produced:      productions.filter(p => p.state === 'produced').length,
    dormant:       productions.filter(p => p.state === 'dormant').length,
  }), [productions])

  const filtered = useMemo(() => {
    if (tab === 'all') return productions
    return productions.filter(p => p.state === tab)
  }, [productions, tab])

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '40px 0 32px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
          The work · accumulated
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 68, lineHeight: 1.0, letterSpacing: '-2.6px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Productions<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 620, letterSpacing: '-0.15px', marginBottom: 24,
        }}>
          Long-running creative containers — characters, scene fragments, themes,
          dialogue captures, references. Each one accumulates as the graph grows.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="canon-btn primary" onClick={() => alert('New production — coming in a later deploy.')}>
            New production
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M7 3 L7 11 M3 7 L11 7"/></svg></span>
          </button>
        </div>
      </section>

      {/* Recent drafts — actual production artifacts (productions table).
          Distinct from the project containers below. */}
      {drafts.length > 0 && (
        <section className="canon-reveal d2" style={{ marginBottom: 36 }}>
          <div className="canon-section-head">
            <h2>Recent drafts <span className="meta">· {drafts.length}</span></h2>
            <div className="meta">script_text · live</div>
          </div>
          <div style={{
            display: 'grid', gap: 10,
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          }}>
            {drafts.slice(0, 12).map(d => (
              <Link key={d.id} href={`/production/${d.id}`} className="canon-production-card" style={{ ['--c' as any]: 'var(--sig)' } as React.CSSProperties}>
                <div className="kind-row">
                  <span className="topic-pill" style={{ '--topic': 'var(--sig)', '--topic-soft': 'var(--sig-soft)' } as any}>
                    <span className="type">{d.production_type.replace(/_/g, ' ')}</span>
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    letterSpacing: 1.6, textTransform: 'uppercase',
                    color: 'var(--fg-3)',
                    padding: '3px 9px', borderRadius: 100,
                    background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                  }}>{d.state.replace(/_/g, ' ')}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
                    {new Date(d.updated_at || d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <p className="blurb" style={{ WebkitLineClamp: 3 } as any}>
                  {d.script_text ? d.script_text.replace(/\s+/g, ' ').slice(0, 220) : '(empty draft)'}
                </p>
                <div className="meta-pills">
                  <span>from <b>{d.source_kind}</b></span>
                  {d.visibility === 'public' && <span style={{ color: 'var(--sig)' }}>· public</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Tabs (project containers below) */}
      <div className="canon-reveal d2" style={{
        display: 'flex', gap: 6, borderBottom: '1px solid var(--line)',
        paddingBottom: 18, marginBottom: 32, flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`canon-filter-chip ${tab === t.key ? 'active' : ''}`}
          >
            {t.label}
            <span className="n">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      {loading && <div style={{ color: 'var(--fg-3)', padding: 20 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{
          padding: '60px 32px',
          border: '1px dashed var(--line-2)',
          borderRadius: 14, background: 'var(--bg-1)',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 400,
            letterSpacing: '-1px', color: 'var(--fg)', margin: '0 0 14px',
          }}>
            {productions.length === 0 ? 'No productions yet.' : `Nothing in ${tab}.`}
          </h2>
          <p style={{ color: 'var(--fg-2)', maxWidth: 540, margin: '0 auto', lineHeight: 1.55 }}>
            {productions.length === 0
              ? 'Long-form work accumulates here once you start a production. Open a ready cluster and click Produce a draft to begin.'
              : 'Switch tabs to see other states.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="canon-reveal d3" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(p => {
            const color = topicColor(p.topic ?? p.name ?? 'production')
            const isReady = p.state === 'materializing' || p.state === 'produced'
            return (
              <Link key={p.id} href={`/productions/${p.id}`} className="canon-production-card" style={{ ['--c' as any]: color } as React.CSSProperties}>
                <div className="kind-row">
                  <span className="topic-pill" style={{ '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 10%, transparent)` } as any}>
                    <span className="type">Production</span>
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 9.5,
                    letterSpacing: 1.6, textTransform: 'uppercase',
                    color: isReady ? 'var(--sig)' : 'var(--fg-3)',
                    padding: '3px 9px', borderRadius: 100,
                    background: isReady ? 'var(--sig-soft)' : 'var(--bg-2)',
                    border: `1px solid ${isReady ? 'color-mix(in srgb, var(--sig) 35%, transparent)' : 'var(--line-1)'}`,
                  }}>{p.state}</span>
                  {p.last_touched && (
                    <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
                      {p.last_touched}
                    </span>
                  )}
                </div>
                <h3>{p.name || 'Untitled'}</h3>
                {(p.headline || p.blurb) && (
                  <p className="blurb">{p.headline || p.blurb}</p>
                )}
                {p.stats && p.stats.length > 0 && (
                  <div className="meta-pills">
                    {p.stats.map((s, i) => (
                      <span key={i}><b>{s.value}</b> {s.label.toLowerCase()}</span>
                    ))}
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </Shell>
  )
}
