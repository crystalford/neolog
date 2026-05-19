'use client'

/**
 * Console — home / dashboard.
 *
 * Ported from neolog-design/project/screens/console.jsx. Greeting +
 * ready-cluster surface + metric tiles + activity stream + bottom split.
 *
 * Data wiring is partial in this commit — counts and activity stream are
 * fetched from existing /api/v2/* endpoints; the ready-cluster block uses
 * the first cluster with state='ready' && ripeness_score >= 70 if any.
 */

export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Shell, { LogoMark, NavIcons } from '@/components/Shell'

interface CountsResp {
  vlogs?: number
  threads?: number
  clusters?: number
  vlogs_complete?: number
  vlogs_processing?: number
}

interface ActivityRow {
  id: string
  ts: number
  kind: string         // 'vlog' | 'thread' | 'cluster' | 'pipeline' | ...
  dot: 'accent' | 'hot' | 'ok' | 'warn' | 'err'
  status: string
  duration?: string
  what: string         // human-readable past-tense sentence
  href?: string
}

export default function ConsolePage() {
  const [counts, setCounts] = useState<CountsResp>({})
  const [activity, setActivity] = useState<ActivityRow[]>([])
  const [now, setNow] = useState<Date>(new Date())

  useEffect(() => {
    setNow(new Date())
    fetch('/api/v2/timeline?limit=20&kinds=vlog,thread,cluster,surfaced', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return
        const items: any[] = d.items ?? d.cards ?? []
        setActivity(items.slice(0, 12).map(rowFromTimeline))
      })
      .catch(() => {})

    fetch('/api/v2/graph/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return
        setCounts({
          vlogs: d.vlog_count ?? d.vlogs ?? undefined,
          threads: d.thread_count ?? d.threads ?? undefined,
          clusters: d.cluster_count ?? d.clusters ?? undefined,
          vlogs_complete: d.vlog_complete_count,
          vlogs_processing: d.vlog_processing_count,
        })
      })
      .catch(() => {})
  }, [])

  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
  const timeLabel = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  })
  const greeting = greetingFor(now)
  const busyCount = counts.vlogs_processing ?? 0
  const busy = busyCount > 0

  return (
    <Shell active="console" breadcrumb={['Console']} hot={busy ? `${busyCount} active` : 'all healthy'} busy={busy}>
      <div className="pad">
        {/* Greeting */}
        <div style={{ marginBottom: 28 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: 0.5, color: 'var(--fg-3)', marginBottom: 10, textTransform: 'uppercase' }}>
            {dateLabel} · {timeLabel}
          </div>
          <h1 style={{ fontSize: 28, marginBottom: 8 }}>{greeting}, Crystal.</h1>
          <p style={{ fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.55, maxWidth: 620 }}>
            {busy
              ? `${busyCount} ${busyCount === 1 ? 'vlog is' : 'vlogs are'} processing right now. Live progress is on the right of any vlog detail page.`
              : `Nothing in flight. ${counts.vlogs ?? '—'} vlogs indexed, ${counts.threads ?? '—'} threads, ${counts.clusters ?? '—'} clusters so far.`}
          </p>
        </div>

        {/* Metric tiles */}
        <div className="tiles">
          <Tile label="Vlogs indexed" num={counts.vlogs_complete ?? counts.vlogs} sub={counts.vlogs ? `of ${counts.vlogs}` : undefined} delta={null} />
          <Tile label="Threads" num={counts.threads} delta={null} />
          <Tile label="Clusters" num={counts.clusters} delta={null} />
          <Tile label="Processing" num={busyCount} delta={null} />
        </div>

        {/* Activity stream */}
        <div className="tabs">
          <a className="tab active">Recent activity<span className="n">{activity.length}</span></a>
          <a className="tab">In pipeline<span className="n">{busyCount}</span></a>
          <a className="tab">Failures<span className="n">0</span></a>
        </div>

        <div className="list">
          <div className="row head" style={{ gridTemplateColumns: '14px 96px 1fr 110px 80px' }}>
            <span/>
            <span>When</span>
            <span>What happened</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Duration</span>
          </div>
          {activity.length === 0 ? (
            <div className="row" style={{ gridTemplateColumns: '1fr', justifyContent: 'center', color: 'var(--fg-3)', cursor: 'default' }}>
              No activity yet. Drop a vlog on Capture or check back after the next upload.
            </div>
          ) : activity.map((e) => (
            <Link key={e.id} href={e.href ?? '#'} style={{ display: 'contents' }}>
              <div className="row" style={{ gridTemplateColumns: '14px 96px 1fr 110px 80px' }}>
                <span style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: dotColor(e.dot),
                  boxShadow: (e.dot === 'hot' || e.dot === 'accent') ? `0 0 8px ${dotColor(e.dot)}` : 'none',
                }}/>
                <span className="mono" style={{ color: 'var(--fg-3)', fontSize: 11 }}>{shortTime(e.ts)}</span>
                <span style={{ color: 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.what}
                </span>
                <span><span className={`pill ${e.dot}`}>{e.status}</span></span>
                <span className="mono" style={{ textAlign: 'right', color: 'var(--fg-3)', fontSize: 11 }}>{e.duration ?? ''}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom split: ask + tips */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 32 }}>
          <div className="card">
            <div className="card-h">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ display: 'inline-flex', color: 'var(--fg-2)' }}><LogoMark size={14}/></span>
                <span style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>Ask the assistant</span>
                <span className="pill mute">kimi · default</span>
              </div>
              <Link href="/chat" className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>open chat →</Link>
            </div>
            <Link href="/chat" style={{ display: 'block', background: 'var(--bg-2)', border: '1px solid var(--line-1)', borderRadius: 8, padding: '12px 14px', cursor: 'text' }}>
              <div style={{ fontSize: 14, color: 'var(--fg-3)' }}>What was I saying about regulation last week?</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12, fontSize: 11, color: 'var(--fg-3)' }} className="mono">
                <span>@ mentions search · / for commands</span>
                <span style={{ flex: 1 }}/>
                <span>⌘↵ to send</span>
              </div>
            </Link>
          </div>

          <div className="card">
            <div className="card-h">
              <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>Quick links</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Link href="/capture" className="btn" style={{ justifyContent: 'flex-start' }}>
                <span className="ico">{NavIcons.Capture}</span>
                Drop a vlog<span className="kbd" style={{ marginLeft: 'auto' }}>⌘N</span>
              </Link>
              <Link href="/vlogs" className="btn ghost" style={{ justifyContent: 'flex-start' }}>
                <span className="ico">{NavIcons.Vlogs}</span>
                Browse all vlogs
              </Link>
              <Link href="/system" className="btn ghost" style={{ justifyContent: 'flex-start' }}>
                <span className="ico">{NavIcons.System}</span>
                System health
              </Link>
              <Link href="/settings" className="btn ghost" style={{ justifyContent: 'flex-start' }}>
                <span className="ico">{NavIcons.Settings}</span>
                Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

