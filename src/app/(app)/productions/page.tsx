'use client'

/**
 * Productions — long-form creative containers.
 * Was the old /projects route; renamed per HANDOFF.md §3 (SQL table
 * stays named `projects`; only the UI strings change).
 * Ported from neolog-design/project/screens/productions.jsx.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, TopicDot } from '@/components/Shell'

interface ProductionRow {
  id: string
  name: string | null
  kind: string | null    // 'series' | 'documentary' | 'book' | 'audio_series' | ...
  state: string          // 'developing' | 'materializing' | 'dormant' | 'produced' | 'published'
  headline: string | null
  blurb: string | null
  topic_color_token?: string | null
  last_touched_at?: string | null
  stats_json?: string | null
}

export default function ProductionsPage() {
  const [productions, setProductions] = useState<ProductionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'materializing' | 'dormant' | 'published'>('active')

  useEffect(() => {
    fetch('/api/v2/projects?limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.projects) setProductions(d.projects)
        else if (d?.productions) setProductions(d.productions)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const counts = {
    active: productions.filter(p => ['developing','materializing'].includes(p.state)).length,
    materializing: productions.filter(p => p.state === 'materializing').length,
    dormant: productions.filter(p => p.state === 'dormant').length,
    published: productions.filter(p => ['produced','published'].includes(p.state)).length,
  }

  const filtered = productions.filter(p => {
    if (tab === 'active') return ['developing','materializing'].includes(p.state)
    return p.state === tab || (tab === 'published' && p.state === 'produced')
  })

  const busy = counts.materializing > 0

  return (
    <Shell active="productions" breadcrumb={['Productions']} hot={busy ? `${counts.materializing} materializing` : 'all healthy'} busy={busy}>
      <div className="pad-tight" style={{ maxWidth: 940, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="h1-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ borderLeft: '3px solid var(--t-3)', paddingLeft: 14 }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: 6,
            }}>
              The thing the substrate is for
            </div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Productions</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 0, maxWidth: 580 }}>
              Long-running creative containers — books, series, documentaries, sound pieces.
            </p>
          </div>
          <button className="btn primary"><span className="ico">{NavIcons.Plus}</span>New production</button>
        </div>

        <div className="tabs" style={{ marginTop: 22 }}>
          <a className={`tab ${tab === 'active' ? 'active' : ''}`} onClick={() => setTab('active')}>Active<span className="n">{counts.active}</span></a>
          <a className={`tab ${tab === 'materializing' ? 'active' : ''}`} onClick={() => setTab('materializing')}>Materializing<span className="n">{counts.materializing}</span></a>
          <a className={`tab ${tab === 'dormant' ? 'active' : ''}`} onClick={() => setTab('dormant')}>Dormant<span className="n">{counts.dormant}</span></a>
          <a className={`tab ${tab === 'published' ? 'active' : ''}`} onClick={() => setTab('published')}>Published<span className="n">{counts.published}</span></a>
        </div>

        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="ico">{NavIcons.Productions}</div>
            <h3>No productions in this state yet</h3>
            <p>Open a ready cluster and click <strong>Produce a draft</strong> to start one — or click New production for a blank slate.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {filtered.map(p => <ProductionCard key={p.id} p={p}/>)}
          </div>
        )}
      </div>
    </Shell>
  )
}

function ProductionCard({ p }: { p: ProductionRow }) {
  let stats: [string, string][] = []
  try {
    if (p.stats_json) {
      const parsed = JSON.parse(p.stats_json) as Record<string, string | number>
      stats = Object.entries(parsed).map(([k, v]) => [String(v), k])
    }
  } catch {}

  return (
    <Link href={`/projects/${p.id}`} style={{
      display: 'block',
      background: 'var(--bg-1)',
      border: '1px solid var(--line)',
      borderRadius: 10,
      padding: '22px 24px',
      opacity: p.state === 'dormant' ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', gap: 30, alignItems: 'flex-start' }}>
        <div style={{ flex: 1.5, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <TopicDot topic={(p.topic_color_token ?? 'misc').toLowerCase()}/>
            <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.3 }}>{p.kind ?? 'production'}</span>
            {p.state === 'materializing' && <span className="pill hot">● materializing</span>}
            {p.state === 'developing' && <span className="pill accent">developing</span>}
            {p.state === 'dormant' && <span className="pill mute">dormant</span>}
            {(p.state === 'produced' || p.state === 'published') && <span className="pill ok">published</span>}
            {p.last_touched_at && (
              <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>· touched {formatLastTouched(p.last_touched_at)}</span>
            )}
          </div>
          <div style={{ fontSize: 24, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.4px', marginBottom: 6 }}>{p.name ?? p.id}</div>
          {p.headline && <div style={{ fontSize: 15, color: 'var(--fg-1)', fontStyle: 'italic', lineHeight: 1.4, marginBottom: 12 }}>{p.headline}</div>}
          {p.blurb && <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.6, maxWidth: 580, marginBottom: 18 }}>{p.blurb}</div>}

          {stats.length > 0 && (
            <div style={{ display: 'flex', gap: 28, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
              {stats.map(([v, l]) => (
                <div key={l}>
                  <div style={{ fontSize: 18, color: 'var(--fg)', fontWeight: 500, letterSpacing: '-0.3px', lineHeight: 1 }}>{v}</div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 6 }}>{l}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function formatLastTouched(s: string): string {
  const d = new Date(s)
  const now = new Date()
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (dayDiff < 1) return 'today'
  if (dayDiff === 1) return 'yesterday'
  if (dayDiff < 7) return `${dayDiff}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
