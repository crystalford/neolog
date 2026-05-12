/**
 * Graph — direct view of the substrate. Clusters as large nodes, threads as
 * small nodes, entities as tiny rose dots. Edges show membership and cross-
 * cluster connections (dashed = weaker).
 *
 * Faithful port from prototypes/graph.html. The actual node layout is
 * computed from D1 once enough data exists; until then we show the prototype's
 * mock graph as a visual placeholder.
 */
'use client'

import { useEffect, useState } from 'react'

type View = 'clusters' | 'entities' | 'threads' | 'projects'

interface GraphData {
  thread_count: number
  cluster_count: number
  entity_count: number
  has_data: boolean
}

export default function GraphPage() {
  const [view, setView] = useState<View>('clusters')
  const [data, setData] = useState<GraphData | null>(null)

  useEffect(() => {
    fetch('/api/v2/graph/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { thread_count: 0, cluster_count: 0, entity_count: 0, has_data: false })
      .then((d: any) => setData(d))
      .catch(() => setData({ thread_count: 0, cluster_count: 0, entity_count: 0, has_data: false }))
  }, [])

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="crumb reveal d2">The territory</div>
        <h1 className="reveal d3">Graph</h1>
        <p className="lead reveal d4">
          {data
            ? `${data.thread_count} threads, ${data.cluster_count} clusters, ${data.entity_count} entities. The shape of what you've been thinking.`
            : 'Loading…'}
        </p>
      </section>

      <div className="graph-stage reveal d4">
        <div className="graph-controls">
          {(['clusters', 'entities', 'threads', 'projects'] as View[]).map(v => (
            <button key={v} className={`ctrl ${view === v ? 'active' : ''}`} onClick={() => setView(v)}>
              {v}
            </button>
          ))}
        </div>

        <MockGraphSvg />

        <div className="graph-info">
          <div className="lbl"><span className="dot" style={{ background: '#d18847' }} />Drophead · Curbsider economics</div>
          <div className="name">How the curbsider survived</div>
          <div className="stats">
            <span><span className="n">4</span> threads</span>
            <span><span className="n">3</span> sessions</span>
            <span><span className="n">12</span> entity links</span>
            <span><span className="n">2</span> cross-cluster</span>
          </div>
        </div>
      </div>

      {data && !data.has_data && (
        <div className="empty-row reveal d5">
          <h3>Graph populates as you record</h3>
          <p>The mockup above is what the territory looks like with hundreds of threads and a handful of clusters. Drop in vlogs and your real graph will replace it.</p>
        </div>
      )}
    </main>
  )
}

