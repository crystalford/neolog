/**
 * Projects — long-form creative containers. Pack Rats, Mechanical Bride,
 * characters in development. Slower rhythm than Studio. Faithful port from
 * prototypes/projects.html with stats sub-cards per project.
 */
'use client'

import { useEffect, useState } from 'react'

interface ProjectCard {
  id: string
  name: string
  state: 'developing' | 'materializing' | 'dormant' | 'produced'
  headline: string
  blurb: string
  topic: string
  stats: { label: string; value: string }[]
  last_touched: string
}

type Filter = 'active' | 'materializing' | 'dormant' | 'produced'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<ProjectCard[]>([])
  const [filter, setFilter] = useState<Filter>('active')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v2/projects', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { projects: [] })
      .then(d => { setProjects(d.projects || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const filtered = projects.filter(p => {
    if (filter === 'active') return p.state === 'developing'
    return p.state === filter
  })
  const counts = {
    active: projects.filter(p => p.state === 'developing').length,
    materializing: projects.filter(p => p.state === 'materializing').length,
    dormant: projects.filter(p => p.state === 'dormant').length,
    produced: projects.filter(p => p.state === 'produced').length,
  }

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Creative work</div>
        <h1 className="reveal d3">Projects</h1>
        <p className="lead reveal d4">Long-form fiction and creative output. Slower rhythm than the studio.</p>
      </section>

      {projects.length > 0 && (
        <div className="filter-bar reveal d4" style={{ padding: '8px 24px 0' }}>
          {([
            ['active', 'Active'],
            ['materializing', 'Materializing'],
            ['dormant', 'Dormant'],
            ['produced', 'Produced'],
          ] as [Filter, string][]).map(([k, label]) => (
            <button key={k} className={`fchip ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>
              {label} <span className="num">{counts[k]}</span>
            </button>
          ))}
        </div>
      )}

      {loading && <div className="empty-row"><p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p></div>}

      {!loading && projects.length === 0 && (
        <div className="empty-row reveal d5">
          <h3>No projects yet</h3>
          <p>Projects are long-form creative containers — screenplays, fiction, character studies. Different rhythm from the daily feed. Hit + below to start one.</p>
        </div>
      )}

      <div className="proj-list reveal d4" style={{ marginTop: 16 }}>
        {filtered.map(p => (
          <a key={p.id} href={`/projects/${p.id}`} className="proj-card" style={{ ['--topic' as any]: `var(--t-${p.topic})` }}>
            <div className="kicker">
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: `var(--t-${p.topic})`, marginRight: 8 }} />
              {p.name}
              <span style={{ marginLeft: 'auto', color: stateColor(p.state) }}>· {stateLabel(p.state)}</span>
            </div>
            <h3>{p.headline}</h3>
            <p className="blurb">{p.blurb}</p>
            <div className="stats">
              {p.stats.map(s => (
                <div key={s.label}>
                  <span className="n">{s.value}</span> {s.label}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1, color: 'var(--bone-3)' }}>
              {p.last_touched}
            </div>
          </a>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
        <button style={{
          padding: '12px 24px',
          borderRadius: 100,
          border: '1px solid var(--line-bright)',
          color: 'var(--bone)',
          background: 'rgba(236,228,210,0.04)',
          fontSize: 13,
          fontWeight: 500,
        }}>+ New project</button>
      </div>
    </main>
  )
}

function stateLabel(s: ProjectCard['state']): string {
  return { developing: 'Developing', materializing: 'Materializing', dormant: 'Dormant', produced: 'Produced' }[s]
}
function stateColor(s: ProjectCard['state']): string {
  return s === 'materializing' ? 'var(--sig)' : 'var(--bone-2)'
}
