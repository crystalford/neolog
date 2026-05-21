/**
 * Graph — the visual substrate.
 *
 * Pure SVG, no force-directed layout (yet) — deterministic positions
 * hashed from ids so the canvas doesn't shuffle on every reload.
 *
 * Layout strategy:
 *   - Topic territories: faint radial-gradient regions, one per topic
 *     color, positioned by the topic's hash slot.
 *   - Cluster nodes: large circles in the center of each territory,
 *     sized by ripeness, glow by topic color.
 *   - Thread satellites: orbit their parent cluster. Sized by strength.
 *   - Entity dots: scattered near their parent vlog's cluster (or in
 *     the "misc" territory when unclustered).
 *
 * Interactive:
 *   - Click any node → side panel with details + open in detail page
 *   - Time-lapse scrubber at the bottom: drag to filter the visible
 *     graph to only nodes whose created_at <= scrubber position.
 *     Watch the corpus grow over time.
 *
 * Reads /api/v2/graph (operator-scoped).
 */
'use client'

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { editorialLabel, formatDate, formatFullDate, truncate } from '@/components/threadkit'

interface ClusterNode {
  id: string; label: string; topic: string
  state: string; ripeness: number; thread_count: number; created_at: string
}
interface ThreadNode {
  id: string; label: string; topic: string
  cluster_id: string | null; vlog_id: string; strength: number; take: string; extracted_at: string
}
interface EntityNode {
  id: string; label: string; type: string; mention_count: number; vlog_id: string; created_at: string
}
interface Connection { from: string; to: string; strength: number; type: string }

interface GraphData {
  clusters: ClusterNode[]
  threads: ThreadNode[]
  entities: EntityNode[]
  connections: Connection[]
  counts: { clusters: number; threads: number; entities: number; connections: number }
}

type SelectedKind = 'cluster' | 'thread' | 'entity'
interface Selected { kind: SelectedKind; id: string }

