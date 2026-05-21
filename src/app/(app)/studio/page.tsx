'use client'

/**
 * Studio — cluster list. Canon rebuild per 03-Cluster.html spirit
 * (the design pack has cluster DETAIL; this list is extended from
 * the canon vocabulary).
 *
 * Was /clusters. Old path redirects here.
 *
 * Hero: 64px h1, eyebrow, build-clusters button.
 * Tab strip: All / Ready / Ripening / Hold.
 * Body: editorial cluster cards (topic-bordered, ripeness bar, take pull,
 * thread count, gap question if any, primary action).
 *
 * Data: GET /api/v2/clusters
 * Build: POST /api/v2/admin/build-clusters
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate } from '@/components/threadkit'

interface ClusterRow {
  id: string
  abstracted_topic: string | null
  topic: string
  take: string | null
  state: string
  ripeness_score: number
  thread_count?: number
  insight_count?: number
  gap_question?: string | null
  last_touched_at?: string | null
}

type Tab = 'all' | 'ready' | 'ripening' | 'hold' | 'materialized'

const TABS: { key: Tab; label: string }[] = [
  { key: 'all',          label: 'All' },
  { key: 'ready',        label: 'Ready' },
  { key: 'ripening',     label: 'Ripening' },
  { key: 'hold',         label: 'Hold' },
  { key: 'materialized', label: 'Materialized' },
]

export default function StudioListPage() {
  const [clusters, setClusters] = useState<ClusterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('all')
  const [building, setBuilding] = useState(false)
  const [buildNote, setBuildNote] = useState<string | null>(null)

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

  const build = async () => {
    setBuilding(true)
    setBuildNote(null)
    try {
      const r = await fetch('/api/v2/admin/build-clusters', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setBuildNote(
        `Found ${d.groups_found} group${d.groups_found === 1 ? '' : 's'}. ` +
        `Created ${d.clusters_created}, updated ${d.clusters_updated}, added ${d.threads_added} threads.`
      )
      load()
    } catch (e: any) {
      setBuildNote(`Failed: ${e?.message || String(e)}`)
    } finally {
      setBuilding(false)
    }
  }

  const counts = useMemo(() => ({
    all: clusters.length,
    ready: clusters.filter(c => c.state === 'ready' || c.ripeness_score >= 70).length,
    ripening: clusters.filter(c => ['forming', 'surfaced', 'ripening'].includes(c.state)).length,
    hold: clusters.filter(c => c.state === 'hold').length,
    materialized: clusters.filter(c => ['produced', 'published', 'materialized'].includes(c.state)).length,
  }), [clusters])

  const filtered = useMemo(() => {
    if (tab === 'all') return clusters
    if (tab === 'ready') return clusters.filter(c => c.state === 'ready' || c.ripeness_score >= 70)
    if (tab === 'ripening') return clusters.filter(c => ['forming', 'surfaced', 'ripening'].includes(c.state))
    if (tab === 'hold') return clusters.filter(c => c.state === 'hold')
    if (tab === 'materialized') return clusters.filter(c => ['produced', 'published', 'materialized'].includes(c.state))
    return clusters
  }, [clusters, tab])

  return (
    <Shell>
      {/* Hero */}
      <section className="canon-reveal d1" style={{ padding: '40px 0 32px' }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
          textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 20,
          display: 'inline-flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
          The substrate · braided
        </div>
        <h1 style={{
          fontFamily: 'var(--font-body)', fontWeight: 400,
          fontSize: 72, lineHeight: 1.0, letterSpacing: '-3px',
          color: 'var(--fg)', margin: '0 0 22px', textWrap: 'balance',
        }}>
          Clusters<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> <span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>cultivating</span><span style={{ color: 'var(--sig)' }}>.</span>
        </h1>
        <p style={{
          fontSize: 17, lineHeight: 1.55, color: 'var(--fg-2)',
          maxWidth: 620, letterSpacing: '-0.15px', marginBottom: 28,
        }}>
          Clusters are positions braided across weeks of riffs. When one ripens past 70,
          it's ready to produce. Identify pattern fills in adjacent thinking; bounce sharpens the gap.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={build} disabled={building} className="canon-btn ghost">
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 8a4 4 0 0 1 4-4 4 4 0 0 1 4 4 M3 8a4 4 0 0 0 4 4 4 4 0 0 0 4 -4 M10 4 L12 2 L12 5 M4 12 L2 14 L2 11"/></svg></span>
            {building ? 'Building…' : 'Build / refresh clusters'}
          </button>
          {buildNote && (
            <span style={{ fontSize: 12, color: 'var(--fg-3)' }}>{buildNote}</span>
          )}
        </div>
      </section>

      {/* Tabs */}
      <div className="canon-reveal d2" style={{
        display: 'flex', gap: 6, borderBottom: '1px solid var(--line)',
        paddingBottom: 18, marginBottom: 32,
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`canon-filter-chip ${tab === t.key ? 'active' : ''}`}
          >
            {t.label}
            <span className="n">{counts[t.key]}</span>
          </button>
        ))}
      </div>

      {/* Body */}
      {loading && <div style={{ color: 'var(--fg-3)', padding: 20 }}>Loading…</div>}

      {!loading && filtered.length === 0 && (
        <div style={{
          padding: '60px 32px',
          border: '1px dashed var(--line-2)',
          borderRadius: 14, background: 'var(--bg-1)',
          textAlign: 'center',
        }}>
          <h2 style={{
            fontFamily: 'var(--font-body)', fontSize: 32, fontWeight: 400,
            letterSpacing: '-1px', color: 'var(--fg)', margin: '0 0 14px',
          }}>
            {clusters.length === 0 ? 'No clusters yet.' : `Nothing in ${tab}.`}
          </h2>
          <p style={{ color: 'var(--fg-2)', maxWidth: 480, margin: '0 auto', lineHeight: 1.55 }}>
            {clusters.length === 0
              ? 'Once you have a few threads on the same topic, hit Build / refresh clusters above to braid them together.'
              : 'Switch tabs or build more clusters from your threads.'}
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="canon-reveal d3" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(c => <ClusterCard key={c.id} cluster={c}/>)}
        </div>
      )}
    </Shell>
  )
}

