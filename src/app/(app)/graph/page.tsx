/**
 * Graph — visual substrate. Clusters as large nodes, threads as medium
 * nodes attached to their cluster, entities as small dots near the vlogs
 * that mention them.
 *
 * Real data from /api/v2/graph (built from D1 clusters/threads/entities
 * tables). Layout is a static radial-by-cluster placement: each cluster
 * gets a slice of the canvas, threads radiate around it, entities
 * scatter near the edges. No physics — just enough to read the shape.
 *
 * Empty state shows when the operator has no clusters yet.
 */
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { TopicDot } from '@/components/Shell'

interface GraphNode {
  id: string
  kind: 'cluster' | 'thread' | 'entity'
  label: string
  size: number
  color?: string
  parent?: string
  state?: string
  strength?: number
  entity_type?: string
  mention_count?: number
}

interface GraphEdge {
  from: string
  to: string
  kind: 'membership' | 'cosine' | 'mention'
  weight?: number
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  counts: { clusters: number; threads: number; entities: number; connections: number }
  has_data: boolean
}

const TOPIC_COLOR: Record<string, string> = {
  curbsider:    '#60a5fa',
  memory:       '#a78bfa',
  form:         '#34d399',
  'pack rats':  '#fb923c',
  voice:        '#f472b6',
  graph:        '#2dd4bf',
  regulation:   '#fbbf24',
  misc:         '#c084fc',
}
const ENTITY_COLOR: Record<string, string> = {
  person:    '#a78bfa',
  place:     '#60a5fa',
  project:   '#fb923c',
  tool:      '#2dd4bf',
  concept:   '#34d399',
  theme:     '#f472b6',
  reference: '#fbbf24',
}
const colorFor = (n: GraphNode): string => {
  if (n.kind === 'entity') return ENTITY_COLOR[n.entity_type ?? ''] ?? '#71717a'
  return TOPIC_COLOR[n.color?.toLowerCase() ?? ''] ?? '#71717a'
}

