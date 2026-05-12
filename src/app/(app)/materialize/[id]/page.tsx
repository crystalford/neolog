/**
 * Materialize — production setup. Pick form, outputs, voice profile, drop
 * strategy. Currently UI-only (the production engine Workflow ships later).
 */
'use client'

import { useEffect, useState } from 'react'

const FORMS = [
  { key: 'concept_essay', label: 'Concept essay' },
  { key: 'manifesto_rant', label: 'Manifesto / rant' },
  { key: 'reflection', label: 'Reflection' },
  { key: 'cultural_criticism', label: 'Cultural criticism' },
  { key: 'probe', label: 'Probe' },
  { key: 'aphoristic_probe', label: 'Aphoristic probe' },
]
const OUTPUTS = [
  { key: 'video_essay', label: 'Video essay' },
  { key: 'article', label: 'Article' },
  { key: 'x_thread', label: 'X thread' },
  { key: 'x_post', label: 'X post' },
  { key: 'clips', label: 'Clips' },
]

export default function MaterializePage({ params }: { params: { id: string } }) {
  const [cluster, setCluster] = useState<{ topic: string; take: string | null } | null>(null)
  const [form, setForm] = useState('concept_essay')
  const [outputs, setOutputs] = useState<Set<string>>(new Set(['video_essay', 'article']))
  const [voice, setVoice] = useState('Operator default')

  useEffect(() => {
    fetch(`/api/v2/clusters/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : { cluster: null })
      .then((d: any) => setCluster(d.cluster))
      .catch(() => {})
  }, [params.id])

  return (
    <main>
      <a href={`/cluster/${params.id}`} className="detail-back">← Cluster</a>
      <div className="detail-stage">
        <section style={{ paddingTop: 24 }}>
          <div className="kicker" style={{ marginBottom: 12 }}>Materialize</div>
          <h1 style={{ fontWeight: 400, fontSize: 32, letterSpacing: '-0.7px', lineHeight: 1.15, color: 'var(--bone)' }}>
            {cluster?.take || cluster?.topic || 'Loading…'}
          </h1>
          <p className="lead" style={{ marginTop: 12, maxWidth: 480 }}>
            One cluster → one coordinated drop. The production engine generates each output from the same source intelligence.
          </p>
        </section>

        <div className="section">
          <div className="section-label">Form</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {FORMS.map(f => (
              <button
                key={f.key}
                className={`fchip ${form === f.key ? 'active' : ''}`}
                onClick={() => setForm(f.key)}
              >{f.label}</button>
            ))}
          </div>
        </div>

        <div className="section">
          <div className="section-label">Outputs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {OUTPUTS.map(o => {
              const on = outputs.has(o.key)
              return (
                <button
                  key={o.key}
                  onClick={() => {
                    const next = new Set(outputs)
                    on ? next.delete(o.key) : next.add(o.key)
                    setOutputs(next)
                  }}
                  style={{
                    padding: '12px 16px',
                    border: `1px solid ${on ? 'var(--bone-3)' : 'var(--line-warm)'}`,
                    background: on ? 'rgba(236,228,210,0.04)' : 'transparent',
                    borderRadius: 12,
                    color: on ? 'var(--bone)' : 'var(--bone-2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 14,
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {o.label}
                  <span style={{ color: on ? 'var(--sig)' : 'var(--bone-4)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11 }}>
                    {on ? '✓' : '+'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="section">
          <div className="section-label">Voice</div>
          <div style={{ padding: '14px 16px', background: 'var(--ink-2)', border: '1px solid var(--line)', borderRadius: 12, fontSize: 13, color: 'var(--bone-1)' }}>
            {voice} <span style={{ color: 'var(--bone-3)', fontSize: 11, fontFamily: 'JetBrains Mono, monospace', letterSpacing: 1, marginLeft: 8 }}>· EDIT IN SETTINGS</span>
          </div>
        </div>

        <div className="section" style={{ paddingBottom: 32 }}>
          <button
            style={{
              padding: '14px 28px',
              borderRadius: 100,
              background: 'var(--bone)',
              color: 'var(--ink)',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              border: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
            onClick={() => alert('Production engine ships after the cluster/cultivate pipeline. UI is staged.')}
          >
            Start production →
          </button>
          <div style={{ marginTop: 16, fontSize: 12, color: 'var(--bone-3)', maxWidth: 480 }}>
            Production engine is staged — the cluster-cultivate pipeline ships first, then this button dispatches the script-generation Workflow.
          </div>
        </div>
      </div>
    </main>
  )
}
