'use client'

/**
 * Graph — the substrate, walked. Canon rebuild per
 * /tmp/neolognextlevel/design-reference/05-Graph.html
 *
 * Sections:
 *   1. Hero      — eyebrow + "The graph, walked." h1 + 5-stat strip
 *   2. Toolbar   — filter chips (All / Clusters / Threads / Entities)
 *                  + view-mode buttons (Territory / Nodes / Time-lapse)
 *   3. Canvas    — full SVG with topic territory radial gradients,
 *                  cluster nodes sized by ripeness, thread satellites
 *                  orbiting clusters, entity dots on the rim, edges
 *                  between connected nodes. Selected-node panel in
 *                  right rail.
 *   4. Scrubber  — bottom range slider showing corpus growth over time
 *
 * Layout is deterministic (hash by id) so the graph is stable across
 * page loads. No physics simulation.
 *
 * Data: /api/v2/graph.
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface Cluster { id: string; label: string; topic: string; state: string; ripeness: number; thread_count: number; created_at: string }
interface Thread  { id: string; label: string; topic: string; cluster_id: string | null; vlog_id: string; strength: number; take: string; extracted_at: string }
interface Entity  { id: string; label: string; type: string; mention_count: number; vlog_id: string; created_at: string }
interface Edge    { from: string; to: string; strength: number; type: string }
interface Payload {
  clusters: Cluster[]; threads: Thread[]; entities: Entity[]; connections: Edge[]
  counts: { clusters: number; threads: number; entities: number; connections: number }
}

const TOPIC_TOKENS = [
  '--t-brass', '--t-terra', '--t-ochre', '--t-rose', '--t-plum',
  '--t-violet', '--t-steel', '--t-teal', '--t-sage', '--t-moss',
] as const
function topicVar(topic?: string | null): string {
  const t = (topic ?? '').trim().toLowerCase()
  if (!t) return '--fg-3'
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return TOPIC_TOKENS[h % TOPIC_TOKENS.length]
}
function hash01(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 10000) / 10000
}

type View = 'territory' | 'nodes' | 'timelapse'
type Filter = 'all' | 'clusters' | 'threads' | 'entities'

const W = 1100
const H = 720
const CX = W / 2
const CY = H / 2

export default function GraphPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<View>('territory')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<{ kind: 'cluster' | 'thread' | 'entity'; id: string } | null>(null)
  const [scrubPos, setScrubPos] = useState<number>(1) // 0..1, 1 = now

  useEffect(() => {
    fetch('/api/v2/graph', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as Payload))
      .catch(e => setError(String(e?.message || e)))
  }, [])

  // Deterministic layout — topics get polar regions, clusters anchor
  // within their topic's region, threads orbit their cluster, entities
  // scatter on the rim.
  const layout = useMemo(() => {
    if (!data) return null
    const topics = Array.from(new Set([
      ...data.clusters.map(c => c.topic),
      ...data.threads.map(t => t.topic),
    ]))
    const topicAngle = new Map<string, number>()
    topics.forEach((t, i) => {
      const idx = i / Math.max(1, topics.length)
      topicAngle.set(t, idx * Math.PI * 2)
    })

    const clusterPos = new Map<string, { x: number; y: number }>()
    data.clusters.forEach(c => {
      const a = topicAngle.get(c.topic) ?? 0
      const r = 160 + hash01(c.id) * 70
      const jitter = (hash01(c.id + 'a') - 0.5) * 0.4
      clusterPos.set(c.id, {
        x: CX + Math.cos(a + jitter) * r,
        y: CY + Math.sin(a + jitter) * r,
      })
    })

    const threadPos = new Map<string, { x: number; y: number }>()
    data.threads.forEach(t => {
      const c = t.cluster_id ? clusterPos.get(t.cluster_id) : null
      if (c) {
        const a = hash01(t.id) * Math.PI * 2
        const r = 30 + (5 - (t.strength ?? 3)) * 8 + hash01(t.id + 'r') * 18
        threadPos.set(t.id, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r })
      } else {
        const a = topicAngle.get(t.topic) ?? hash01(t.id) * Math.PI * 2
        const r = 280 + hash01(t.id) * 40
        threadPos.set(t.id, { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r })
      }
    })

    const entityPos = new Map<string, { x: number; y: number }>()
    data.entities.forEach(e => {
      const a = hash01(e.id) * Math.PI * 2
      const r = 290 + hash01(e.id + 'r') * 50
      entityPos.set(e.id, { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r })
    })

    const territoryAnchors = topics.map(t => {
      const a = topicAngle.get(t) ?? 0
      const r = 200
      return {
        topic: t,
        cx: CX + Math.cos(a) * r,
        cy: CY + Math.sin(a) * r,
      }
    })

    return { topics, topicAngle, clusterPos, threadPos, entityPos, territoryAnchors }
  }, [data])

  // Time-lapse — dim nodes whose timestamp is after scrubPos
  const allTimes = useMemo(() => {
    if (!data) return { lo: 0, hi: 1, span: 1 }
    const all = [
      ...data.clusters.map(c => new Date(c.created_at).getTime()),
      ...data.threads.map(t => new Date(t.extracted_at).getTime()),
      ...data.entities.map(e => new Date(e.created_at).getTime()),
    ].filter(Number.isFinite)
    if (all.length === 0) return { lo: 0, hi: 1, span: 1 }
    const lo = Math.min(...all); const hi = Math.max(...all)
    return { lo, hi, span: Math.max(1, hi - lo) }
  }, [data])

  const visibleAt = (createdAt: string): number => {
    if (view !== 'timelapse') return 1
    const t = (new Date(createdAt).getTime() - allTimes.lo) / allTimes.span
    return t <= scrubPos ? 1 : 0.05
  }

  const selectedData = useMemo(() => {
    if (!selected || !data) return null
    if (selected.kind === 'cluster') return data.clusters.find(c => c.id === selected.id) ?? null
    if (selected.kind === 'thread')  return data.threads.find(t => t.id === selected.id) ?? null
    if (selected.kind === 'entity')  return data.entities.find(e => e.id === selected.id) ?? null
    return null
  }, [selected, data])

  const neighbors = useMemo(() => {
    if (!selected || !data) return [] as { id: string; label: string; kind: 'cluster' | 'thread' | 'entity'; topic?: string }[]
    if (selected.kind === 'cluster') {
      return data.threads.filter(t => t.cluster_id === selected.id).slice(0, 8)
        .map(t => ({ id: t.id, label: t.label, kind: 'thread' as const, topic: t.topic }))
    }
    if (selected.kind === 'thread') {
      const t = data.threads.find(t => t.id === selected.id)
      const out: { id: string; label: string; kind: 'cluster' | 'thread' | 'entity'; topic?: string }[] = []
      if (t?.cluster_id) {
        const c = data.clusters.find(c => c.id === t.cluster_id)
        if (c) out.push({ id: c.id, label: c.label, kind: 'cluster', topic: c.topic })
      }
      data.connections
        .filter(e => e.from === selected.id || e.to === selected.id)
        .slice(0, 6)
        .forEach(e => {
          const otherId = e.from === selected.id ? e.to : e.from
          const ot = data.threads.find(t => t.id === otherId)
          if (ot) out.push({ id: ot.id, label: ot.label, kind: 'thread', topic: ot.topic })
        })
      return out
    }
    return []
  }, [selected, data])

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '40px 0 28px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
          The substrate · territory
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 68, lineHeight: 1.0, letterSpacing: '-2.6px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          The graph<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> walked<span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 580, letterSpacing: '-0.15px', marginBottom: 28,
        }}>
          Topic territories form regions. Clusters anchor; threads orbit; entities scatter.
          Click any node to see its neighborhood.
        </p>

        {data && (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 24,
            paddingTop: 22, borderTop: '1px solid var(--line)',
          }}>
            <StatCell n={layout?.topics.length ?? 0} l="Topics"/>
            <StatCell n={data.counts.clusters} l="Clusters"/>
            <StatCell n={data.counts.threads} l="Threads"/>
            <StatCell n={data.counts.entities} l="Entities"/>
            <StatCell n={data.counts.connections} l="Edges"/>
          </div>
        )}
      </section>

      {/* Toolbar */}
      <div className="canon-reveal d2" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 14, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['all', 'clusters', 'threads', 'entities'] as Filter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`canon-filter-chip ${filter === f ? 'active' : ''}`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {data && f !== 'all' && <span className="n">{data.counts[f]}</span>}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['territory', 'nodes', 'timelapse'] as View[]).map(v => (
            <button key={v} onClick={() => setView(v)} className={`canon-filter-chip ${view === v ? 'active' : ''}`}>
              {v === 'timelapse' ? 'Time-lapse' : v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {error && <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>}
      {!error && !data && <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading graph…</div>}

      {data && layout && (
        <div className="canon-reveal d3" style={{
          display: 'grid', gridTemplateColumns: '1fr 300px', gap: 18,
        }}>
          {/* Canvas */}
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--line-1)',
            borderRadius: 14,
            overflow: 'hidden',
            position: 'relative',
            minHeight: 720,
          }}>
            <div style={{
              position: 'absolute', top: 14, left: 16,
              fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.6,
              textTransform: 'uppercase', color: 'var(--fg-3)',
              display: 'inline-flex', alignItems: 'center', gap: 8, zIndex: 1,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)', animation: 'canon-pulse 2.4s ease-in-out infinite' }}/>
              Live · neolog.ai
            </div>
            <div style={{
              position: 'absolute', top: 14, right: 16,
              fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.6,
              textTransform: 'uppercase', color: 'var(--fg-3)', zIndex: 1,
            }}>
              {view === 'territory' ? 'Territory view' : view === 'nodes' ? 'Nodes only' : 'Time-lapse'}
            </div>

            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%', display: 'block' }}>
              <defs>
                {layout.territoryAnchors.map((a, i) => (
                  <radialGradient key={i} id={`terr-${i}`} cx={`${(a.cx / W) * 100}%`} cy={`${(a.cy / H) * 100}%`} r="35%">
                    <stop offset="0%" stopColor={`var(${topicVar(a.topic)})`} stopOpacity={view === 'nodes' ? '0' : '0.18'}/>
                    <stop offset="100%" stopColor={`var(${topicVar(a.topic)})`} stopOpacity="0"/>
                  </radialGradient>
                ))}
              </defs>

              {/* Territory backdrops */}
              {view !== 'nodes' && layout.territoryAnchors.map((a, i) => (
                <rect key={i} x="0" y="0" width={W} height={H} fill={`url(#terr-${i})`}/>
              ))}

              {/* Thread-thread connection edges */}
              {(filter === 'all' || filter === 'threads') && data.connections.map((e, i) => {
                const a = layout.threadPos.get(e.from)
                const b = layout.threadPos.get(e.to)
                if (!a || !b) return null
                return (
                  <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke="var(--line-2)" strokeWidth={0.5 + (e.strength ?? 0.5)} opacity={0.5}/>
                )
              })}

              {/* Cluster→thread radial spokes */}
              {(filter === 'all' || filter === 'clusters' || filter === 'threads') && data.threads.map(t => {
                if (!t.cluster_id) return null
                const c = layout.clusterPos.get(t.cluster_id)
                const p = layout.threadPos.get(t.id)
                if (!c || !p) return null
                return (
                  <line key={`tc-${t.id}`} x1={c.x} y1={c.y} x2={p.x} y2={p.y}
                    stroke={`var(${topicVar(t.topic)})`} strokeWidth={0.4} opacity={0.25}/>
                )
              })}

              {/* Entity dots */}
              {(filter === 'all' || filter === 'entities') && data.entities.map(e => {
                const p = layout.entityPos.get(e.id)
                if (!p) return null
                const isSelected = selected?.kind === 'entity' && selected.id === e.id
                const op = visibleAt(e.created_at) * (selected && !isSelected ? 0.35 : 1)
                return (
                  <circle key={e.id} cx={p.x} cy={p.y}
                    r={Math.max(2, Math.min(4.5, 1.5 + Math.log2(1 + (e.mention_count ?? 1)) * 0.8))}
                    fill="var(--fg-3)" opacity={op}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelected({ kind: 'entity', id: e.id })}>
                    <title>{e.label} ({e.type}) · {e.mention_count} mentions</title>
                  </circle>
                )
              })}

              {/* Threads */}
              {(filter === 'all' || filter === 'threads') && data.threads.map(t => {
                const p = layout.threadPos.get(t.id)
                if (!p) return null
                const isSelected = selected?.kind === 'thread' && selected.id === t.id
                const op = visibleAt(t.extracted_at) * (selected && !isSelected ? 0.4 : 1)
                return (
                  <circle key={t.id} cx={p.x} cy={p.y}
                    r={3 + (t.strength ?? 3) * 0.8}
                    fill={`var(${topicVar(t.topic)})`}
                    opacity={op}
                    style={{
                      cursor: 'pointer',
                      filter: isSelected ? `drop-shadow(0 0 8px var(${topicVar(t.topic)}))` : undefined,
                    }}
                    onClick={() => setSelected({ kind: 'thread', id: t.id })}>
                    <title>{t.label} · strength {t.strength ?? 3}</title>
                  </circle>
                )
              })}

              {/* Clusters (on top) */}
              {(filter === 'all' || filter === 'clusters') && data.clusters.map(c => {
                const p = layout.clusterPos.get(c.id)
                if (!p) return null
                const ripe = c.ripeness ?? 0
                const isSelected = selected?.kind === 'cluster' && selected.id === c.id
                const op = visibleAt(c.created_at) * (selected && !isSelected ? 0.45 : 1)
                const tcolor = `var(${topicVar(c.topic)})`
                return (
                  <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => setSelected({ kind: 'cluster', id: c.id })}>
                    {ripe >= 70 && (
                      <circle cx={p.x} cy={p.y} r={14 + ripe / 10} fill="none" stroke="var(--sig)" strokeWidth={1} strokeDasharray="2 3" opacity={op * 0.6}/>
                    )}
                    <circle cx={p.x} cy={p.y}
                      r={8 + Math.log2(1 + c.thread_count) * 4}
                      fill={tcolor}
                      opacity={op * 0.95}
                      style={{ filter: `drop-shadow(0 0 ${isSelected ? 14 : 6}px ${tcolor})` }}>
                      <title>{c.label} · {c.thread_count} threads · {Math.round(ripe)} ripe</title>
                    </circle>
                  </g>
                )
              })}
            </svg>

            {/* Time-lapse scrubber */}
            {view === 'timelapse' && (
              <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '14px 20px 16px',
                background: 'linear-gradient(180deg, transparent, var(--bg-1) 40%)',
                borderTop: '1px solid var(--line-1)',
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.5,
                  textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 8,
                  display: 'flex', justifyContent: 'space-between',
                }}>
                  <span>earliest</span>
                  <span style={{ color: 'var(--sig)' }}>
                    {Math.round(scrubPos * 100)}% · {scrubPos >= 1 ? 'now' : new Date(allTimes.lo + scrubPos * allTimes.span).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                  <span>now</span>
                </div>
                <input
                  type="range" min={0} max={100} value={Math.round(scrubPos * 100)}
                  onChange={e => setScrubPos(parseInt(e.target.value, 10) / 100)}
                  style={{ width: '100%', accentColor: 'var(--sig)' }}
                />
              </div>
            )}
          </div>

          {/* Rail */}
          <aside className="canon-detail-rail">
            {!selected && (
              <div className="rail-card">
                <div className="rc-head"><h3>Selected node</h3></div>
                <div style={{
                  fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.55,
                  textAlign: 'center', padding: '18px 4px',
                }}>
                  Click any node on the canvas to inspect its neighborhood.
                </div>
              </div>
            )}

            {selected && selectedData && (
              <div className="rail-card">
                <div className="rc-head">
                  <h3>{selected.kind === 'cluster' ? 'Cluster' : selected.kind === 'thread' ? 'Thread' : 'Entity'}</h3>
                  <button onClick={() => setSelected(null)} className="more">close</button>
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500,
                  color: 'var(--fg)', letterSpacing: '-0.3px', lineHeight: 1.3,
                  marginBottom: 12,
                }}>
                  {(selectedData as any).label}
                </div>
                {selected.kind === 'cluster' && (
                  <>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: 'var(--fg-3)', marginBottom: 12,
                    }}>
                      {(selectedData as Cluster).state} · {(selectedData as Cluster).thread_count} threads · {Math.round((selectedData as Cluster).ripeness)} ripe
                    </div>
                    <Link href={`/studio/${selected.id}`} className="canon-btn primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
                      Open in Studio
                    </Link>
                  </>
                )}
                {selected.kind === 'thread' && (
                  <>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: 'var(--fg-3)', marginBottom: 8,
                    }}>
                      strength {(selectedData as Thread).strength} · {(selectedData as Thread).topic}
                    </div>
                    {(selectedData as Thread).take && (
                      <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5, marginBottom: 12, fontStyle: 'italic' }}>
                        “{(selectedData as Thread).take.slice(0, 160)}{(selectedData as Thread).take.length > 160 ? '…' : ''}”
                      </div>
                    )}
                    <Link href={`/thread/${selected.id}`} className="canon-btn primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
                      Open thread
                    </Link>
                  </>
                )}
                {selected.kind === 'entity' && (
                  <>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10,
                      letterSpacing: 1.5, textTransform: 'uppercase',
                      color: 'var(--fg-3)', marginBottom: 12,
                    }}>
                      {(selectedData as Entity).type} · {(selectedData as Entity).mention_count} mentions
                    </div>
                    <Link href={`/entity/${selected.id}`} className="canon-btn primary" style={{ width: '100%', justifyContent: 'center', fontSize: 12 }}>
                      Open entity
                    </Link>
                  </>
                )}
              </div>
            )}

            {selected && neighbors.length > 0 && (
              <div className="rail-card">
                <div className="rc-head"><h3>Neighbors</h3></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {neighbors.map(n => (
                    <button
                      key={n.id}
                      onClick={() => setSelected({ kind: n.kind, id: n.id })}
                      className="canon-sibling"
                      style={{ '--c': `var(${topicVar(n.topic)})`, cursor: 'pointer', background: 'var(--bg-2)', border: 'none', padding: '8px 12px' } as any}
                    >
                      <span className="dot"/>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9,
                        letterSpacing: 1.4, textTransform: 'uppercase',
                        color: 'var(--fg-4)', flexShrink: 0,
                      }}>{n.kind}</span>
                      <span className="name">{n.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="rail-card">
              <div className="rc-head"><h3>Legend</h3></div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                <LegendRow color="var(--sig)" label="Cobalt ring · ripe ≥ 70"/>
                <LegendRow color="var(--t-terra)" label="Cluster (sized by threads)"/>
                <LegendRow color="var(--t-violet)" label="Thread (sized by strength)" small/>
                <LegendRow color="var(--fg-3)" label="Entity dot" small/>
              </div>
            </div>
          </aside>
        </div>
      )}
    </Shell>
  )
}

function StatCell({ n, l }: { n: number; l: string }) {
  return (
    <div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 300,
        fontSize: 36, letterSpacing: '-1.4px',
        color: 'var(--fg)', lineHeight: 1,
        fontVariantNumeric: 'tabular-nums',
      }}>{n.toLocaleString()}</div>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9.5,
        letterSpacing: 1.8, textTransform: 'uppercase',
        color: 'var(--fg-3)', marginTop: 6, fontWeight: 500,
      }}>{l}</div>
    </div>
  )
}

function LegendRow({ color, label, small }: { color: string; label: string; small?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: small ? 8 : 12, height: small ? 8 : 12,
        borderRadius: '50%', background: color,
        boxShadow: `0 0 6px ${color}80`,
        flexShrink: 0,
      }}/>
      <span style={{ color: 'var(--fg-2)' }}>{label}</span>
    </div>
  )
}