export default function GraphPage() {
  const [data, setData] = useState<GraphData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/v2/graph', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const counts = data?.counts ?? { clusters: 0, threads: 0, entities: 0, connections: 0 }
  const selected = data?.nodes.find(n => n.id === selectedId) ?? null

  return (
    <Shell active="graph" breadcrumb={['Graph']}>
      <div className="pad">
        <div className="h1-row">
          <div>
            <h1>Graph</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 6 }}>
              {loading
                ? 'Loading…'
                : `${counts.threads} threads · ${counts.clusters} clusters · ${counts.entities} entities · ${counts.connections} cross-links`}
            </p>
          </div>
        </div>

        {!loading && (!data || !data.has_data) ? (
          <div className="empty" style={{ marginTop: 32 }}>
            <h3>Graph populates as clusters form</h3>
            <p>
              You need at least one cluster for the graph to take shape (clusters
              form automatically when 3+ threads converge on the same abstracted
              topic). Drop in more vlogs and run the unified extraction — the
              graph fills in as the substrate grows.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 280px' : '1fr', gap: 18, marginTop: 18 }}>
            <div style={{
              background: 'var(--bg-1)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              padding: 0,
              overflow: 'hidden',
              aspectRatio: '4/3',
              minHeight: 480,
            }}>
              {data && <GraphCanvas data={data} selectedId={selectedId} onSelect={setSelectedId} />}
            </div>

            {selected && (
              <div className="card">
                <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  {selected.kind}
                </div>
                <div style={{ fontSize: 16, color: 'var(--fg)', fontWeight: 500, marginBottom: 10 }}>
                  {selected.label}
                </div>
                {selected.kind === 'cluster' && (
                  <Link href={`/cluster/${selected.id}`} className="btn primary" style={{ width: '100%', justifyContent: 'center' }}>
                    Open cluster
                  </Link>
                )}
                {selected.kind === 'thread' && (
                  <Link href={`/thread/${selected.id}`} className="btn" style={{ width: '100%', justifyContent: 'center' }}>
                    Open thread
                  </Link>
                )}
                {selected.kind === 'entity' && (
                  <div className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                    {selected.entity_type} · mentioned {selected.mention_count ?? 1}×
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Shell>
  )
}

function GraphCanvas({ data, selectedId, onSelect }: { data: GraphData; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const W = 900, H = 700
  const cx = W / 2, cy = H / 2

  // Position clusters radially around the center.
  const clusters = data.nodes.filter(n => n.kind === 'cluster')
  const threads = data.nodes.filter(n => n.kind === 'thread')
  const entities = data.nodes.filter(n => n.kind === 'entity')

  const posById: Record<string, { x: number; y: number }> = {}
  const clusterRadius = clusters.length === 0 ? 0 : Math.min(W, H) * 0.32

  if (clusters.length === 1) {
    posById[clusters[0].id] = { x: cx, y: cy - 40 }
  } else if (clusters.length > 1) {
    clusters.forEach((c, i) => {
      const angle = (i / clusters.length) * Math.PI * 2 - Math.PI / 2
      posById[c.id] = {
        x: cx + Math.cos(angle) * clusterRadius,
        y: cy + Math.sin(angle) * clusterRadius,
      }
    })
  }

  // Position threads around their cluster (or in a corner blob if unclustered).
  const threadsByParent: Record<string, GraphNode[]> = {}
  for (const t of threads) {
    const key = t.parent ?? '__orphan__'
    if (!threadsByParent[key]) threadsByParent[key] = []
    threadsByParent[key].push(t)
  }
  for (const [parent, group] of Object.entries(threadsByParent)) {
    const center = posById[parent] ?? { x: cx + 200, y: cy + 200 }
    const r = 70 + Math.min(60, group.length * 3)
    group.forEach((t, i) => {
      const a = (i / group.length) * Math.PI * 2
      posById[t.id] = {
        x: center.x + Math.cos(a) * r,
        y: center.y + Math.sin(a) * r,
      }
    })
  }

  // Entities scatter in the outer ring.
  entities.forEach((e, i) => {
    const a = (i / Math.max(1, entities.length)) * Math.PI * 2
    const r = Math.min(W, H) * 0.46
    posById[e.id] = { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }
  })

  return (
    <svg viewBox={`0 0 ${W} ${H}`} xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%', cursor: 'pointer' }}
      onClick={(ev) => {
        if (ev.target === ev.currentTarget) onSelect(null)
      }}>
      {/* Membership edges */}
      <g stroke="var(--line-1)" strokeWidth="0.6" opacity="0.6" fill="none">
        {data.edges.filter(e => e.kind === 'membership').map((e, i) => {
          const a = posById[e.from], b = posById[e.to]
          if (!a || !b) return null
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        })}
      </g>
      {/* Cosine edges (dashed) */}
      <g stroke="var(--accent)" strokeWidth="0.5" opacity="0.4" strokeDasharray="2,3" fill="none">
        {data.edges.filter(e => e.kind === 'cosine').map((e, i) => {
          const a = posById[e.from], b = posById[e.to]
          if (!a || !b) return null
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} opacity={(e.weight ?? 0.5)} />
        })}
      </g>
      {/* Nodes */}
      {[...threads, ...entities, ...clusters].map(n => {
        const p = posById[n.id]
        if (!p) return null
        const color = colorFor(n)
        const isSel = n.id === selectedId
        return (
          <g key={n.id} onClick={(ev) => { ev.stopPropagation(); onSelect(n.id) }} style={{ cursor: 'pointer' }}>
            {n.kind === 'cluster' && (
              <circle cx={p.x} cy={p.y} r={n.size + 8} fill={color} opacity={0.12} />
            )}
            <circle
              cx={p.x} cy={p.y} r={n.size}
              fill={color}
              opacity={isSel ? 1 : (n.kind === 'cluster' ? 1 : n.kind === 'thread' ? 0.85 : 0.7)}
              stroke={isSel ? 'var(--fg)' : 'none'}
              strokeWidth={isSel ? 2 : 0}
            />
            {n.kind === 'cluster' && (
              <text
                x={p.x} y={p.y - n.size - 8}
                textAnchor="middle"
                fontFamily="var(--font-body)"
                fontSize="11"
                fill="var(--fg-1)"
                fontWeight="500"
              >
                {n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label}
              </text>
            )}
          </g>
        )
      })}
      <text x="20" y={H - 14} fontFamily="var(--font-mono)" fontSize="9" fill="var(--fg-4)" letterSpacing="1">
        {data.counts.clusters} CLUSTERS · {data.counts.threads} THREADS · {data.counts.entities} ENTITIES
      </text>
    </svg>
  )
}
