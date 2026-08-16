'use client'

/**
 * Projects — long-form creative containers (Pack-Rats-style). Renamed
 * from "Productions" to "Projects" to match the underlying `projects`
 * D1 table and to stop colliding in name with /production/[id], the
 * real generated-script/video engine output (an unrelated data model).
 *
 * Hero (68px h1) + state tabs (Developing / Materializing / Produced /
 * Dormant) + grid of canon production cards (topic-bordered + state
 * pill + character count + last-touched + blurb).
 *
 * Data: GET /api/v2/projects.
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

type Tab = 'all' | 'drafting' | 'ready' | 'produced' | 'published' | 'project'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',       label: 'All' },
  { key: 'drafting',  label: 'Drafting' },
  { key: 'ready',     label: 'Ready' },
  { key: 'produced',  label: 'Produced' },
  { key: 'published', label: 'Published' },
  { key: 'project',   label: 'Projects' },
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

export default function ProjectsListPage() {
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

  // One unified feed — projects (Pack Rats containers) + productions
  // (engine drafts: clips, articles, x_threads, video essays). Sorted
  // by recency. Each item carries its kind so the card renderer
  // picks the right shape + the right detail route.
  type FeedItem =
    | { kind: 'project';    id: string; row: ProductionRow; ts: string }
    | { kind: 'production'; id: string; row: DraftRow;      ts: string }

  const feed: FeedItem[] = useMemo(() => {
    const projectItems: FeedItem[] = productions.map(p => ({
      kind: 'project', id: p.id, row: p,
      ts: p.last_touched ?? '',
    }))
    const draftItems: FeedItem[] = drafts.map(d => ({
      kind: 'production', id: d.id, row: d,
      ts: d.updated_at ?? d.created_at ?? '',
    }))
    return [...projectItems, ...draftItems].sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  }, [productions, drafts])

  const counts = useMemo(() => {
    const c = {
      all: feed.length,
      drafting: 0,
      ready: 0,
      produced: 0,
      published: 0,
      project: productions.length,
    }
    for (const it of feed) {
      if (it.kind === 'production') {
        const s = it.row.state
        if (s === 'materializing') c.drafting++
        else if (s === 'script_ready') c.ready++
        else if (s === 'produced') c.produced++
        else if (s === 'published') c.published++
      } else {
        const s = it.row.state
        if (s === 'developing' || s === 'materializing') c.drafting++
        else if (s === 'produced') c.produced++
      }
    }
    return c
  }, [feed, productions])

  const filtered = useMemo(() => {
    if (tab === 'all') return feed
    if (tab === 'project') return feed.filter(it => it.kind === 'project')
    return feed.filter(it => {
      if (it.kind === 'production') {
        if (tab === 'drafting') return it.row.state === 'materializing'
        if (tab === 'ready')    return it.row.state === 'script_ready'
        if (tab === 'produced') return it.row.state === 'produced'
        if (tab === 'published') return it.row.state === 'published'
      } else {
        if (tab === 'drafting') return it.row.state === 'developing' || it.row.state === 'materializing'
        if (tab === 'produced') return it.row.state === 'produced'
      }
      return false
    })
  }, [feed, tab])

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '8px 0 32px' }}>
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
          Projects<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 620, letterSpacing: '-0.15px', marginBottom: 24,
        }}>
          Long-running creative containers — characters, scene fragments, themes,
          dialogue captures, references. Each one accumulates as the graph grows.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="canon-btn primary" onClick={() => alert('New project — coming in a later deploy.')}>
            New project
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M7 3 L7 11 M3 7 L11 7"/></svg></span>
          </button>
        </div>
      </section>

      {/* Tabs */}
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
            {feed.length === 0 ? 'Nothing here yet.' : `Nothing in ${tab}.`}
          </h2>
          <p style={{ color: 'var(--fg-2)', maxWidth: 540, margin: '0 auto', lineHeight: 1.55 }}>
            {feed.length === 0
              ? 'Generated drafts land here once you Produce something from a thread or a cluster. Or create a long-form project container with characters and themes.'
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
          {filtered.map(it => it.kind === 'project'
            ? <ProjectCard key={it.id} row={it.row}/>
            : <DraftCard   key={it.id} row={it.row}/>)}
        </div>
      )}
    </Shell>
  )
}

function ProjectCard({ row: p }: { row: ProductionRow }) {
  const color = topicColor(p.topic ?? p.name ?? 'project')
  const isReady = p.state === 'materializing' || p.state === 'produced'
  return (
    <Link href={`/projects/${p.id}`} className="canon-production-card" style={{ ['--c' as any]: color } as React.CSSProperties}>
      <div className="kind-row">
        <span className="topic-pill" style={{ '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 10%, transparent)` } as any}>
          <span className="type">Project</span>
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
      {(p.headline || p.blurb) && <p className="blurb">{p.headline || p.blurb}</p>}
      {p.stats && p.stats.length > 0 && (
        <div className="meta-pills">
          {p.stats.map((s, i) => <span key={i}><b>{s.value}</b> {s.label.toLowerCase()}</span>)}
        </div>
      )}
    </Link>
  )
}

function DraftCard({ row: d }: { row: DraftRow }) {
  const isPublic = d.visibility === 'public'
  const typeColor = d.production_type === 'video_essay' ? 'var(--t-plum)'
    : d.production_type === 'article' ? 'var(--t-terra)'
    : d.production_type === 'x_thread' || d.production_type === 'x_post' ? 'var(--t-rose)'
    : d.production_type === 'clip' ? 'var(--t-ochre)'
    : 'var(--sig)'
  return (
    <Link href={`/production/${d.id}`} className="canon-production-card" style={{ ['--c' as any]: typeColor } as React.CSSProperties}>
      <div className="kind-row">
        <span className="topic-pill" style={{ '--topic': typeColor, '--topic-soft': `color-mix(in srgb, ${typeColor} 10%, transparent)` } as any}>
          <span className="type">{d.production_type.replace(/_/g, ' ')}</span>
        </span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: 1.6, textTransform: 'uppercase',
          color: 'var(--fg-3)',
          padding: '3px 9px', borderRadius: 100,
          background: 'var(--bg-2)', border: '1px solid var(--line-1)',
        }}>{d.state.replace(/_/g, ' ')}</span>
        {isPublic && (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9.5,
            letterSpacing: 1.6, textTransform: 'uppercase',
            color: 'var(--sig)', padding: '3px 9px', borderRadius: 100,
            background: 'var(--sig-soft)',
            border: '1px solid color-mix(in srgb, var(--sig) 35%, transparent)',
          }}>public</span>
        )}
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
          {new Date(d.updated_at || d.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        </span>
      </div>
      <p className="blurb" style={{ WebkitLineClamp: 3 } as any}>
        {d.script_text ? d.script_text.replace(/\s+/g, ' ').slice(0, 220) : '(empty draft)'}
      </p>
      <div className="meta-pills">
        <span>from <b>{d.source_kind}</b></span>
      </div>
    </Link>
  )
}