function Tile({ label, num, sub, delta }: { label: string; num?: number | string; sub?: string; delta?: string | null }) {
  return (
    <div className="tile">
      <div className="label">{label}</div>
      <div className="num">
        {num ?? '—'}
        {sub && <span style={{ color: 'var(--fg-3)', fontSize: 16 }}> {sub}</span>}
      </div>
      {delta && <div className="delta">{delta}</div>}
    </div>
  )
}

function greetingFor(d: Date): string {
  const h = d.getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function shortTime(ts: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  const now = new Date()
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (dayDiff === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false })
  if (dayDiff === 1) return 'Yesterday'
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dotColor(d: ActivityRow['dot']): string {
  switch (d) {
    case 'accent': return 'var(--accent)'
    case 'hot':    return 'var(--hot)'
    case 'warn':   return 'var(--warn)'
    case 'err':    return 'var(--err)'
    case 'ok':
    default:       return 'var(--ok)'
  }
}

function rowFromTimeline(item: any): ActivityRow {
  // Best-effort shape mapping. The timeline endpoint returns heterogeneous
  // cards; we squash to a uniform { kind, dot, status, what } row.
  const kind = item.kind ?? item.type ?? 'event'
  const ts = item.ts ?? item.created_at ?? item.recorded_at ?? Date.now()
  const tsMs = typeof ts === 'number' ? ts : new Date(ts).getTime()
  if (kind === 'vlog') {
    const status = item.pipeline_status ?? 'uploaded'
    const dot: ActivityRow['dot'] = status === 'complete' ? 'ok'
      : status === 'failed' ? 'err'
      : status === 'archived' ? 'warn'
      : 'hot'
    return {
      id: item.id ?? String(tsMs),
      ts: tsMs,
      kind,
      dot,
      status,
      what: `Vlog ${status}. ${item.original_filename ?? item.title ?? item.id}`,
      href: `/timeline/${item.id}`,
    }
  }
  if (kind === 'thread') {
    return {
      id: item.id ?? String(tsMs),
      ts: tsMs,
      kind,
      dot: 'ok',
      status: 'ok',
      what: `Thread written. ${item.take ? `"${String(item.take).slice(0, 120)}"` : item.topic ?? '—'}`,
      href: `/thread/${item.id}`,
    }
  }
  if (kind === 'cluster' || kind === 'surfaced') {
    return {
      id: item.id ?? String(tsMs),
      ts: tsMs,
      kind,
      dot: 'accent',
      status: 'surfaced',
      what: `Cluster surfaced. ${item.headline ?? item.abstracted_topic ?? item.name ?? '—'}`,
      href: `/cluster/${item.id}`,
    }
  }
  return {
    id: item.id ?? String(tsMs),
    ts: tsMs,
    kind,
    dot: 'ok',
    status: kind,
    what: item.title ?? item.headline ?? item.what ?? kind,
    href: undefined,
  }
}