function ClusterCard({ cluster }: { cluster: ClusterRow }) {
  const topicName = cluster.abstracted_topic ?? cluster.topic
  const color = topicColor(topicName)
  const ripe = Math.round(cluster.ripeness_score)
  const ready = ripe >= 70
  return (
    <Link href={`/studio/${cluster.id}`} className="tcard" style={{
      '--topic': color,
      '--topic-soft': `color-mix(in srgb, ${color} 9%, transparent)`,
      borderLeft: `3px solid ${color}`,
    } as any}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Cluster</span></span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          letterSpacing: 1.6, textTransform: 'uppercase',
          color: ready ? 'var(--sig)' : 'var(--fg-3)',
          padding: '3px 9px', borderRadius: 100,
          background: ready ? 'var(--sig-soft)' : 'var(--bg-2)',
          border: `1px solid ${ready ? 'color-mix(in srgb, var(--sig) 35%, transparent)' : 'var(--line-1)'}`,
        }}>
          {cluster.state}
        </span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)' }}>
          {cluster.thread_count ?? 0} threads
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 20, fontWeight: 500,
        letterSpacing: '-0.4px', color: 'var(--fg)', lineHeight: 1.25,
        marginBottom: 10,
      }}>
        {truncate(topicName, 80)}
      </div>
      {cluster.take && (
        <div style={{
          fontSize: 13.5, color: 'var(--fg-2)',
          lineHeight: 1.5, marginBottom: 14,
          fontStyle: 'italic', paddingLeft: 12,
          borderLeft: `2px solid ${color}`,
        }}>
          {truncate(cluster.take, 140)}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        marginBottom: 6,
      }}>
        <div style={{
          flex: 1, height: 3, background: 'var(--line-1)', borderRadius: 2,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, height: 3,
            width: `${ripe}%`,
            background: ready ? 'var(--sig)' : color,
            borderRadius: 2,
            boxShadow: ready ? '0 0 6px var(--sig-glow)' : `0 0 6px ${color}80`,
          }}/>
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 11,
          color: ready ? 'var(--sig)' : 'var(--fg-1)',
          fontWeight: 500, fontVariantNumeric: 'tabular-nums',
        }}>{ripe}</span>
      </div>
      {cluster.gap_question && (
        <div style={{
          marginTop: 12, padding: '10px 12px',
          background: 'var(--bg-2)',
          border: '1px dashed color-mix(in srgb, var(--sig) 30%, transparent)',
          borderRadius: 6,
          fontSize: 12, color: 'var(--fg-2)',
          fontStyle: 'italic', lineHeight: 1.5,
        }}>
          {truncate(cluster.gap_question, 120)}
        </div>
      )}
    </Link>
  )
}
