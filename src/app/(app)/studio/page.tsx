/**
 * Studio — cluster cultivation. Cards show ripeness, adjacent insights,
 * gap questions, and production candidates. When a cluster reaches Ready,
 * the operator clicks Materialize to go to the production engine.
 *
 * Faithful port from prototypes/studio.html. Reads from /api/v2/clusters
 * (graceful empty state until clusters populate).
 */
'use client'

import { useEffect, useState } from 'react'

type State = 'ripening' | 'ready' | 'hold'

interface InsightItem {
  kind: string
  body: string // HTML allowed: <strong>, <em>
}

interface ClusterCard {
  id: string
  topic_color: string  // hex or token name
  name: string
  form: string         // e.g. "Concept · Mid"
  state: State
  headline: string
  take: string
  ripeness: number     // 0-100
  insights?: { label: string; items: InsightItem[] }
  gap_question?: string  // HTML allowed
  outputs?: { name: string; live: boolean }[]
  stats: { threads: number; sessions: number; sources?: number; since_viewed?: number; new_today?: number; awaiting?: boolean }
  primary_action: string  // "Materialize" | "Develop" | "Resume"
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'ripening', label: 'Ripening' },
  { key: 'ready', label: 'Ready' },
  { key: 'hold', label: 'Held' },
] as const
type Filter = (typeof FILTERS)[number]['key']

export default function StudioPage() {
  const [clusters, setClusters] = useState<ClusterCard[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v2/clusters', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { clusters: [] })
      .then(d => { setClusters(d.clusters || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = filter === 'all' ? clusters : clusters.filter(c => c.state === filter)
  const counts = {
    all: clusters.length,
    ripening: clusters.filter(c => c.state === 'ripening').length,
    ready: clusters.filter(c => c.state === 'ready').length,
    hold: clusters.filter(c => c.state === 'hold').length,
  }
  const ready = counts.ready

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Living threads</div>
        <h1 className="reveal d3">
          {clusters.length > 0 ? (
            <>
              {clusters.length} piece{clusters.length === 1 ? '' : 's'}<br />
              quietly cultivating.<br />
              {ready > 0 && <span className="alive">{ready === 1 ? 'One came ripe.' : `${ready} came ripe.`}</span>}
            </>
          ) : (
            <>Nothing<br />ripening yet.</>
          )}
        </h1>
        <p className="lead reveal d4">
          {clusters.length > 0
            ? 'The system has been working alongside you. When a cluster turns Ready, you take it to the production engine.'
            : "Clusters form once three or more threads share a topic. Drop in a few vlogs and the system will start cultivating."}
        </p>
      </section>

      {clusters.length > 0 && (
        <div className="filter-bar reveal d4" style={{ padding: '16px 24px 0' }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              className={`fchip ${filter === f.key ? 'active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label} <span className="num">{counts[f.key]}</span>
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="empty-row reveal d5">
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && clusters.length > 0 && (
        <div className="empty-row reveal d5">
          <p>No clusters in this state.</p>
        </div>
      )}

      <div className="deck" style={{ marginTop: 16 }}>
        {filtered.map((c, i) => (
          <a
            key={c.id}
            href={`/cluster/${c.id}`}
            className={`ccard ${c.state} reveal d${Math.min(4 + i, 7) as 4 | 5 | 6 | 7}`}
            style={{ ['--topic' as any]: cssColor(c.topic_color), ['--topic-glow' as any]: cssGlow(c.topic_color) }}
          >
            <div className="cluster-band">
              <div className="cluster-head">
                <span className="dot" />
                <span className="name">{c.name}</span>
                <span className="sep">·</span>
                <span className="form">{c.form}</span>
                <span className="state">{stateLabel(c.state)}</span>
              </div>
              <h2>{c.headline}</h2>
              <div className="take-line">{c.take}</div>
              <div className="ripe-row">
                <div className="ripe-track"><div className="ripe-fill" style={{ width: `${c.ripeness}%` }} /></div>
                <span className="ripe-num">{c.ripeness}/100</span>
              </div>
            </div>

            {c.insights && (
              <div className="insight-feed">
                <div className="insight-label"><span className="pulse" />{c.insights.label}</div>
                {c.insights.items.map((ins, idx) => (
                  <div key={idx} className="insight-item">
                    <span className="kind">{ins.kind}</span>
                    <div className="body" dangerouslySetInnerHTML={{ __html: ins.body }} />
                  </div>
                ))}
              </div>
            )}

            {c.gap_question && (
              <div className="gap-question">
                <span className="ico"><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" /><path d="M7 4 L7 7 L9 8.5" /></svg></span>
                <p dangerouslySetInnerHTML={{ __html: c.gap_question }} />
              </div>
            )}

            {c.outputs && c.outputs.length > 0 && (
              <div className="outs-block">
                <div className="outs-label">Production candidates</div>
                <div className="outs">
                  {c.outputs.map(o => <span key={o.name} className={`out ${o.live ? 'live' : ''}`}>{o.name}</span>)}
                </div>
              </div>
            )}

            <div className="cluster-foot">
              <div className="cluster-stats">
                {c.stats.awaiting && <span>Awaiting more material</span>}
                <span><span className="n">{c.stats.threads}</span> threads</span>
                <span><span className="n">{c.stats.sessions}</span> sessions</span>
                {c.stats.sources !== undefined && <span><span className="n">{c.stats.sources}</span> sources</span>}
                {c.stats.since_viewed !== undefined && <span className="new">+{c.stats.since_viewed} since viewed</span>}
                {c.stats.new_today !== undefined && <span className="new">+{c.stats.new_today} today</span>}
              </div>
              <div className="cluster-acts">
                {c.state === 'ready' && <button className="act" onClick={e => { e.preventDefault() }}>Hold</button>}
                <span className="act go">{c.primary_action}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </main>
  )
}

function stateLabel(s: State): string {
  if (s === 'ready') return 'Ready'
  if (s === 'hold') return 'Held for more'
  return 'Ripening'
}

function cssColor(input: string): string {
  if (input.startsWith('#') || input.startsWith('rgb') || input.startsWith('var(')) return input
  return `var(--t-${input})`
}
function cssGlow(input: string): string {
  // Simple opaque ramp; the cards already apply the gradient.
  return `rgba(${hexToRgb(input).join(',')},0.10)`
}
function hexToRgb(input: string): [number, number, number] {
  // Resolve token names to hexes from the design tokens (rough approximation)
  const map: Record<string, string> = {
    brass: '#d18847', terra: '#c66042', ochre: '#b48b3c', rose: '#b56676',
    plum: '#8662a8', violet: '#6e6cb8', steel: '#4d8aa8', teal: '#4d9988',
    sage: '#7a9a6a', moss: '#5e7d5e',
  }
  const hex = (input.startsWith('#') ? input : (map[input] || '#7a7160')).replace('#', '')
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)]
}
