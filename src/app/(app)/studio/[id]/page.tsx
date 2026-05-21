'use client'

/**
 * Studio detail — canon rebuild per
 * /tmp/neolognextlevel/design-reference/03-Cluster.html
 *
 * Was /cluster/[id]; moved to /studio/[id] in Phase 4 to match canon
 * naming. Old path /cluster/[id] redirects here.
 *
 * Sections:
 *   1. Crumbs           — Timeline / Studio / cluster topic
 *   2. Hero             — eyebrow + 64px h1 + take pull-quote in pills row
 *                         + actions column (Produce / Identify / Ask / Re-identify / Hold)
 *   3. Composite ripeness panel — RipeGauge + BreakdownBars + TrajectoryChart
 *   4. Riff progression — RiffTimeline (existing threadkit primitive)
 *   5. Bounce panel     — conversational refinement (toggleable)
 *   6. Body grid        — main: member threads + insights + gap question;
 *                         rail: production candidates + connected clusters
 *   7. Provenance       — 8-cell grid
 *   8. Footer           — colophon + j/k hints
 *
 * Data: /api/v2/clusters/[id]. Bounce: POST /api/v2/clusters/[id]/bounce.
 * Cultivate: POST /api/v2/admin/cultivate-clusters.
 */

export const runtime = 'edge'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import {
  RipeGauge, BreakdownBars, TrajectoryChart, RiffTimeline,
  truncate, formatDate, formatFullDate, renderInsightBody,
  type RiffTimelineNode, type RiffWindow as RW,
} from '@/components/threadkit'

interface Insight { kind: string; kind_label: string; title: string | null; body: string; bounce_run_id: string | null; created_at: string }
interface Thread { id: string; topic: string; take: string; strength: number | null; role: string; extracted_at: string; vlog_id: string }
interface ConnectedCluster { id: string; topic: string; abstracted_topic: string | null; ripeness_score: number | null; thread_count: number; shared: number }
interface ProductionCandidate { name: string; sub: string; cost: string; duration_label: string; fit: number; primary?: boolean }
interface Cluster {
  id: string; topic: string; abstracted_topic: string | null
  take: string | null; state: string; ripeness_score: number
  form: string | null; length_magnitude: string | null
  gap_question: string | null; topic_color: string | null
  created_at: string; updated_at: string
  threads: Thread[]; insights: Insight[]
}
interface Payload {
  cluster: Cluster
  composite: {
    thread_density: number; take_strength: number; voice_richness: number
    bounce_readiness: number; macro_eligibility: number
  }
  trajectory: { points: number[]; delta: string | null }
  riff_windows: RW[]
  production_candidates: ProductionCandidate[]
  connected_clusters: ConnectedCluster[]
  navigation: { prev_cluster_id: string | null; next_cluster_id: string | null }
}

