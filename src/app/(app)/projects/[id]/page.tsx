/**
 * Project detail — a single creative-work project. Characters, themes,
 * scene fragments. Long-form.
 */
'use client'

import { useEffect, useState } from 'react'

interface ProjectDetail {
  id: string
  name: string
  tagline: string | null
  blurb: string | null
  state: string
  themes: string[]
  characters: { id: string; name: string; role: string | null }[]
}

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const [p, setP] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/projects/${params.id}`, { credentials: 'include' })
      .then(async (r: any) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: any) => setP(d.project))
      .catch(e => setError(String(e.message || e)))
  }, [params.id])

  if (error) return <main><div className="error-row">Error: {error}</div></main>
  if (!p) return <main><div className="empty-row"><p style={{ color: 'var(--bone-3)' }}>Loading…</p></div></main>

  return (
    <main>
      <a href="/projects" className="detail-back">← Projects</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker" style={{ marginBottom: 12 }}>{p.name} · {p.state}</div>
          {p.tagline && <h1 style={{ fontWeight: 500, fontSize: 26, letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 12 }}>{p.tagline}</h1>}
          {p.blurb && <p style={{ fontSize: 15, color: 'var(--bone-2)', lineHeight: 1.55 }}>{p.blurb}</p>}
        </section>

        <div className="section">
          <div className="section-label">Characters ({p.characters.length})</div>
          {p.characters.length === 0 ? (
            <p style={{ color: 'var(--bone-3)', fontSize: 13 }}>No characters yet. Pulled from creative_elements once the extraction pipeline tags them.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {p.characters.map(c => (
                <div key={c.id} style={{ padding: '12px 16px', background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 12 }}>
                  <div style={{ fontWeight: 500, color: 'var(--bone)' }}>{c.name}</div>
                  {c.role && <div style={{ fontSize: 12, color: 'var(--bone-3)', marginTop: 2 }}>{c.role}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        {p.themes.length > 0 && (
          <div className="section">
            <div className="section-label">Themes</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {p.themes.map(t => (
                <span key={t} style={{ padding: '6px 12px', border: '1px solid var(--line-warm)', borderRadius: 100, fontSize: 12, color: 'var(--bone-2)' }}>{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