const CANVAS_W = 1600
const CANVAS_H = 1000
const MARGIN = 80

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [scrubberPct, setScrubberPct] = useState(1) // 0..1
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    fetch('/api/v2/graph', { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as GraphData))
      .catch(e => setError(String(e?.message || e)))
  }, [])

  // Play loop: advance the scrubber over 12s if playing
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let start = performance.now() - scrubberPct * 12000
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 12000)
      setScrubberPct(p)
      if (p < 1) raf = requestAnimationFrame(tick)
      else setPlaying(false)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  const positions = useMemo(() => layoutAll(data), [data])

  const filtered = useMemo(() => {
    if (!data) return null
    const sortedTimes = [
      ...data.clusters.map(c => new Date(c.created_at).getTime()),
      ...data.threads.map(t => new Date(t.extracted_at).getTime()),
      ...data.entities.map(e => new Date(e.created_at).getTime()),
    ].filter(t => isFinite(t)).sort((a, b) => a - b)
    const earliest = sortedTimes[0] ?? 0
    const latest = sortedTimes[sortedTimes.length - 1] ?? Date.now()
    const cutoff = earliest + (latest - earliest) * scrubberPct
    return {
      clusters: data.clusters.filter(c => new Date(c.created_at).getTime() <= cutoff),
      threads: data.threads.filter(t => new Date(t.extracted_at).getTime() <= cutoff),
      entities: data.entities.filter(e => new Date(e.created_at).getTime() <= cutoff),
      cutoffDate: new Date(cutoff),
    }
  }, [data, scrubberPct])

  if (error) {
    return (
      <Shell active="graph" breadcrumb={['Graph']}>
        <div className="pad-tight" style={{ color: 'var(--err)' }}>Error: {error}</div>
      </Shell>
    )
  }
  if (!data || !filtered) {
    return (
      <Shell active="graph" breadcrumb={['Graph']}>
        <div className="pad-tight" style={{ color: 'var(--fg-3)' }}>Loading the substrate…</div>
      </Shell>
    )
  }

  const visibleClusterIds = new Set(filtered.clusters.map(c => c.id))
  const visibleThreadIds = new Set(filtered.threads.map(t => t.id))

  return (
    <Shell active="graph" breadcrumb={['Graph']}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', overflow: 'hidden' }}>

        {/* Hero strip */}
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          padding: '14px 32px', borderBottom: '1px solid var(--line)',
        }}>
          <div>
            <div style={{
              fontSize: 10, color: 'var(--fg-4)', letterSpacing: 1.2,
              textTransform: 'uppercase',
              fontFamily: 'Geist Mono, ui-monospace, monospace',
              marginBottom: 4,
            }}>
              The substrate · mapped
            </div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px' }}>
              Graph
            </h1>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 24,
            fontSize: 11, color: 'var(--fg-3)',
            fontFamily: 'Geist Mono, ui-monospace, monospace',
          }}>
            <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{data.counts.clusters}</b> clusters</span>
            <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{data.counts.threads}</b> threads</span>
            <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{data.counts.entities}</b> entities</span>
            <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{data.counts.connections}</b> edges</span>
          </div>
        </div>

        {/* Canvas + side panel */}
        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 340px' : '1fr', flex: 1, minHeight: 0 }}>

          <div style={{ position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}>
            <svg
              viewBox={`0 0 ${CANVAS_W} ${CANVAS_H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ width: '100%', height: '100%', display: 'block' }}
              onClick={() => setSelected(null)}
            >
              <defs>
                {Array.from({ length: 8 }, (_, i) => i + 1).map(slot => (
                  <radialGradient key={slot} id={`territory-${slot}`} cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={`var(--t-${slot})`} stopOpacity={0.08}/>
                    <stop offset="100%" stopColor={`var(--t-${slot})`} stopOpacity={0}/>
                  </radialGradient>
                ))}
                <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation={4}/>
                </filter>
              </defs>

              {filtered.clusters.map(c => {
                const p = positions.clusterById.get(c.id)
                if (!p) return null
                const slot = hashSlot(c.topic)
                return (
                  <circle key={`terr-${c.id}`}
                    cx={p.x} cy={p.y} r={180}
                    fill={`url(#territory-${slot})`}
                  />
                )
              })}

              {filtered.threads.map(t => {
                if (!t.cluster_id || !visibleClusterIds.has(t.cluster_id)) return null
                const tp = positions.threadById.get(t.id)
                const cp = positions.clusterById.get(t.cluster_id)
                if (!tp || !cp) return null
                const color = topicColor(t.topic)
                return (
                  <line key={`m-${t.id}`} x1={tp.x} y1={tp.y} x2={cp.x} y2={cp.y}
                    stroke={color} strokeWidth={0.5} strokeOpacity={0.18}/>
                )
              })}

              {data.connections.map((e, i) => {
                if (!visibleThreadIds.has(e.from) || !visibleThreadIds.has(e.to)) return null
                const a = positions.threadById.get(e.from)
                const b = positions.threadById.get(e.to)
                if (!a || !b) return null
                return (
                  <line key={`e-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={`var(--fg-5)`} strokeWidth={0.6} strokeOpacity={Math.max(0.15, e.strength * 0.5)}/>
                )
              })}

              {filtered.entities.map(e => {
                const p = positions.entityById.get(e.id)
                if (!p) return null
                const color = entityColor(e.type)
                const r = 2 + Math.min(4, Math.log2(1 + e.mention_count))
                const sel = selected?.kind === 'entity' && selected.id === e.id
                return (
                  <circle key={`en-${e.id}`}
                    cx={p.x} cy={p.y} r={sel ? r + 2 : r}
                    fill={color}
                    fillOpacity={sel ? 1 : 0.55}
                    style={{ cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); setSelected({ kind: 'entity', id: e.id }) }}
                  />
                )
              })}

              {filtered.threads.map(t => {
                const p = positions.threadById.get(t.id)
                if (!p) return null
                const color = topicColor(t.topic)
                const r = 4 + (t.strength ?? 3)
                const sel = selected?.kind === 'thread' && selected.id === t.id
                return (
                  <g key={`th-${t.id}`}>
                    {sel && <circle cx={p.x} cy={p.y} r={r + 6} fill={color} fillOpacity={0.18}/>}
                    <circle cx={p.x} cy={p.y} r={r}
                      fill={color}
                      fillOpacity={sel ? 1 : 0.85}
                      stroke={sel ? color : 'none'}
                      strokeWidth={sel ? 1 : 0}
                      style={{ cursor: 'pointer' }}
                      onClick={(ev) => { ev.stopPropagation(); setSelected({ kind: 'thread', id: t.id }) }}
                    />
                  </g>
                )
              })}

              {filtered.clusters.map(c => {
                const p = positions.clusterById.get(c.id)
                if (!p) return null
                const color = topicColor(c.topic)
                const r = 18 + Math.min(20, (c.thread_count ?? 0) * 1.5)
                const sel = selected?.kind === 'cluster' && selected.id === c.id
                return (
                  <g key={`cl-${c.id}`} style={{ cursor: 'pointer' }}
                    onClick={(ev) => { ev.stopPropagation(); setSelected({ kind: 'cluster', id: c.id }) }}
                  >
                    <circle cx={p.x} cy={p.y} r={r + 12} fill={color} fillOpacity={sel ? 0.25 : 0.12} filter="url(#nodeGlow)"/>
                    <circle cx={p.x} cy={p.y} r={r} fill={color} fillOpacity={0.95}
                      stroke={sel ? 'var(--fg)' : 'none'} strokeWidth={sel ? 2 : 0}/>
                    <text x={p.x} y={p.y - r - 10} textAnchor="middle"
                      fontFamily="Geist, system-ui, sans-serif" fontSize={13}
                      fill="var(--fg-1)" fontWeight={500}>
                      {truncate(c.label, 28)}
                    </text>
                    <text x={p.x} y={p.y + r + 18} textAnchor="middle"
                      fontFamily="Geist Mono, ui-monospace, monospace" fontSize={10}
                      fill="var(--fg-3)" letterSpacing={0.3}>
                      {c.thread_count} · ripe {Math.round(c.ripeness)}
                    </text>
                  </g>
                )
              })}
            </svg>

            {data.counts.clusters === 0 && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                pointerEvents: 'none',
              }}>
                <div style={{
                  padding: 18, background: 'var(--bg-1)', border: '1px solid var(--line)',
                  borderRadius: 8, maxWidth: 360, textAlign: 'center',
                  color: 'var(--fg-3)', fontSize: 13, lineHeight: 1.6,
                }}>
                  No clusters yet. Click <Link href="/clusters" style={{ color: 'var(--accent)', pointerEvents: 'auto' }}>Build clusters</Link> on the clusters page after extraction lands a few threads on the same abstracted topic.
                </div>
              </div>
            )}
          </div>

          {selected && (
            <aside style={{
              borderLeft: '1px solid var(--line)',
              padding: 22, overflowY: 'auto',
              background: 'var(--bg-1)',
            }}>
              {selected.kind === 'cluster' && (() => {
                const c = data.clusters.find(x => x.id === selected.id)
                if (!c) return null
                const color = topicColor(c.topic)
                const memberThreads = data.threads.filter(t => t.cluster_id === c.id)
                return (
                  <>
                    <div style={editorialLabel(color, 8)}>Cluster · {c.state}</div>
                    <h2 style={{ margin: '0 0 12px', fontSize: 22, fontWeight: 500, letterSpacing: '-0.4px' }}>{c.label}</h2>
                    <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--fg-3)', marginBottom: 18, fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
                      <span><b style={{ color, fontFamily: 'inherit' }}>{c.thread_count}</b> threads</span>
                      <span><b style={{ color, fontFamily: 'inherit' }}>{Math.round(c.ripeness)}</b> ripe</span>
                    </div>
                    {memberThreads.length > 0 && (
                      <div style={{ marginBottom: 18 }}>
                        <div style={editorialLabel('var(--fg-3)', 8)}>Members</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {memberThreads.slice(0, 8).map(t => (
                            <Link key={t.id} href={`/thread/${t.id}`} style={{
                              fontSize: 12, color: 'var(--fg-1)', lineHeight: 1.5,
                              textDecoration: 'none', padding: '6px 8px',
                              borderLeft: `2px solid ${color}`,
                              background: 'var(--bg-2)', borderRadius: 4,
                            }}>{truncate(t.take || t.label, 70)}</Link>
                          ))}
                        </div>
                      </div>
                    )}
                    <Link href={`/cluster/${c.id}`} style={{
                      display: 'block', padding: '10px 14px', textAlign: 'center',
                      background: color, color: 'var(--bg)', border: 'none',
                      borderRadius: 6, textDecoration: 'none',
                      fontSize: 13, fontWeight: 500,
                    }}>Open cluster →</Link>
                  </>
                )
              })()}
              {selected.kind === 'thread' && (() => {
                const t = data.threads.find(x => x.id === selected.id)
                if (!t) return null
                const color = topicColor(t.topic)
                return (
                  <>
                    <div style={editorialLabel(color, 8)}>Thread · strength {t.strength}/5</div>
                    <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 500, lineHeight: 1.4 }}>{t.label}</h2>
                    {t.take && (
                      <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.6, fontStyle: 'italic' }}>
                        “{truncate(t.take, 240)}”
                      </p>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Link href={`/thread/${t.id}`} style={{
                        padding: '10px 14px', textAlign: 'center',
                        background: color, color: 'var(--bg)',
                        borderRadius: 6, textDecoration: 'none',
                        fontSize: 13, fontWeight: 500,
                      }}>Open thread →</Link>
                      <Link href={`/timeline/${t.vlog_id}`} style={{
                        padding: '8px 14px', textAlign: 'center',
                        background: 'var(--bg-2)', color: 'var(--fg-1)',
                        border: '1px solid var(--line)',
                        borderRadius: 6, textDecoration: 'none',
                        fontSize: 12,
                      }}>Open source vlog</Link>
                    </div>
                  </>
                )
              })()}
              {selected.kind === 'entity' && (() => {
                const e = data.entities.find(x => x.id === selected.id)
                if (!e) return null
                const color = entityColor(e.type)
                return (
                  <>
                    <div style={editorialLabel(color, 8)}>Entity · {e.type}</div>
                    <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 500, letterSpacing: '-0.3px' }}>{e.label}</h2>
                    <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 18, fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
                      {e.mention_count} mention{e.mention_count === 1 ? '' : 's'} · first seen {formatDate(e.created_at)}
                    </div>
                    <Link href={`/timeline/${e.vlog_id}`} style={{
                      display: 'block', padding: '10px 14px', textAlign: 'center',
                      background: color, color: 'var(--bg)',
                      borderRadius: 6, textDecoration: 'none',
                      fontSize: 13, fontWeight: 500,
                    }}>Open vlog mentioning →</Link>
                  </>
                )
              })()}
            </aside>
          )}
        </div>

        {/* Time-lapse scrubber */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '12px 32px', borderTop: '1px solid var(--line)',
          background: 'var(--bg-1)',
        }}>
          <button onClick={() => setPlaying(p => !p)} style={{
            width: 32, height: 32, padding: 0,
            background: playing ? 'var(--accent)' : 'var(--bg-2)',
            color: playing ? 'var(--bg)' : 'var(--fg-1)',
            border: '1px solid var(--line)', borderRadius: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {playing
              ? <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor"><rect x="3" y="2.5" width="2.5" height="9"/><rect x="8.5" y="2.5" width="2.5" height="9"/></svg>
              : <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor"><polygon points="3.5,2 11.5,7 3.5,12"/></svg>}
          </button>
          <div style={{ fontSize: 10, color: 'var(--fg-4)', letterSpacing: 0.4, fontFamily: 'Geist Mono, ui-monospace, monospace', minWidth: 80, textTransform: 'uppercase' }}>
            Time-lapse
          </div>
          <input
            type="range" min={0} max={1000} value={Math.round(scrubberPct * 1000)}
            onChange={e => { setScrubberPct(Number(e.target.value) / 1000); setPlaying(false) }}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
          <div style={{ fontSize: 11, color: 'var(--fg-2)', minWidth: 150, textAlign: 'right', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
            {formatFullDate(filtered.cutoffDate.toISOString())}
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ── Layout ──────────────────────────────────────────────────────────

function layoutAll(data: GraphData | null) {
  const clusterById = new Map<string, { x: number; y: number }>()
  const threadById = new Map<string, { x: number; y: number }>()
  const entityById = new Map<string, { x: number; y: number }>()
  if (!data) return { clusterById, threadById, entityById }

  const clusters = data.clusters
  const cols = Math.ceil(Math.sqrt(Math.max(1, clusters.length)))
  const rows = Math.ceil(clusters.length / cols)
  const cellW = (CANVAS_W - MARGIN * 2) / Math.max(1, cols)
  const cellH = (CANVAS_H - MARGIN * 2) / Math.max(1, rows)
  clusters.forEach((c, i) => {
    const col = i % cols
    const row = Math.floor(i / cols)
    const baseX = MARGIN + col * cellW + cellW / 2
    const baseY = MARGIN + row * cellH + cellH / 2
    const h = hashFloat(c.id)
    const jx = (h - 0.5) * cellW * 0.3
    const jy = (hashFloat(c.id + '-y') - 0.5) * cellH * 0.3
    clusterById.set(c.id, { x: baseX + jx, y: baseY + jy })
  })

  const threadsByCluster: Record<string, ThreadNode[]> = {}
  const orphanThreads: ThreadNode[] = []
  for (const t of data.threads) {
    if (t.cluster_id && clusterById.has(t.cluster_id)) {
      ;(threadsByCluster[t.cluster_id] ||= []).push(t)
    } else {
      orphanThreads.push(t)
    }
  }
  for (const [cid, ts] of Object.entries(threadsByCluster)) {
    const cp = clusterById.get(cid)!
    ts.forEach((t, i) => {
      const angle = (i / Math.max(1, ts.length)) * Math.PI * 2 + hashFloat(cid) * Math.PI
      const radius = 70 + hashFloat(t.id) * 60
      threadById.set(t.id, {
        x: cp.x + Math.cos(angle) * radius,
        y: cp.y + Math.sin(angle) * radius,
      })
    })
  }
  orphanThreads.forEach((t, i) => {
    const h = hashFloat(t.id)
    threadById.set(t.id, {
      x: MARGIN + h * (CANVAS_W - MARGIN * 2),
      y: MARGIN + ((i * 37 + 13) % (CANVAS_H - MARGIN * 2)),
    })
  })

  const vlogToCluster: Record<string, string> = {}
  for (const t of data.threads) {
    if (t.cluster_id && !vlogToCluster[t.vlog_id]) {
      vlogToCluster[t.vlog_id] = t.cluster_id
    }
  }
  data.entities.forEach((e, i) => {
    const cid = vlogToCluster[e.vlog_id]
    const cp = cid ? clusterById.get(cid) : null
    if (cp) {
      const angle = hashFloat(e.id) * Math.PI * 2
      const radius = 130 + hashFloat(e.id + '-r') * 50
      entityById.set(e.id, {
        x: cp.x + Math.cos(angle) * radius,
        y: cp.y + Math.sin(angle) * radius,
      })
    } else {
      const h = hashFloat(e.id)
      entityById.set(e.id, {
        x: MARGIN / 2 + h * (CANVAS_W - MARGIN),
        y: MARGIN / 2 + ((i * 53 + 7) % (CANVAS_H - MARGIN)),
      })
    }
  })

  return { clusterById, threadById, entityById }
}

function hashFloat(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 10000) / 10000
}
function hashSlot(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return (h % 8) + 1
}
function entityColor(t: string): string {
  return ({
    person: 'var(--t-5)', place: 'var(--t-3)', concept: 'var(--t-2)',
    tool: 'var(--t-6)', project: 'var(--t-4)', theme: 'var(--t-8)', reference: 'var(--t-1)',
  } as Record<string, string>)[t] || 'var(--fg-3)'
}