export default function StudioDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cultivating, setCultivating] = useState<null | 'workers' | 'sonnet'>(null)
  const [cultivateNote, setCultivateNote] = useState<string | null>(null)
  const [bounceOpen, setBounceOpen] = useState(false)
  const [bounceTurns, setBounceTurns] = useState<{ q: string; a: string }[]>([])
  const [bounceQ, setBounceQ] = useState('')
  const [bounceSending, setBounceSending] = useState(false)
  const [bounceRunId, setBounceRunId] = useState<string | null>(null)
  const [bounceErr, setBounceErr] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/v2/clusters/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => setData(d as Payload))
      .catch(e => setError(String(e?.message || e)))
  }
  useEffect(() => { load() }, [params.id])

  useEffect(() => {
    if (!data) return
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'j' && data.navigation.next_cluster_id) router.push(`/studio/${data.navigation.next_cluster_id}`)
      else if (e.key === 'k' && data.navigation.prev_cluster_id) router.push(`/studio/${data.navigation.prev_cluster_id}`)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [data, router])

  const cultivate = async (which: 'workers' | 'sonnet') => {
    setCultivating(which)
    setCultivateNote(null)
    try {
      const r = await fetch('/api/v2/admin/cultivate-clusters', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster_id: params.id, model: which === 'sonnet' ? 'sonnet' : 'workers' }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setCultivateNote(`Identified ${d.insights_added ?? 0} insight${d.insights_added === 1 ? '' : 's'} via ${which === 'sonnet' ? 'Sonnet' : 'Llama 70B'}.`)
      load()
    } catch (e: any) {
      setCultivateNote(`Failed: ${e?.message || String(e)}`)
    } finally {
      setCultivating(null)
    }
  }

  const sendBounce = async (e: React.FormEvent) => {
    e.preventDefault()
    const q = bounceQ.trim()
    if (!q || bounceSending) return
    setBounceSending(true)
    setBounceErr(null)
    try {
      const r = await fetch(`/api/v2/clusters/${params.id}/bounce`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, bounce_run_id: bounceRunId ?? undefined }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setBounceTurns(prev => [...prev, { q, a: d.answer }])
      setBounceRunId(d.bounce_run_id)
      setBounceQ('')
    } catch (err: any) {
      setBounceErr(String(err?.message || err).slice(0, 240))
    } finally {
      setBounceSending(false)
    }
  }

  if (error) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Clusters', href: '/studio' }, 'Error']} />
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Clusters', href: '/studio' }, '…']} />
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { cluster, composite, trajectory, riff_windows, production_candidates, connected_clusters, navigation } = data
  const topicName = cluster.abstracted_topic ?? cluster.topic
  const color = topicColor(topicName)
  const ready = cluster.ripeness_score >= 70

  // Riff-timeline nodes from threads + week markers
  const weekTimes = cluster.threads.map(t => new Date(t.extracted_at).getTime()).sort((a, b) => a - b)
  const firstTs = weekTimes[0] ?? Date.now() - 7 * 86400000
  const lastTs = weekTimes[weekTimes.length - 1] ?? Date.now()
  const span = Math.max(1, lastTs - firstTs)
  const riffNodes: RiffTimelineNode[] = cluster.threads.map(t => ({
    id: t.id,
    position: (new Date(t.extracted_at).getTime() - firstTs) / span,
    strength: t.strength ?? 3,
    date: t.extracted_at,
  }))
  const weeks = buildWeekMarkers(firstTs, lastTs)

  return (
    <Shell>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>

        <CanonCrumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Clusters', href: '/studio' },
            { label: truncate(topicName, 40) },
          ]}
          prev={navigation.prev_cluster_id ? `/studio/${navigation.prev_cluster_id}` : null}
          next={navigation.next_cluster_id ? `/studio/${navigation.next_cluster_id}` : null}
          clusterId={cluster.id}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <span className="topic-pill" style={{ '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 12%, transparent)` } as any}>
                <span className="type">Cluster</span>
                {cluster.form && <><span className="sep">·</span>{cluster.form.replace(/_/g, ' ')}</>}
                {cluster.length_magnitude && <><span className="sep">·</span>{cluster.length_magnitude}</>}
              </span>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 11px',
                background: ready ? 'var(--sig-soft)' : 'var(--bg-2)',
                border: `1px solid ${ready ? 'color-mix(in srgb, var(--sig) 35%, transparent)' : 'var(--line-1)'}`,
                borderRadius: 100,
                fontFamily: 'var(--font-mono)',
                fontSize: 10, letterSpacing: 1.6,
                textTransform: 'uppercase', fontWeight: 500,
                color: ready ? 'var(--sig)' : 'var(--fg-2)',
              }}>
                {ready && <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>}
                {cluster.state} · {Math.round(cluster.ripeness_score)} ripe
              </span>
            </div>
            <h1>{topicName}</h1>
            {cluster.take && (
              <div style={{
                fontSize: 17, color: 'var(--fg-2)',
                lineHeight: 1.6, fontStyle: 'italic',
                paddingLeft: 14, borderLeft: `2px solid ${color}`,
                maxWidth: 760, marginTop: 18,
              }}>
                {cluster.take}
              </div>
            )}
          </div>
          <div className="actions">
            <button className="action primary" onClick={() => alert('Production engine — coming in a later deploy.')}>
              Produce a draft
            </button>
            <button className="action" onClick={() => cultivate('workers')} disabled={cultivating !== null}>
              {cultivating === 'workers' ? 'Identifying…' : 'Identify pattern'}
              <span style={{ color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', fontSize: 10 }}>C</span>
            </button>
            <button className="action" onClick={() => setBounceOpen(o => !o)}>
              Ask the model
            </button>
            <button className="action" onClick={() => cultivate('sonnet')} disabled={cultivating !== null}>
              {cultivating === 'sonnet' ? 'Identifying (Sonnet)…' : 'Re-identify (Sonnet)'}
            </button>
            <button className="action" onClick={() => alert('Hold flow — coming later.')}>
              Hold for more
            </button>
          </div>
        </section>

        {cultivateNote && (
          <div style={{
            margin: '0 0 24px', padding: '12px 16px',
            background: 'var(--bg-2)', border: '1px solid var(--line-1)',
            borderRadius: 8, fontSize: 13, color: 'var(--fg-2)',
          }}>{cultivateNote}</div>
        )}

        {/* Bounce panel */}
        {bounceOpen && (
          <div style={{
            margin: '0 0 32px',
            background: 'var(--bg-1)', border: '1px solid var(--line-1)',
            borderLeft: `3px solid ${color}`, borderRadius: 10,
            padding: 22,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
              <div>
                <div style={{
                  fontSize: 10, color, letterSpacing: 1.5, textTransform: 'uppercase',
                  fontFamily: 'var(--font-mono)', fontWeight: 600, marginBottom: 6,
                }}>
                  Bounce · {bounceTurns.length} turn{bounceTurns.length === 1 ? '' : 's'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                  Ask the model anything about this cluster. Threads + prior insights are in context.
                </div>
              </div>
              <button onClick={() => setBounceOpen(false)} style={{
                padding: '5px 12px', fontSize: 11,
                background: 'transparent', color: 'var(--fg-3)',
                border: '1px solid var(--line-1)', borderRadius: 6, cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}>Close</button>
            </div>
            {bounceTurns.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 16, maxHeight: 400, overflowY: 'auto' }}>
                {bounceTurns.map((turn, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{
                      alignSelf: 'flex-end', maxWidth: '85%',
                      padding: '10px 14px',
                      background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                      borderRadius: 8,
                      fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.5,
                    }}>{turn.q}</div>
                    <div style={{
                      padding: '10px 14px',
                      borderLeft: `2px solid ${color}`,
                      fontSize: 13.5, color: 'var(--fg-1)', lineHeight: 1.6,
                    }}>{turn.a}</div>
                  </div>
                ))}
              </div>
            )}
            {bounceErr && <div style={{ fontSize: 11, color: 'var(--t-terra)', marginBottom: 10 }}>{bounceErr}</div>}
            <form onSubmit={sendBounce} style={{ display: 'flex', gap: 8 }}>
              <input
                value={bounceQ}
                onChange={e => setBounceQ(e.target.value)}
                placeholder="Ask a follow-up about this cluster…"
                disabled={bounceSending}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                  borderRadius: 8, fontSize: 13.5, color: 'var(--fg-1)',
                  fontFamily: 'var(--font-body)',
                }}
              />
              <button type="submit" disabled={bounceSending || !bounceQ.trim()} style={{
                padding: '10px 18px', fontSize: 12,
                background: color, color: 'var(--bg)',
                border: 'none', borderRadius: 8, cursor: bounceSending ? 'wait' : 'pointer',
                opacity: bounceSending || !bounceQ.trim() ? 0.5 : 1,
                fontWeight: 500, letterSpacing: '-0.1px',
                fontFamily: 'var(--font-body)',
              }}>{bounceSending ? '…' : 'Send'}</button>
            </form>
          </div>
        )}

        {/* Composite ripeness panel */}
        <section className="canon-ripe-panel canon-reveal d3" style={{ marginBottom: 32 }}>
          <div className="ripe-gauge-col">
            <RipeGauge score={cluster.ripeness_score} color={color}/>
          </div>
          <div className="ripe-breakdown-col">
            <BreakdownBars
              title="Composite"
              color={color}
              items={[
                { name: 'Thread density',    value: composite.thread_density,    hot: composite.thread_density >= 80 },
                { name: 'Take strength',     value: composite.take_strength,     hot: composite.take_strength >= 80 },
                { name: 'Voice richness',    value: composite.voice_richness,    hot: composite.voice_richness >= 80 },
                { name: 'Bounce readiness',  value: composite.bounce_readiness,  hot: composite.bounce_readiness >= 80 },
                { name: 'Macro-eligibility', value: composite.macro_eligibility, hot: composite.macro_eligibility >= 80 },
              ]}
            />
          </div>
          <div className="ripe-traj-col">
            <TrajectoryChart points={trajectory.points} color={color} threshold={70} delta={trajectory.delta}/>
          </div>
        </section>

        {/* Riff progression */}
        <section className="canon-section canon-reveal d4" style={{ marginBottom: 32 }}>
          <div className="canon-section-head">
            <h2>Riff progression <span className="meta">· {cluster.threads.length} thread{cluster.threads.length === 1 ? '' : 's'} · {weeks.length - 1} weeks</span></h2>
            <div className="meta">how this cluster ripened</div>
          </div>
          <RiffTimeline nodes={riffNodes} windows={riff_windows} color={color} weeks={weeks}/>
        </section>

        {/* Body grid */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">

            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Member threads <span className="meta">· {cluster.threads.length}</span></h2>
                <div className="meta">{ready ? 'cluster ready' : cluster.state}</div>
              </div>
              {cluster.threads.length === 0 ? (
                <div className="canon-empty-hint">No threads yet. Add via extraction.</div>
              ) : (
                <div className="canon-siblings">
                  {cluster.threads.map(t => (
                    <Link key={t.id} href={`/thread/${t.id}`} className="canon-sibling" style={{ '--c': color } as any}>
                      <span className="dot"/>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 9.5,
                        color: t.role === 'core' ? color : 'var(--fg-4)',
                        letterSpacing: 1.4, textTransform: 'uppercase',
                        fontWeight: t.role === 'core' ? 600 : 500,
                        flexShrink: 0,
                      }}>{t.role}</span>
                      <span className="name">“{truncate(t.take, 90)}”</span>
                      <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{formatDate(t.extracted_at)}</span>
                      <span className="strength">
                        {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (t.strength ?? 0) ? 'on' : ''}`}/>)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Surfaced insights <span className="meta">· {cluster.insights.length}</span></h2>
                <div className="meta">{cluster.insights.length === 0 ? 'no runs yet' : 'cultivate output'}</div>
              </div>
              {cluster.insights.length === 0 ? (
                <div className="canon-empty-hint">
                  Click <strong>Identify pattern</strong> — the model will name the concept this cluster matches and surface adjacent thinkers.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cluster.insights.map((ins, i) => (
                    <div key={i} style={{
                      padding: '14px 18px',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--line-1)',
                      borderLeft: '2px solid var(--sig)',
                      borderRadius: '0 10px 10px 0',
                    }}>
                      <div style={{
                        fontSize: 9.5, color: 'var(--sig)', letterSpacing: 1.6,
                        textTransform: 'uppercase',
                        fontFamily: 'var(--font-mono)', fontWeight: 500, marginBottom: 8,
                      }}>{ins.kind_label}</div>
                      <div style={{ fontSize: 14, color: 'var(--fg-1)', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: renderInsightBody(ins.body) }}/>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {cluster.gap_question && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Gap question</h2>
                  <div className="meta">what's next</div>
                </div>
                <div style={{
                  padding: 20,
                  background: 'var(--bg-1)',
                  border: '1px dashed color-mix(in srgb, var(--sig) 40%, transparent)',
                  borderRadius: 10,
                  fontSize: 15.5, color: 'var(--fg)',
                  fontStyle: 'italic', lineHeight: 1.6,
                  position: 'relative',
                  paddingLeft: 48,
                }}>
                  <span style={{
                    position: 'absolute', left: 18, top: 22,
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'var(--sig-soft)',
                    border: '1px solid color-mix(in srgb, var(--sig) 40%, transparent)',
                    color: 'var(--sig)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                  }}>?</span>
                  {cluster.gap_question}
                </div>
              </section>
            )}
          </div>

          {/* Rail */}
          <aside className="canon-detail-rail">
            <div className="rail-card">
              <div className="rc-head">
                <h3>Production candidates</h3>
                <span className="more">{production_candidates.filter(p => p.fit >= 60).length} ready</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {production_candidates.map((p, i) => (
                  <div key={i} style={{
                    padding: '12px 14px',
                    background: 'var(--bg-2)',
                    border: p.primary ? `1px solid ${color}` : '1px solid var(--line-1)',
                    borderRadius: 9,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13.5, color: 'var(--fg)', fontWeight: 500 }}>{p.name}</span>
                      {p.primary && <span style={{
                        fontSize: 8.5, color: 'var(--sig)',
                        background: 'var(--sig-soft)',
                        padding: '2px 7px', borderRadius: 100,
                        fontFamily: 'var(--font-mono)', letterSpacing: 1.2, textTransform: 'uppercase',
                      }}>best fit</span>}
                    </div>
                    <div style={{
                      fontSize: 10, color: 'var(--fg-3)',
                      fontFamily: 'var(--font-mono)', letterSpacing: 0.4,
                      marginBottom: 8,
                    }}>{p.sub}</div>
                    <div style={{ height: 3, background: 'var(--line-1)', borderRadius: 2, position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: 3,
                        width: `${p.fit}%`,
                        background: p.primary ? color : 'var(--fg-3)',
                        borderRadius: 2,
                        boxShadow: p.primary ? `0 0 6px ${color}80` : 'none',
                      }}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-2)', fontFamily: 'var(--font-mono)' }}>
                        {p.cost} · {p.duration_label}
                      </span>
                      <button onClick={() => alert(`Build ${p.name} — production engine coming next.`)} style={{
                        padding: '4px 10px', fontSize: 10.5,
                        background: 'transparent', color: 'var(--fg-1)',
                        border: '1px solid var(--line-2)', borderRadius: 5, cursor: 'pointer',
                        fontFamily: 'var(--font-body)', fontWeight: 500,
                      }}>Build</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rail-card">
              <div className="rc-head">
                <h3>Connected clusters</h3>
                {connected_clusters.length > 0 && <span className="more">{connected_clusters.length}</span>}
              </div>
              {connected_clusters.length === 0 ? (
                <div className="canon-empty-hint" style={{ padding: 14, fontSize: 12 }}>
                  No related clusters yet. Cousins surface as more vlogs land.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connected_clusters.map(cc => {
                    const ccColor = topicColor(cc.abstracted_topic ?? cc.topic)
                    return (
                      <Link key={cc.id} href={`/studio/${cc.id}`} className="canon-sibling" style={{ '--c': ccColor } as any}>
                        <span className="dot"/>
                        <span className="name">{truncate(cc.abstracted_topic ?? cc.topic, 32)}</span>
                        <span style={{ fontSize: 9.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          {cc.shared > 0 ? `${cc.shared} shared` : 'topic'} · {Math.round(cc.ripeness_score ?? 0)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid" style={{ marginTop: 32 }}>
          <ProvCell label="Created" value={formatFullDate(cluster.created_at)}/>
          <ProvCell label="Updated" value={formatFullDate(cluster.updated_at)}/>
          <ProvCell label="State" value={cluster.state}/>
          <ProvCell label="Form" value={cluster.form ?? '—'}/>
          <ProvCell label="Threads" value={`${cluster.threads.length}`}/>
          <ProvCell label="Insights" value={`${cluster.insights.length}`}/>
          <ProvCell label="Cluster id" value={truncate(cluster.id, 22)} mono/>
          <ProvCell label="Connections" value={`${connected_clusters.length}`}/>
        </section>

        {/* Footer */}
        <footer className="canon-detail-footer">
          <span>neolog · cluster {truncate(cluster.id, 22)}</span>
          <span className="kbd-row">
            <span className="kbd">J</span> next
            <span className="kbd">K</span> prev
          </span>
        </footer>

      </div>
    </Shell>
  )
}

// ─── Subcomponents (duplicated from thread for now — can extract later) ──

type CrumbItem = { label: string; href?: string } | string

function CanonCrumbs({ trail, prev, next, clusterId }: {
  trail: CrumbItem[]
  prev?: string | null
  next?: string | null
  clusterId?: string
}) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'here' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
      {(prev || next || clusterId) && (
        <div className="navbtns">
          <Link href={prev ?? '#'} className="navbtn" aria-disabled={!prev}>
            ◂ Prev <span className="kbd">K</span>
          </Link>
          <Link href={next ?? '#'} className="navbtn" aria-disabled={!next}>
            Next ▸ <span className="kbd">J</span>
          </Link>
          {clusterId && (
            <button className="navbtn" onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/studio/${clusterId}`).catch(() => {})
            }} title="Copy link">⎘</button>
          )}
        </div>
      )}
    </div>
  )
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function buildWeekMarkers(first: number, last: number): { position: number; label: string }[] {
  const span = Math.max(1, last - first)
  const weekMs = 7 * 24 * 60 * 60 * 1000
  const totalWeeks = Math.max(1, Math.ceil(span / weekMs))
  const N = Math.min(7, totalWeeks + 1)
  const out: { position: number; label: string }[] = []
  for (let i = 0; i < N; i++) {
    const ratio = i / Math.max(1, N - 1)
    const ts = first + ratio * span
    out.push({
      position: ratio,
      label: i === 0 ? formatDate(new Date(ts).toISOString()) + ' · wk 1'
            : i === N - 1 ? formatDate(new Date(ts).toISOString()) + ' · now'
            : `wk ${i + 1}`,
    })
  }
  return out
}