function MockGraphSvg() {
  return (
    <svg className="graph-svg" viewBox="0 0 390 700" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
      <g stroke="#403729" strokeWidth="0.7" fill="none" opacity="0.5">
        <line x1="195" y1="180" x2="120" y2="240" />
        <line x1="195" y1="180" x2="280" y2="220" />
        <line x1="195" y1="180" x2="160" y2="320" />
        <line x1="195" y1="180" x2="240" y2="350" />
        <line x1="80" y1="120" x2="120" y2="240" />
        <line x1="80" y1="120" x2="50" y2="200" />
        <line x1="80" y1="120" x2="140" y2="80" />
        <line x1="290" y1="100" x2="280" y2="220" />
        <line x1="290" y1="100" x2="340" y2="60" />
        <line x1="290" y1="100" x2="240" y2="50" />
        <line x1="80" y1="450" x2="50" y2="510" />
        <line x1="80" y1="450" x2="140" y2="500" />
        <line x1="80" y1="450" x2="60" y2="380" />
        <line x1="240" y1="450" x2="280" y2="380" />
        <line x1="240" y1="450" x2="200" y2="540" />
        <line x1="240" y1="450" x2="320" y2="500" />
        <line x1="195" y1="180" x2="240" y2="450" strokeDasharray="2,3" opacity="0.4" />
        <line x1="80" y1="120" x2="290" y2="100" strokeDasharray="2,3" opacity="0.3" />
        <line x1="290" y1="100" x2="80" y2="450" strokeDasharray="2,3" opacity="0.3" />
        <line x1="195" y1="180" x2="290" y2="100" opacity="0.6" />
      </g>

      <g className="node">
        <circle cx="195" cy="180" r="22" fill="#d18847" opacity="0.15" />
        <circle cx="195" cy="180" r="14" fill="#d18847" />
        <circle cx="195" cy="180" r="14" fill="none" stroke="#ece4d2" strokeWidth="1.5" />
        <text x="195" y="155" textAnchor="middle" fontFamily="Geist" fontSize="10" fill="#ece4d2" fontWeight="500">Drophead</text>
      </g>
      <g className="node">
        <circle cx="80" cy="120" r="18" fill="#c66042" opacity="0.12" />
        <circle cx="80" cy="120" r="11" fill="#c66042" />
        <text x="80" y="100" textAnchor="middle" fontFamily="Geist" fontSize="9" fill="#c8bea9" fontWeight="500">Recommender</text>
      </g>
      <g className="node">
        <circle cx="290" cy="100" r="14" fill="#6e6cb8" opacity="0.12" />
        <circle cx="290" cy="100" r="9" fill="#6e6cb8" />
        <text x="290" y="80" textAnchor="middle" fontFamily="Geist" fontSize="9" fill="#c8bea9" fontWeight="500">Voice as input</text>
      </g>
      <g className="node">
        <circle cx="80" cy="450" r="16" fill="#8662a8" opacity="0.12" />
        <circle cx="80" cy="450" r="10" fill="#8662a8" />
        <text x="80" y="430" textAnchor="middle" fontFamily="Geist" fontSize="9" fill="#c8bea9" fontWeight="500">Pack Rats</text>
      </g>
      <g className="node">
        <circle cx="240" cy="450" r="13" fill="#7a9a6a" opacity="0.12" />
        <circle cx="240" cy="450" r="8" fill="#7a9a6a" />
        <text x="240" y="430" textAnchor="middle" fontFamily="Geist" fontSize="9" fill="#c8bea9" fontWeight="500">Gig economy</text>
      </g>

      <circle cx="120" cy="240" r="4" fill="#d18847" className="node node-floats" />
      <circle cx="280" cy="220" r="4" fill="#d18847" className="node node-floats" />
      <circle cx="160" cy="320" r="4" fill="#d18847" className="node node-floats" />
      <circle cx="240" cy="350" r="4" fill="#d18847" className="node node-floats" />
      <circle cx="50" cy="200" r="3.5" fill="#c66042" className="node node-floats" />
      <circle cx="140" cy="80" r="3.5" fill="#c66042" className="node node-floats" />
      <circle cx="340" cy="60" r="3" fill="#6e6cb8" className="node node-floats" />
      <circle cx="240" cy="50" r="3" fill="#6e6cb8" className="node node-floats" />
      <circle cx="50" cy="510" r="3.5" fill="#8662a8" className="node node-floats" />
      <circle cx="140" cy="500" r="3.5" fill="#8662a8" className="node node-floats" />
      <circle cx="60" cy="380" r="3.5" fill="#8662a8" className="node node-floats" />
      <circle cx="280" cy="380" r="3" fill="#7a9a6a" className="node node-floats" />
      <circle cx="200" cy="540" r="3" fill="#7a9a6a" className="node node-floats" />
      <circle cx="320" cy="500" r="3" fill="#7a9a6a" className="node node-floats" />
      <circle cx="180" cy="600" r="2.5" fill="#b56676" />
      <circle cx="220" cy="610" r="2.5" fill="#b56676" />
      <circle cx="160" cy="620" r="2.5" fill="#b56676" />
      <circle cx="200" cy="640" r="2.5" fill="#b56676" />

      <text x="20" y="675" fontFamily="JetBrains Mono" fontSize="8" fill="#54493a" letterSpacing="1.5">312 NODES · 814 EDGES</text>
      <text x="370" y="675" textAnchor="end" fontFamily="JetBrains Mono" fontSize="8" fill="#54493a" letterSpacing="1.5">10 TERRITORIES</text>
    </svg>
  )
}
