/**
 * Cluster detail — the deliberate-work view. All threads inside, ripeness,
 * adjacent insights, gap question, production candidates, Materialize button.
 */
'use client'

import { useEffect, useState } from 'react'

interface ThreadInCluster { id: string; topic: string; take: string; strength: number | null }
interface ClusterDetail {
  id: string
  topic: string
  abstracted_topic: string | null
  take: string | null
  state: string
  ripeness_score: number
  form: string | null
  gap_question: string | null
  topic_color: string | null
  threads: ThreadInCluster[]
  insights: { kind: string; body: string }[]
}

export default function ClusterDetailPage({ params }: { params: { id: string } }) {
  const [c, setC] = useState<ClusterDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/v2/clusters/${params.id}`, { credentials: 'include' })
      .then(async (r: any) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d: any) => setC(d.cluster))
      .catch(e => setError(String(e.message || e)))
  }, [params.id])

  if (error) return <main><div className="error-row">Error: {error}</div></main>
  if (!c) return <main><div className="empty-row"><p style={{ color: 'var(--bone-3)' }}>Loading…</p></div></main>

  const topic = c.topic_color || 'brass'
  const topicVar = topic.startsWith('#') ? topic : `var(--t-${topic})`
  const ready = c.state === 'ready'

  return (
    <main>
      <a href="/studio" className="detail-back">← Studio</a>
      <div className="detail-stage">
        <article className={`ccard ${ready ? 'ready' : 'ripening'}`} style={{ ['--topic' as any]: topicVar, marginTop: 16 }}>
          <div className="cluster-band">
            <div className="cluster-head">
              <span className="dot" />
              <span className="name">{c.abstracted_topic || c.topic}</span>
              <span className="state">{ready ? 'Ready' : c.state}</span>
            </div>
            <h2>{c.take || c.topic}</h2>
            <div className="ripe-row">
              <div className="ripe-track"><div className="ripe-fill" style={{ width: `${c.ripeness_score}%` }} /></div>
              <span className="ripe-num">{c.ripeness_score}/100</span>
            </div>
          </div>

          {c.insights.length > 0 && (
            <div className="insight-feed">
              <div className="insight-label"><span className="pulse" />Adjacent insights · {c.insights.length}</div>
              {c.insights.map((ins, i) => (
                <div key={i} className="insight-item">
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

          <div className="cluster-foot">
            <div className="cluster-stats">
              <span><span className="n">{c.threads.length}</span> threads</span>
            </div>
            <div className="cluster-acts">
              <a href={`/materialize/${c.id}`} className="act go" style={{ textDecoration: 'none' }}>Materialize</a>
            </div>
          </div>
        </article>

        <div className="section">
          <div className="section-label">Threads in this cluster ({c.threads.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {c.threads.map(t => (
              <a key={t.id} href={`/thread/${t.id}`} className="tcard thread has-topic" style={{ ['--topic' as any]: topicVar }}>
                <div className="t-meta">
                  <span className="type-tag">Thread</span>
                  <span className="sep">·</span>
                  <span className="status">{t.topic}</span>
                </div>
                <div className="t-headline">{t.take}</div>
              </a>
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
