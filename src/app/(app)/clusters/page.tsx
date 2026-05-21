'use client'

/**
 * Clusters — riffs that formed. Replaces the old /studio page.
 * Ported from neolog-design/project/screens/clusters.jsx.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, TopicDot } from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'

interface ClusterRow {
  id: string
  abstracted_topic: string | null
  name: string | null
  headline: string | null
  take: string | null
  state: string
  ripeness_score: number
  thread_count?: number
  insight_count?: number
  topic_color_token?: string | null
  last_touched_at?: string | null
  gap_question?: string | null
}

export default function ClustersPage() {
  const [clusters, setClusters] = useState<ClusterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'all' | 'ready' | 'ripening' | 'hold' | 'materialized'>('all')
  const [building, setBuilding] = useState(false)
  const [lastBuild, setLastBuild] = useState<string | null>(null)

  const load = () => {
    fetch('/api/v2/clusters?limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (d?.clusters) setClusters(d.clusters)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  // Build clusters from the operator's existing threads. Idempotent —
  // re-running backfills new threads into existing clusters and creates
  // any new groups that have crossed the 3-thread / 2-vlog threshold
  // since the last run. Safe to click any time.
  const build = async () => {
    setBuilding(true)
    setLastBuild(null)
    try {
      const r = await fetch('/api/v2/admin/build-clusters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setLastBuild(
        `Found ${d.groups_found} group${d.groups_found === 1 ? '' : 's'}. ` +
        `Created ${d.clusters_created} new cluster${d.clusters_created === 1 ? '' : 's'}, ` +
        `updated ${d.clusters_updated}, added ${d.threads_added} thread${d.threads_added === 1 ? '' : 's'}.`
      )
      load()
    } catch (e: any) {
      setLastBuild(`Failed: ${e?.message || String(e)}`)
    } finally {
      setBuilding(false)
    }
  }

  const counts = {
    all: clusters.length,
    ready: clusters.filter(c => c.state === 'ready').length,
    ripening: clusters.filter(c => ['forming','surfaced','ripening'].includes(c.state)).length,
    hold: clusters.filter(c => c.state === 'hold_for_more').length,
    materialized: clusters.filter(c => ['materialized','produced'].includes(c.state)).length,
  }

  const filtered = clusters.filter(c => {
    if (tab === 'all') return true
    if (tab === 'ripening') return ['forming','surfaced','ripening'].includes(c.state)
    if (tab === 'hold') return c.state === 'hold_for_more'
    if (tab === 'materialized') return ['materialized','produced'].includes(c.state)
    return c.state === tab
  })

  const busy = counts.ready > 0

  return (
    <Shell active="clusters" breadcrumb={['Clusters']} hot={busy ? `${counts.ready} ready` : 'all healthy'} busy={busy}>
      <div className="pad-tight" style={{ maxWidth: 940, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="h1-row" style={{ alignItems: 'flex-start' }}>
          <div style={{ borderLeft: '3px solid var(--t-4)', paddingLeft: 14 }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: 6,
            }}>
              Riffs
            </div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Clusters</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 0, maxWidth: 580 }}>
              When threads start to circle the same idea, they form a cluster. When a cluster ripens, you materialize it into a production.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {/* Build / refresh clusters from the operator's existing
                threads. Idempotent. Once auto-link runs on every new
                extraction (next iteration), this button becomes a
                manual "force a rebuild" affordance. */}
            <button
              className="btn"
              onClick={build}
              disabled={building}
            >
              {building ? 'Building…' : (clusters.length === 0 ? 'Build clusters from corpus' : 'Refresh clusters')}
            </button>
            <button className="btn primary"><span className="ico">{NavIcons.Plus}</span>New cluster</button>
          </div>
        </div>

        {lastBuild && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'var(--bg-2)', border: '1px solid var(--line)',
            borderRadius: 6, fontSize: 12, color: 'var(--fg-2)',
          }}>{lastBuild}</div>
        )}

        <div className="tabs" style={{ marginTop: 22 }}>
          <a className={`tab ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All<span className="n">{counts.all}</span></a>
          <a className={`tab ${tab === 'ready' ? 'active' : ''}`} onClick={() => setTab('ready')}>Ready<span className="n">{counts.ready}</span></a>
          <a className={`tab ${tab === 'ripening' ? 'active' : ''}`} onClick={() => setTab('ripening')}>Ripening<span className="n">{counts.ripening}</span></a>
          <a className={`tab ${tab === 'hold' ? 'active' : ''}`} onClick={() => setTab('hold')}>Held<span className="n">{counts.hold}</span></a>
          <a className={`tab ${tab === 'materialized' ? 'active' : ''}`} onClick={() => setTab('materialized')}>Materialized<span className="n">{counts.materialized}</span></a>
        </div>

        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="ico">{NavIcons.Clusters}</div>
            <h3>No clusters yet</h3>
            <p>Click <strong>Build clusters from corpus</strong> above to group existing threads by abstracted_topic. Any group of 3+ threads spanning 2+ vlogs becomes a cluster.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(c => <ClusterCard key={c.id} c={c}/>)}
          </div>
        )}
      </div>
    </Shell>
  )
}

function ClusterCard({ c }: { c: ClusterRow }) {
  const ready = c.state === 'ready'
  const onHold = c.state === 'hold_for_more'
  const topic = c.abstracted_topic ?? c.topic_color_token ?? c.name ?? 'misc'
  const color = topicColor(topic)
  const ripeness = Math.min(100, Math.max(0, c.ripeness_score ?? 0))
  return (
    <Link href={`/cluster/${c.id}`} style={{
      display: 'block',
      background: 'var(--bg-1)',
      border: '1px solid var(--line)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      padding: '22px 24px',
      opacity: onHold ? 0.75 : 1,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {ready && (
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: `radial-gradient(ellipse 40% 60% at 0% 0%, ${color}1a, transparent 60%)` }}/>
      )}
      <div style={{ display: 'flex', gap: 28, alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ flex: 1.4, minWidth: 0 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <span className="mono" style={{
              fontSize: 10, color: color,
              textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
            }}>
              Cluster
            </span>
            {ready && <span className="pill accent">◆ ready</span>}
            {!ready && !onHold && <span className="pill mute">{c.state}</span>}
            {onHold && <span className="pill mute">on hold</span>}
          </div>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.3px', marginBottom: 14, lineHeight: 1.25 }}>
            {c.name ?? c.abstracted_topic ?? c.id}
          </div>
          {c.take && (
            <div style={{
              fontSize: 15, color: 'var(--fg-2)',
              fontStyle: 'italic', lineHeight: 1.55,
              marginBottom: 14,
            }}>
              “{c.take}”
            </div>
          )}
          {c.gap_question && (
            <div style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>
              <span className="mono" style={{ color: 'var(--fg-4)', textTransform: 'uppercase', letterSpacing: 0.4, marginRight: 8 }}>Gap:</span>
              {c.gap_question}
            </div>
          )}
        </div>

        <div style={{ width: 220, flexShrink: 0 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Ripeness</span>
              <span className="mono" style={{ fontSize: 14, color: 'var(--fg-1)' }}>{ripeness}</span>
            </div>
            <div style={{ height: 3, background: 'var(--bg-3)', borderRadius: 2, position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, height: 3, width: `${ripeness}%`, background: ready ? 'var(--accent)' : 'var(--fg-2)', borderRadius: 2, boxShadow: ready ? '0 0 8px var(--accent)' : 'none' }}/>
              <div style={{ position: 'absolute', left: '70%', top: -3, width: 1, height: 9, background: 'var(--fg-4)' }}/>
            </div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-4)', marginTop: 5 }}>threshold · 70</div>
          </div>

          <div style={{ marginBottom: 14, fontSize: 12, display: 'flex', gap: 18 }}>
            <div>
              <div style={{ color: 'var(--fg-1)', fontWeight: 500, fontSize: 16 }}>{c.thread_count ?? 0}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>Threads</div>
            </div>
            {(c.insight_count ?? 0) > 0 && (
              <div>
                <div style={{ color: 'var(--accent)', fontWeight: 500, fontSize: 16 }}>{c.insight_count}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>Insights</div>
              </div>
            )}
          </div>

          <button className={`btn ${ready ? 'primary' : ''}`} style={{ width: '100%', justifyContent: 'center' }}>
            {ready ? 'Materialize →' : onHold ? 'Resume' : 'Develop →'}
          </button>
        </div>
      </div>
    </Link>
  )
}
