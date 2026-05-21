'use client'

/**
 * Timeline — the heterogeneous feed. Everything you've ever captured or
 * the system has surfaced, newest first, one card per item.
 *
 * The Console-direction design technically folded this into the activity
 * stream on /, but the operator wanted a dedicated feed surface that
 * reads like an X timeline — full-bleed, card-per-item, scroll forever.
 * So /timeline is back, in the new design language.
 *
 * Reads from /api/v2/timeline which fans across vlogs, threads,
 * clip_candidates, posts, surfaced_cards, etc., returning a sorted union.
 */

export const runtime = 'edge'

import { useEffect, useState, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Shell, { NavIcons, Pips, TopicDot } from '@/components/Shell'

// Clips dropped as a distinct type — operator's call: "clips are
// separate, but really it seems like the same thing." Threads cover
// the same data (quote + timespan). Filtering them out at the type
// level keeps them off the feed entirely. Existing clip rows stay
// in the DB hidden behind the absence of any rendering path.
type Filter = 'all' | 'vlog' | 'thread' | 'post' | 'surfaced'

// Hash arbitrary topic strings into one of the 8 topic accent slots.
// The same string always maps to the same color so a recurring topic
// across vlogs reads as one visual thread without relying on a hand-
// curated map. Falls back to --fg-3 for genuinely empty topics.
function topicColor(topic?: string | null): string {
  const t = (topic ?? '').trim().toLowerCase()
  if (!t) return 'var(--fg-3)'
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return `var(--t-${(h % 8) + 1})`
}

interface FeedItem {
  id: string
  kind: string
  ts: number
  // shape varies per kind — we destructure inside renderers
  raw: any
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'vlog',     label: 'Vlogs' },
  { key: 'thread',   label: 'Threads' },
  { key: 'post',     label: 'Posts' },
  { key: 'surfaced', label: 'Surfaced' },
]

