/**
 * Cluster detail — comprehensive rebuild matching the Cluster.html
 * prototype. Sections:
 *
 *   1. Crumbs row    — breadcrumb + Prev/Next cluster + copy-link
 *   2. Hero          — topic dot + "Cluster · <form> · <length>" eyebrow +
 *                      state pill + 38px h1 + take pull-quote +
 *                      Hold / Bounce / Materialize buttons
 *   3. Ripe panel    — composite gauge (circular SVG, 0-100) +
 *                      breakdown bars (5 components) + trajectory chart
 *   4. Riff timeline — horizontal axis with thread nodes sized by
 *                      strength, week markers, riff windows
 *   5. Body grid     — Left: member threads + surfaced insights;
 *                      Right: production candidates + connected clusters
 *   6. Provenance    — provenance grid (4-cell)
 *   7. Footer        — colophon + keyboard hints
 *
 * Cultivate buttons (default Llama, Sonnet escalation) preserved at
 * top of right column. Materialize / Hold buttons placeholder for now —
 * real production engine ships in Deploy 6+.
 */
'use client'

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import {
  Sep, NavBtn, IconBtn, pillTopic, editorialLabel, Strength,
  SectionBlock, RailCard, EmptyHint, Prov, Action,
  RipeGauge, BreakdownBars, TrajectoryChart, RiffTimeline,
  truncate, formatDate, formatFullDate, insightKindLabel, renderInsightBody,
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

export default function ClusterDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cultivating, setCultivating] = useState<null | 'workers' | 'sonnet'>(null)
  const [cultivateNote, setCultivateNote] = useState<string | null>(null)

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
      if (e.key === 'j' && data.navigation.next_cluster_id) router.push(`/cluster/${data.navigation.next_cluster_id}`)
      else if (e.key === 'k' && data.navigation.prev_cluster_id) router.push(`/cluster/${data.navigation.prev_cluster_id}`)
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
        body: JSON.stringify({
          cluster_id: params.id,
          ...(which === 'sonnet' ? { model: 'sonnet' } : {}),
        }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const cult = d.cultivated?.[0]
      if (d.errors?.[0]?.message) setCultivateNote(`Failed: ${d.errors[0].message}`)
      else if (cult) setCultivateNote(
        `${cult.model} produced ${cult.insights_created} insight${cult.insights_created === 1 ? '' : 's'}` +
        (cult.concept_name ? ` · named: "${cult.concept_name}"` : ' · no named concept matched')
      )
      load()
    } catch (e: any) {
      setCultivateNote(`Failed: ${String(e?.message || e).slice(0, 240)}`)
    } finally { setCultivating(null) }
  }

  if (error) return (
    <Shell active="clusters" breadcrumb={['Clusters', 'Error']}>
      <div className="pad-tight" style={{ color: 'var(--err)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell active="clusters" breadcrumb={['Clusters', '…']}>
      <div className="pad-tight" style={{ color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { cluster, composite, trajectory, riff_windows, production_candidates, connected_clusters, navigation } = data
  const topic = cluster.abstracted_topic ?? cluster.topic_color ?? cluster.topic ?? 'misc'
  const color = topicColor(topic)
  const ready = cluster.state === 'ready' || cluster.ripeness_score >= 70

  // Compute riff timeline data
  const threadDates = cluster.threads.map(t => new Date(t.extracted_at).getTime())
  const firstTs = Math.min(...threadDates)
  const lastTs = Math.max(...threadDates, firstTs + 1)
  const span = Math.max(1, lastTs - firstTs)
  const riffNodes: RiffTimelineNode[] = cluster.threads.map(t => ({
    id: t.id,
    position: (new Date(t.extracted_at).getTime() - firstTs) / span,
    strength: t.strength ?? 3,
    date: t.extracted_at,
    dim: (t.strength ?? 3) <= 2,
  }))
  if (riffNodes.length > 0) riffNodes[riffNodes.length - 1].current = true
  const weeks = buildWeekMarkers(firstTs, lastTs)

  return (
    <Shell active="clusters" breadcrumb={['Clusters', truncate(cluster.abstracted_topic ?? cluster.topic, 40)]}>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>

        {/* Crumbs + nav */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: '14px 36px', borderBottom: '1px solid var(--line)',
        }}>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, flex: 1, minWidth: 0 }}>
            <Link href="/" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>Timeline</Link>
            <Sep/>
            <Link href="/clusters" style={{ color: 'var(--fg-3)', textDecoration: 'none' }}>Clusters</Link>
            <Sep/>
            <span style={{ color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {truncate(cluster.abstracted_topic ?? cluster.topic, 40)}
            </span>
          </nav>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <NavBtn disabled={!navigation.prev_cluster_id}
              onClick={() => navigation.prev_cluster_id && router.push(`/cluster/${navigation.prev_cluster_id}`)}
              label="◂ Prev" hint="K"/>
            <NavBtn disabled={!navigation.next_cluster_id}
              onClick={() => navigation.next_cluster_id && router.push(`/cluster/${navigation.next_cluster_id}`)}
              label="Next ▸" hint="J"/>
            <IconBtn title="Copy link" onClick={() => navigator.clipboard?.writeText(`${location.origin}/cluster/${cluster.id}`).catch(() => {})}>
              <svg viewBox="0 0 14 14" width="13" height="13"><path d="M6 4 L10 4 A2 2 0 0 1 12 6 L12 10" fill="none" stroke="currentColor" strokeWidth="1.4"/><path d="M8 10 L4 10 A2 2 0 0 1 2 8 L2 4 A2 2 0 0 1 4 2 L8 2" fill="none" stroke="currentColor" strokeWidth="1.4"/></svg>
            </IconBtn>
          </div>
        </div>

        {/* Hero */}
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 260px', gap: 32, padding: '32px 36px 28px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: color }}/>
              <span style={pillTopic()}>
                Cluster
                {cluster.form && <><span style={{ color: 'var(--fg-5)', margin: '0 5px' }}>·</span>{cluster.form.replace(/_/g, ' ')}</>}
                {cluster.length_magnitude && <><span style={{ color: 'var(--fg-5)', margin: '0 5px' }}>·</span>{cluster.length_magnitude}</>}
              </span>
              {ready
                ? <span className="pill accent">◆ ready to materialize</span>
                : <span className="pill mute">{cluster.state}</span>}
            </div>
            <h1 style={{
              fontSize: 38, fontWeight: 500, letterSpacing: '-1px', lineHeight: 1.15,
              margin: 0, color: 'var(--fg)',
            }}>
              {cluster.abstracted_topic ?? cluster.topic}
            </h1>
            {cluster.take && (
              <p style={{
                marginTop: 18, marginBottom: 0,
                fontSize: 16, color: 'var(--fg-2)',
                fontStyle: 'italic', lineHeight: 1.6,
                paddingLeft: 14, borderLeft: `2px solid ${color}`,
                maxWidth: 760,
              }}>
                {cluster.take}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Action primary label="Materialize" onClick={() => alert('Production engine — coming in a later deploy.')}/>
            <Action label="Cultivate" hint="C" onClick={() => cultivate('workers')} disabled={cultivating !== null}/>
            <Action label="Bounce ideas" onClick={() => alert('Bounce workflow — Deploy 4.')}/>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '6px 0' }}/>
            <Action label="Re-cultivate (Sonnet)" onClick={() => cultivate('sonnet')} disabled={cultivating !== null}/>
            <Action label="Hold for more" onClick={() => alert('Hold flow — coming later.')}/>
          </div>
        </section>

        {cultivateNote && (
          <div style={{
            margin: '0 36px 24px', padding: '10px 14px',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: 6, fontSize: 12, color: 'var(--fg-2)',
          }}>{cultivateNote}</div>
        )}

        {/* Composite ripeness panel */}
        <section style={{ padding: '0 36px 32px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '220px 1fr 1fr', gap: 32,
            padding: 24,
            background: 'var(--bg-1)', border: '1px solid var(--line)',
            borderLeft: `3px solid ${color}`, borderRadius: 10,
            alignItems: 'center',
          }}>
            <RipeGauge score={cluster.ripeness_score} color={color}/>
            <BreakdownBars
              title="Composite"
              color={color}
              items={[
                { name: 'Thread density',   value: composite.thread_density,   hot: composite.thread_density >= 80 },
                { name: 'Take strength',    value: composite.take_strength,    hot: composite.take_strength >= 80 },
                { name: 'Voice richness',   value: composite.voice_richness,   hot: composite.voice_richness >= 80 },
                { name: 'Bounce readiness', value: composite.bounce_readiness, hot: composite.bounce_readiness >= 80 },
                { name: 'Macro-eligibility',value: composite.macro_eligibility,hot: composite.macro_eligibility >= 80 },
              ]}
            />
            <TrajectoryChart points={trajectory.points} color={color} threshold={70} delta={trajectory.delta}/>
          </div>
        </section>

        {/* Riff progression */}
        <section style={{ padding: '0 36px 32px' }}>
          <SectionBlock label="Riff progression" count={`${cluster.threads.length} thread${cluster.threads.length === 1 ? '' : 's'} · ${weeks.length - 1} weeks`} meta="how this cluster ripened">
            <RiffTimeline nodes={riffNodes} windows={riff_windows} color={color} weeks={weeks}/>
          </SectionBlock>
        </section>

        {/* Body grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 36, padding: '0 36px 40px' }}>

          {/* Main */}
          <div style={{ minWidth: 0 }}>

            <SectionBlock label="Member threads" count={`${cluster.threads.length}`} meta={ready ? 'cluster ready' : cluster.state}>
              {cluster.threads.length === 0 ? (
                <EmptyHint>This cluster has no threads yet. Add threads via extraction.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {cluster.threads.map(t => (
                    <Link key={t.id} href={`/thread/${t.id}`} style={{
                      display: 'grid', gridTemplateColumns: '12px 64px 1fr 80px 64px',
                      gap: 12, alignItems: 'center',
                      padding: '10px 12px',
                      background: 'var(--bg-1)', border: '1px solid var(--line)',
                      borderLeft: `2px solid ${color}`,
                      borderRadius: 6, textDecoration: 'none',
                    }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: t.role === 'core' ? `0 0 6px ${color}` : 'none' }}/>
                      <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>{formatDate(t.extracted_at)}</span>
                      <span style={{ fontSize: 13, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        “{truncate(t.take, 90)}”
                      </span>
                      <span style={{
                        fontSize: 9, color: t.role === 'core' ? color : 'var(--fg-4)',
                        textTransform: 'uppercase', letterSpacing: 0.6,
                        fontFamily: 'Geist Mono, ui-monospace, monospace',
                        fontWeight: t.role === 'core' ? 600 : 400,
                      }}>{t.role}</span>
                      <Strength n={t.strength ?? 3} color={color} compact/>
                    </Link>
                  ))}
                </div>
              )}
            </SectionBlock>

            <SectionBlock label="Surfaced insights" count={`${cluster.insights.length} · what the system noticed`} meta={cluster.insights.length === 0 ? 'no runs yet' : 'cultivate output'}>
              {cluster.insights.length === 0 ? (
                <EmptyHint>Click <strong>Cultivate</strong> in the action panel to surface named concepts, adjacent thinkers, and cross-references.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {cluster.insights.map((ins, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '110px 1fr',
                      gap: 12, padding: '12px 14px',
                      background: 'var(--bg-1)', border: '1px solid var(--line)',
                      borderLeft: `2px solid var(--accent)`,
                      borderRadius: 6,
                    }}>
                      <span style={editorialLabel('var(--accent)', 0)}>{ins.kind_label}</span>
                      <span style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: renderInsightBody(ins.body) }}/>
                    </div>
                  ))}
                </div>
              )}
            </SectionBlock>

            {cluster.gap_question && (
              <SectionBlock label="Gap question" meta="what's next">
                <div style={{
                  padding: 16, background: 'var(--bg-2)', border: '1px dashed var(--line-1)',
                  borderRadius: 6, fontSize: 14, color: 'var(--fg-1)',
                  fontStyle: 'italic', lineHeight: 1.6,
                }}>{cluster.gap_question}</div>
              </SectionBlock>
            )}
          </div>

          {/* Rail */}
          <aside style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>

            <RailCard label="Production candidates" more={production_candidates.length > 0 ? `${production_candidates.filter(p => p.fit >= 60).length} ready` : null}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {production_candidates.map((p, i) => (
                  <div key={i} style={{
                    padding: '12px 14px',
                    background: 'var(--bg-1)',
                    border: p.primary ? `1px solid ${color}` : '1px solid var(--line)',
                    borderRadius: 6,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500 }}>{p.name}</span>
                      {p.primary && <span className="pill accent" style={{ fontSize: 9 }}>best fit</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace', marginBottom: 8 }}>{p.sub}</div>
                    <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 1, position: 'relative', overflow: 'hidden', marginBottom: 8 }}>
                      <div style={{
                        position: 'absolute', left: 0, top: 0, height: 3,
                        width: `${p.fit}%`,
                        background: p.primary ? color : 'var(--fg-3)',
                        borderRadius: 1,
                      }}/>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontSize: 10, color: 'var(--fg-2)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>{p.cost} · {p.duration_label}</span>
                      <button onClick={() => alert(`Build ${p.name} — production engine coming next.`)} style={{
                        padding: '3px 9px', fontSize: 10,
                        background: 'transparent', color: 'var(--fg-1)',
                        border: '1px solid var(--line)', borderRadius: 4, cursor: 'pointer',
                      }}>Build</button>
                    </div>
                  </div>
                ))}
              </div>
            </RailCard>

            <RailCard label="Connected clusters" more={connected_clusters.length > 0 ? `${connected_clusters.length}` : null}>
              {connected_clusters.length === 0 ? (
                <EmptyHint>No related clusters yet. Cousins surface as more vlogs land.</EmptyHint>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {connected_clusters.map(cc => {
                    const ccColor = topicColor(cc.abstracted_topic ?? cc.topic)
                    return (
                      <Link key={cc.id} href={`/cluster/${cc.id}`} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 10px',
                        background: 'var(--bg-1)',
                        borderLeft: `2px solid ${ccColor}`,
                        borderRadius: 4, textDecoration: 'none',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: ccColor }}/>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {truncate(cc.abstracted_topic ?? cc.topic, 32)}
                        </span>
                        <span style={{ fontSize: 9, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>
                          {cc.shared > 0 ? `${cc.shared} shared` : 'topic'} · {cc.ripeness_score ?? 0}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </RailCard>
          </aside>
        </div>

        {/* Provenance */}
        <section style={{
          margin: '0 36px', padding: '20px 0',
          borderTop: '1px solid var(--line)',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px 32px',
        }}>
          <Prov label="Created" value={formatFullDate(cluster.created_at)}/>
          <Prov label="Updated" value={formatFullDate(cluster.updated_at)}/>
          <Prov label="State" value={cluster.state}/>
          <Prov label="Form" value={cluster.form ?? '—'}/>
          <Prov label="Threads" value={`${cluster.threads.length}`}/>
          <Prov label="Insights" value={`${cluster.insights.length}`}/>
          <Prov label="Cluster id" value={cluster.id} mono/>
          <Prov label="Connections" value={`${connected_clusters.length}`}/>
        </section>

        {/* Footer */}
        <footer style={{
          padding: '14px 36px 28px', marginTop: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: 10, color: 'var(--fg-4)',
          fontFamily: 'Geist Mono, ui-monospace, monospace',
          letterSpacing: 0.4, textTransform: 'uppercase',
        }}>
          <span>neolog.ai · cluster {cluster.id.slice(0, 16)}…</span>
          <span>↑ to top · J / K to navigate</span>
        </footer>
      </div>
    </Shell>
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