export default function TimelinePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlFilter = (searchParams?.get('filter') as Filter | null) ?? 'all'
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>(
    ['all', 'vlog', 'thread', 'post', 'surfaced'].includes(urlFilter as string) ? urlFilter : 'all',
  )
  // Right-rail content: ripening clusters + graph preview.
  const [rail, setRail] = useState<{
    ripening: { id: string; name: string; topic: string; ripeness: number; thread_count: number }[]
    graph: { clusters: { id: string; topic: string; ripeness: number; thread_count: number }[]; entities_count: number; threads_count: number }
    hero_cluster: { id: string; name: string; topic: string; take: string | null; ripeness: number; thread_count: number; gap_question: string | null } | null
  } | null>(null)

  // Keep URL in sync with filter — operator can deep-link a filter view
  // (e.g. /?filter=thread for the threads-only view).
  useEffect(() => {
    const current = searchParams?.get('filter')
    if (filter === 'all' && current) router.replace('/', { scroll: false })
    else if (filter !== 'all' && current !== filter) router.replace(`/?filter=${filter}`, { scroll: false })
  }, [filter])

  // Load clusters for the right-rail (ripening list) + pinned hero
  // card. Lightweight query, runs in parallel with the main timeline
  // fetch.
  useEffect(() => {
    fetch('/api/v2/clusters?limit=12', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d?.clusters) return
        const sorted = [...d.clusters].sort((a: any, b: any) => (b.ripeness ?? 0) - (a.ripeness ?? 0))
        const top = sorted[0]
        setRail({
          ripening: sorted.slice(0, 8).map((c: any) => ({
            id: c.id,
            name: c.name ?? c.abstracted_topic ?? c.topic ?? 'cluster',
            topic: c.abstracted_topic ?? c.topic ?? 'misc',
            ripeness: c.ripeness ?? 0,
            thread_count: c.thread_count ?? c.stats?.threads ?? 0,
          })),
          graph: {
            clusters: sorted.slice(0, 7).map((c: any) => ({
              id: c.id,
              topic: c.abstracted_topic ?? c.topic ?? 'misc',
              ripeness: c.ripeness ?? 0,
              thread_count: c.thread_count ?? c.stats?.threads ?? 0,
            })),
            entities_count: 0,
            threads_count: 0,
          },
          // Pin a hero card only if the top cluster is genuinely ripe
          // (>= 60). Otherwise the page leads with the feed, which is
          // the right behavior when there's nothing dramatic to flag.
          hero_cluster: (top && (top.ripeness ?? 0) >= 60) ? {
            id: top.id,
            name: top.name ?? top.abstracted_topic ?? top.topic,
            topic: top.abstracted_topic ?? top.topic ?? 'misc',
            take: top.take ?? null,
            ripeness: top.ripeness ?? 0,
            thread_count: top.thread_count ?? top.stats?.threads ?? 0,
            gap_question: top.gap_question ?? null,
          } : null,
        })
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/v2/timeline?limit=200', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        if (!d) return
        const raw: any[] = d.items ?? d.cards ?? []
        const mapped: FeedItem[] = raw.map((it: any) => ({
          id: it.id ?? `${it.kind ?? 'item'}-${it.ts ?? Date.now()}`,
          kind: it.kind ?? it.type ?? 'event',
          ts: toMs(it.ts ?? it.created_at ?? it.recorded_at ?? it.extracted_at),
          raw: it,
        }))
        mapped.sort((a, b) => b.ts - a.ts)
        setItems(mapped)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, vlog: 0, thread: 0, post: 0, surfaced: 0 }
    for (const it of items) {
      c.all++
      if (it.kind in c) (c as any)[it.kind]++
    }
    return c
  }, [items])

  const filtered = filter === 'all' ? items : items.filter(it => it.kind === filter)

  // Group items by day for sticky date dividers
  const groups: { label: string; items: FeedItem[] }[] = []
  let currentDay = ''
  for (const it of filtered) {
    const day = new Date(it.ts).toDateString()
    if (day !== currentDay) {
      currentDay = day
      groups.push({ label: dayLabel(it.ts), items: [] })
    }
    groups[groups.length - 1].items.push(it)
  }

  return (
    <Shell active="timeline" breadcrumb={['Timeline']}>
      {/* Two-column layout matching the design prototype's structure:
          main feed (820px reading column) + right rail (340px sticky)
          with ripening cluster list + graph preview. The rail surfaces
          what's emerging in the corpus alongside the chronological
          feed so the operator can see "what's happening" in two
          views at once. */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 340px',
        gap: 36,
        maxWidth: 1240,
        margin: '0 auto',
        padding: '24px 36px',
      }}>
        <div style={{ minWidth: 0 }}>
          {/* Pinned hero — only renders when a cluster is ripe enough
              to materialize. This is the "macro-cluster ready" callout
              from the prototype. Replaces the small "the feed" editorial
              accent when there's something dramatic to flag. */}
          {rail?.hero_cluster ? (
            <HeroClusterCard hero={rail.hero_cluster}/>
          ) : (
            <div style={{ borderLeft: '3px solid var(--t-1)', paddingLeft: 14, marginBottom: 28 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--fg-4)', marginBottom: 6 }}>
                The feed
              </div>
              <h1 style={{ marginTop: 0, marginBottom: 8 }}>Timeline</h1>
              <p className="sub" style={{ marginBottom: 0, marginTop: 0, maxWidth: 540 }}>
                Vlogs, threads, posts — chronological by recording date.
              </p>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <div className="pills">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`filter-pill ${filter === f.key ? 'active' : ''}`}
                >
                  {f.label} <span className="n">{counts[f.key]}</span>
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="empty">
              <div className="ico">{NavIcons.Vlogs}</div>
              <h3>Nothing on the timeline yet</h3>
              <p>Drop a vlog on Capture to seed it. New threads and surfaced cards land here as they're created.</p>
              <Link href="/capture" className="btn primary"><span className="ico">{NavIcons.Plus}</span>Add vlog</Link>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
            {groups.map((g, gi) => (
              <div key={gi}>
                {/* Editorial day band — uppercase mono, hairline below,
                    breathing room so each day reads as a chapter. */}
                <div style={{
                  display: 'flex', alignItems: 'baseline',
                  paddingBottom: 10, marginBottom: 14,
                  borderBottom: '1px solid var(--line)',
                }}>
                  <span className="mono" style={{
                    fontSize: 11, color: 'var(--fg-2)',
                    letterSpacing: 1.5, textTransform: 'uppercase',
                    fontWeight: 500,
                  }}>
                    {g.label}
                  </span>
                  <span className="mono" style={{
                    marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)',
                    letterSpacing: 0.4,
                  }}>
                    {g.items.length} {g.items.length === 1 ? 'item' : 'items'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {g.items.map(it => <FeedCard key={it.id + ':' + it.ts} item={it}/>)}
                </div>
              </div>
              ))}
            </div>
          )}
        </div>

        {/* Right rail — Ripening list + Graph preview. Matches the
            prototype's "RIPENING" + "GRAPH · THIS WEEK" rail. Sticky
            so it stays visible while scrolling the feed. */}
        <aside style={{ position: 'sticky', top: 24, alignSelf: 'start', display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {rail && rail.ripening.length > 0 && (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>Ripening</h3>
                <Link href="/clusters" style={{ fontSize: 10, color: 'var(--fg-3)', textDecoration: 'none', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>All {rail.ripening.length} →</Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {rail.ripening.map(r => (
                  <Link key={r.id} href={`/cluster/${r.id}`} style={{ display: 'block', textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: topicColor(r.topic), flexShrink: 0 }}/>
                      <span style={{ flex: 1, fontSize: 12, color: 'var(--fg-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.name}
                      </span>
                      <span style={{ fontSize: 10, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>{Math.round(r.ripeness)}</span>
                    </div>
                    <div style={{ height: 2, background: 'var(--bg-3)', borderRadius: 1, position: 'relative', overflow: 'hidden' }}>
                      <div style={{ position: 'absolute', left: 0, top: 0, height: 2, width: `${Math.min(100, r.ripeness)}%`, background: topicColor(r.topic), borderRadius: 1 }}/>
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--fg-4)', marginTop: 4, letterSpacing: 0.4, fontFamily: 'Geist Mono, ui-monospace, monospace', textTransform: 'uppercase' }}>
                      {r.thread_count} thread{r.thread_count === 1 ? '' : 's'}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {rail && rail.graph.clusters.length > 0 && (
            <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: 12, fontWeight: 500, color: 'var(--fg-1)' }}>Graph · this week</h3>
                <Link href="/graph" style={{ fontSize: 10, color: 'var(--fg-3)', textDecoration: 'none', letterSpacing: 0.4, textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace' }}>Open →</Link>
              </div>
              <Link href="/graph" style={{ display: 'block', textDecoration: 'none' }}>
                <RailGraphPreview clusters={rail.graph.clusters}/>
              </Link>
            </div>
          )}
        </aside>
      </div>
    </Shell>
  )
}

// Pinned hero card — surfaces the operator's top-ranked ripe cluster
// at the top of the timeline. Replaces the small editorial accent when
// there's something dramatic to flag (e.g. cluster's ready to materialize).
function HeroClusterCard({ hero }: { hero: { id: string; name: string; topic: string; take: string | null; ripeness: number; thread_count: number; gap_question: string | null } }) {
  const color = topicColor(hero.topic)
  const ready = hero.ripeness >= 70
  const circumference = 2 * Math.PI * 26
  const dash = circumference * (1 - hero.ripeness / 100)
  return (
    <Link href={`/cluster/${hero.id}`} style={{
      display: 'block', marginBottom: 28,
      padding: '24px 26px',
      background: 'var(--bg-1)',
      border: '1px solid var(--line)',
      borderLeft: `3px solid ${color}`,
      borderRadius: 10,
      textDecoration: 'none',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        background: `radial-gradient(ellipse 30% 60% at 0% 0%, ${color}1a, transparent 60%)` }}/>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 24, alignItems: 'flex-start', position: 'relative' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 10, color, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: 600,
            fontFamily: 'Geist Mono, ui-monospace, monospace', marginBottom: 12,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}` }}/>
            {ready ? 'Ready to produce' : 'Ripening'} · {hero.topic}
          </div>
          <h1 style={{ margin: '0 0 12px', fontSize: 34, fontWeight: 500, letterSpacing: '-0.8px', lineHeight: 1.18, color: 'var(--fg)' }}>
            {hero.name}
          </h1>
          {hero.take && (
            <p style={{ margin: '0 0 14px', fontSize: 15, color: 'var(--fg-2)', lineHeight: 1.55, fontStyle: 'italic', maxWidth: 600 }}>
              “{hero.take.length > 200 ? hero.take.slice(0, 197) + '…' : hero.take}”
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, fontSize: 11, color: 'var(--fg-3)', fontFamily: 'Geist Mono, ui-monospace, monospace', letterSpacing: 0.3 }}>
            <span><b style={{ color: 'var(--fg-1)', fontFamily: 'inherit' }}>{hero.thread_count}</b> threads</span>
            {hero.gap_question && <span style={{ color: 'var(--fg-4)' }}>· 1 gap question</span>}
            <span style={{ marginLeft: 'auto', color }}>Open in Studio →</span>
          </div>
        </div>
        <div style={{ position: 'relative', width: 80, height: 80, alignSelf: 'center' }}>
          <svg viewBox="0 0 80 80" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
            <circle cx="40" cy="40" r="26" fill="none" stroke="var(--line-2)" strokeWidth="4"/>
            <circle cx="40" cy="40" r="26" fill="none" stroke={color} strokeWidth="4"
              strokeDasharray={circumference} strokeDashoffset={dash} strokeLinecap="round"/>
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 24, fontWeight: 500, color: 'var(--fg)', letterSpacing: '-0.8px', lineHeight: 1 }}>{Math.round(hero.ripeness)}</span>
            <span style={{ fontSize: 8, color, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: 'Geist Mono, ui-monospace, monospace', fontWeight: 600, marginTop: 2 }}>ripe</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// Small radial graph preview for the right rail — clusters as
// topic-colored dots scattered around a central point.
function RailGraphPreview({ clusters }: { clusters: { id: string; topic: string; ripeness: number; thread_count: number }[] }) {
  const W = 280, H = 160, cx = W / 2, cy = H / 2
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 160, display: 'block' }}>
      <defs>
        {clusters.map((c, i) => (
          <radialGradient key={i} id={`rg-${i}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={topicColor(c.topic)} stopOpacity={0.45}/>
            <stop offset="100%" stopColor={topicColor(c.topic)} stopOpacity={0}/>
          </radialGradient>
        ))}
      </defs>
      {clusters.map((c, i) => {
        const a = (i / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2
        const r = 56
        const x = cx + Math.cos(a) * r
        const y = cy + Math.sin(a) * r
        const sz = 6 + (c.thread_count ?? 0) * 0.6
        return (
          <g key={c.id}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={topicColor(c.topic)} strokeWidth={0.5} strokeOpacity={0.25}/>
            <circle cx={x} cy={y} r={sz + 6} fill={`url(#rg-${i})`}/>
            <circle cx={x} cy={y} r={sz} fill={topicColor(c.topic)} fillOpacity={0.92}/>
          </g>
        )
      })}
      <circle cx={cx} cy={cy} r={5} fill="var(--fg)"/>
    </svg>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'vlog':     return <VlogCard r={item.raw}/>
    case 'thread':   return <ThreadCard r={item.raw}/>
    // 'clip' deprecated — return null so any stale clip rows from
    // before the drop don't render. The ClipCard component is kept
    // (dead code) in case we ever bring clips back as a real
    // publishing surface.
    case 'clip':     return null
    case 'post':     return <PostCard r={item.raw}/>
    case 'surfaced': return <SurfacedCard r={item.raw}/>
    case 'creative': return <CreativeCard r={item.raw}/>
    case 'entity':   return <EntityCard r={item.raw}/>
    case 'pipeline_event': return <PipelineEventCard r={item.raw}/>
    default:         return <DefaultCard r={item.raw} kind={item.kind}/>
  }
}

function VlogCard({ r }: { r: any }) {
  const status = r.pipeline_status ?? 'uploaded'
  const isBroll = r.is_broll === true
  const cls = isBroll ? 'mute'
    : status === 'complete' ? 'ok'
    : status === 'failed' ? 'err'
    : status === 'archived' ? 'mute'
    : 'hot'
  const size = r.file_size_bytes ? `${(r.file_size_bytes / 1_000_000).toFixed(1)} MB` : ''
  // B-roll vlogs use a neutral gray spine instead of a topic color —
  // they're not contributing extracted ideas, just visual footage.
  // Visually separable from "complete vlog with threads" at a glance.
  const color = isBroll ? 'var(--fg-4)' : topicColor(r.title ?? r.original_filename ?? r.id)
  return (
    <Link href={`/timeline/${r.id}`} className="card" style={{
      padding: '14px 18px', display: 'block',
      borderLeft: `3px solid ${color}`,
      opacity: isBroll ? 0.78 : 1,
    }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
        <div style={{
          width: 140, aspectRatio: '16/10', flexShrink: 0,
          borderRadius: 6,
          background: r.thumbnail_url ? `center / cover no-repeat url(${r.thumbnail_url})` : 'linear-gradient(135deg, var(--bg-3), var(--bg-2))',
          border: '1px solid var(--line)',
          position: 'relative',
        }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="white"><polygon points="5,3 12,8 5,13"/></svg>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span className="mono" style={{
              fontSize: 10, color: color,
              textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
            }}>
              {isBroll ? 'B-roll' : 'Vlog'}
            </span>
            {isBroll
              ? <span className="pill mute" title="No extractable dialogue — silent / ambient footage. Still usable as visual material for future productions.">silent footage</span>
              : <span className={`pill ${cls}`}>{status}</span>}
            <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
              {timeOfDay(r.ts ?? r.recorded_at ?? r.created_at)}
            </span>
          </div>
          <div style={{
            fontSize: 14, color: 'var(--fg)', fontWeight: 500,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 4,
          }}>
            {r.original_filename ?? r.title ?? r.id}
          </div>
          {size && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
              {size}
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

function ThreadCard({ r }: { r: any }) {
  const topic = (r.abstracted_topic ?? r.topic ?? 'misc')
  const color = topicColor(topic)
  return (
    <Link href={`/thread/${r.id}`} className="card" style={{
      padding: '18px 22px',
      display: 'block',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span className="mono" style={{
          fontSize: 10, color: color,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          Thread · {r.register ?? 'observation'}
        </span>
        {r.strength != null && <Pips n={r.strength}/>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.extracted_at)}
        </span>
      </div>
      {/* The take reads like a pull-quote — italic, large, no extra
          left bar because the card spine IS the bar. */}
      <div style={{
        fontSize: 17, color: 'var(--fg)',
        lineHeight: 1.45, fontStyle: 'italic',
        fontWeight: 400,
      }}>
        “{String(r.take ?? '').slice(0, 280)}”
      </div>
      {r.topic && (
        <div className="mono" style={{
          fontSize: 10, color: 'var(--fg-3)', marginTop: 14,
          letterSpacing: 0.8, textTransform: 'uppercase',
        }}>
          {r.topic}
        </div>
      )}
    </Link>
  )
}

function ClipCard({ r }: { r: any }) {
  const start = formatTime(Number(r.start_time ?? 0))
  const end = formatTime(Number(r.end_time ?? 0))
  const color = topicColor(r.topic ?? r.headline ?? 'clip')
  return (
    <Link href={`/clip/${r.id}`} className="card" style={{
      padding: '16px 20px', display: 'block',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="mono" style={{
          fontSize: 10, color: color,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          Clip · {start} → {end}
        </span>
        <span className={`pill ${r.status === 'published' ? 'ok' : 'mute'}`}>{r.status ?? 'candidate'}</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.extracted_at)}
        </span>
      </div>
      {r.headline && (
        <div style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500, marginBottom: 8 }}>
          {r.headline}
        </div>
      )}
      {r.quote && (
        <div style={{
          fontSize: 15, color: 'var(--fg-1)',
          lineHeight: 1.5, fontStyle: 'italic',
        }}>
          “{r.quote}”
        </div>
      )}
    </Link>
  )
}

function PostCard({ r }: { r: any }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {r.kind ?? 'post'} · {r.state ?? 'draft'}
        </span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>{timeOfDay(r.ts ?? r.published_at ?? r.created_at)}</span>
      </div>
      <div style={{ fontSize: 14, color: 'var(--fg)', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
        {String(r.body ?? r.title ?? '').slice(0, 320)}
      </div>
    </div>
  )
}

function SurfacedCard({ r }: { r: any }) {
  const subtypeKey = String(r.subtype ?? r.kind ?? 'card')
  const subtype = subtypeKey.replace(/_/g, ' ')
  const isAdjacent = subtypeKey === 'adjacent_insight'

  // cultivate-pass cards have no headline — the body IS the punchline.
  // Render it directly with **bold** support. Other surfaced subtypes
  // (cluster_ready / new_evidence / auto_link) keep the headline +
  // body_html pattern.
  const refs = (() => {
    try { return r.refs ? JSON.parse(r.refs) : {} } catch { return {} }
  })()
  const href = r.target_url
    ?? (isAdjacent && refs.cluster_id ? `/cluster/${refs.cluster_id}` : '#')

  return (
    <Link href={href} className="card" style={{
      padding: '18px 22px', display: 'block',
      borderLeft: '3px solid var(--accent, #60a5fa)',
      background: 'var(--bg-1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <span className="mono" style={{
          fontSize: 10, color: 'var(--accent, #60a5fa)',
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          ◆ {isAdjacent ? 'Adjacent insight' : `Surfaced · ${subtype}`}
        </span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.surfaced_at)}
        </span>
      </div>
      {isAdjacent ? (
        <div style={{
          fontSize: 15, color: 'var(--fg-1)',
          lineHeight: 1.6,
        }} dangerouslySetInnerHTML={{ __html: renderInlineBold(String(r.body ?? '').slice(0, 600)) }}/>
      ) : (
        <>
          <div style={{
            fontSize: 16, color: 'var(--fg)', fontWeight: 500,
            marginBottom: r.body_html ? 10 : 0, lineHeight: 1.4,
          }}>
            {r.headline ?? r.title ?? '—'}
          </div>
          {r.body_html && (
            <div style={{ fontSize: 14, color: 'var(--fg-1)', lineHeight: 1.55 }}
              dangerouslySetInnerHTML={{ __html: String(r.body_html).slice(0, 600) }}/>
          )}
        </>
      )}
    </Link>
  )
}

function renderInlineBold(s: string): string {
  const escaped = s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<strong style="color: var(--fg); font-weight: 500;">$1</strong>')
}

function CreativeCard({ r }: { r: any }) {
  const elementType = String(r.element_type ?? 'theme').replace(/_/g, ' ')
  const href = r.vlog_id ? `/timeline/${r.vlog_id}` : '#'
  const color = topicColor(elementType)
  return (
    <Link href={href} className="card" style={{
      padding: '16px 20px', display: 'block',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span className="mono" style={{
          fontSize: 10, color: color,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          Creative · {elementType}
        </span>
        {r.register && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>{r.register}</span>
        )}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.created_at ?? r.extracted_at)}
        </span>
      </div>
      <div style={{
        fontSize: 15, color: 'var(--fg-1)',
        lineHeight: 1.55, fontStyle: 'italic',
      }}>
        “{String(r.content ?? '').slice(0, 320)}”
      </div>
    </Link>
  )
}

const ENTITY_DOT: Record<string, string> = {
  person:    'var(--t-rose)',
  place:     'var(--t-sage)',
  project:   'var(--t-brass)',
  tool:      'var(--t-steel)',
  concept:   'var(--t-plum)',
  theme:     'var(--t-violet)',
  reference: 'var(--t-teal)',
}

function EntityCard({ r }: { r: any }) {
  const entityType = String(r.entity_type ?? 'concept')
  const dot = ENTITY_DOT[entityType] ?? 'var(--fg-3)'
  const href = r.vlog_id ? `/timeline/${r.vlog_id}` : '#'
  return (
    <Link href={href} className="card" style={{
      padding: '14px 20px', display: 'block',
      borderLeft: `3px solid ${dot}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="mono" style={{
          fontSize: 10, color: dot,
          textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600,
        }}>
          Entity · {entityType}
        </span>
        <span style={{ fontSize: 14, color: 'var(--fg)', fontWeight: 500, marginLeft: 4 }}>
          {r.name ?? '—'}
        </span>
        {r.mention_count != null && Number(r.mention_count) > 1 && (
          <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)' }}>
            ×{r.mention_count}
          </span>
        )}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.last_mentioned_at ?? r.created_at)}
        </span>
      </div>
    </Link>
  )
}

function PipelineEventCard({ r }: { r: any }) {
  const step = String(r.step ?? 'step')
  const status = String(r.status ?? 'ok')
  const cls = status === 'failed' ? 'err' : status === 'skipped' ? 'mute' : 'ok'
  const d = r.detail ?? {}
  const counts = [
    d.threads != null ? `${d.threads}t` : null,
    d.clips != null ? `${d.clips}c` : null,
    d.creative_elements != null ? `${d.creative_elements}cr` : null,
    d.entities != null ? `${d.entities}e` : null,
  ].filter(Boolean).join(' · ')
  const dur = r.duration_ms ? `${(r.duration_ms / 1000).toFixed(1)}s` : null
  const href = r.vlog_id ? `/timeline/${r.vlog_id}` : '#'
  return (
    <Link href={href} className="card" style={{ padding: '10px 14px', display: 'block', opacity: 0.85 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--fg-2)' }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Pipeline
        </span>
        <span className={`pill ${cls}`}>{step} · {status}</span>
        {counts && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{counts}</span>}
        {d.model && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-3)' }}>{d.model}</span>}
        {dur && <span className="mono" style={{ fontSize: 11, color: 'var(--fg-4)' }}>{dur}</span>}
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>
          {timeOfDay(r.ts ?? r.created_at)}
        </span>
      </div>
    </Link>
  )
}

function DefaultCard({ r, kind }: { r: any; kind: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase' }}>{kind}</span>
        <span className="mono" style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--fg-4)' }}>{timeOfDay(r.ts)}</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-1)' }}>{r.title ?? r.headline ?? r.body ?? JSON.stringify(r).slice(0, 200)}</div>
    </div>
  )
}

function toMs(v: unknown): number {
  if (!v) return Date.now()
  if (typeof v === 'number') return v < 1e12 ? v * 1000 : v
  if (typeof v === 'string') return new Date(v).getTime()
  return Date.now()
}

function timeOfDay(v: unknown): string {
  if (!v) return ''
  const d = new Date(toMs(v))
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function dayLabel(ts: number): string {
  // Compare LOCAL calendar dates, not millisecond differences. A vlog
  // recorded at 11pm yesterday is ~11 hours ago; the old code would
  // floor that to 0 and label it "Today · May 20" when it's actually
  // already May 21. Operator caught: "it shows today as may 20? it's
  // may 21."
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86_400_000)
  if (dayDiff === 0) return 'Today · ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  if (dayDiff === 1) return 'Yesterday · ' + d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function formatTime(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
