'use client'

/**
 * Timeline — the canon Landing per /tmp/neolognextlevel/design-reference/01-Landing.html
 *
 * Single surface serving:
 *   - Operator's FYP: hero (operator name + live snapshot) + 8-cell stats
 *     strip + 10-topic spectrum + day-banded feed + right rail.
 *   - Public landing (when unauthed via middleware): same chrome, filtered
 *     to `visibility='public'` rows + signin CTA.
 *
 * Data sources:
 *   /api/v2/timeline      — heterogeneous feed (vlogs/threads/posts/clips/
 *                            entities/creative/surfaced)
 *   /api/v2/graph/stats   — counts (threads/clusters/entities)
 *   /api/v2/clusters      — ripening clusters for rail
 *
 * Feed cards: vlog · thread · post · article · clip · surfaced (three
 * subtypes) · project-update. Topic colors hash from the topic string
 * onto the 10-territory palette.
 */

export const runtime = 'edge'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Shell from '@/components/Shell'

// ─── Topic hashing ───────────────────────────────────────────────────────
const TOPIC_TOKENS = [
  '--t-brass', '--t-terra', '--t-ochre', '--t-rose', '--t-plum',
  '--t-violet', '--t-steel', '--t-teal', '--t-sage', '--t-moss',
] as const
function topicVar(topic?: string | null): string {
  const t = (topic ?? '').trim().toLowerCase()
  if (!t) return '--fg-3'
  let h = 0
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0
  return TOPIC_TOKENS[h % TOPIC_TOKENS.length]
}
function topicSoft(topic?: string | null): string {
  // Compute a 7% soft variant of the topic var. Falls back to fg-5.
  return `color-mix(in srgb, var(${topicVar(topic)}) 7%, transparent)`
}

// ─── Types from /api/v2/timeline ─────────────────────────────────────────
interface ApiCard {
  id: string
  type: 'vlog' | 'thread' | 'clip' | 'post' | 'creative' | 'entity' | 'surfaced'
  // shared
  created_at?: string
  recorded_at?: string
  recorded_at_source?: string | null
  posted_at?: string
  extracted_at?: string
  // vlog
  title?: string
  thumbnail_url?: string | null
  duration_seconds?: number | null
  file_size_bytes?: number | null
  mime_type?: string | null
  thread_count?: number
  clip_count?: number
  transcript_word_count?: number
  pipeline_status?: string
  is_broll?: boolean
  // thread
  topic?: string
  abstracted_topic?: string
  take?: string
  key_quote?: string | null
  strength?: number
  source_vlog_title?: string
  source_timecode?: string
  // clip
  start_seconds?: number
  end_seconds?: number
  quote?: string
  status?: string
  // post
  platform?: string
  text?: string
  views?: number
  reposts?: number
  replies?: number
  // surfaced
  kind?: 'cluster_ready' | 'adjacent_insight' | 'gap_question' | 'auto_link'
  body?: string
  visibility?: 'private' | 'public'
}

interface ApiCluster {
  id: string
  topic: string
  abstracted_topic?: string | null
  ripeness_score?: number
  thread_count?: number
  state?: string
  topic_color?: string | null
}

type Filter = 'all' | 'vlog' | 'thread' | 'post' | 'surfaced'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',      label: 'All' },
  { key: 'vlog',     label: 'Vlogs' },
  { key: 'thread',   label: 'Threads' },
  { key: 'post',     label: 'Posts' },
  { key: 'surfaced', label: 'Surfaced' },
]

// ─── Page ────────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const router = useRouter()
  const sp = useSearchParams()
  const filter = (sp?.get('filter') as Filter | null) ?? 'all'

  const [cards, setCards] = useState<ApiCard[] | null>(null)
  const [stats, setStats] = useState<{ thread_count: number; cluster_count: number; entity_count: number } | null>(null)
  const [clusters, setClusters] = useState<ApiCluster[]>([])
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [publicMode, setPublicMode] = useState<boolean | null>(null)
  const [publicProductions, setPublicProductions] = useState<any[]>([])

  useEffect(() => {
    // First, try the authed Timeline. If it returns 401, we're an
    // unauthenticated visitor — flip into public mode (productions only).
    // If we ARE the authed operator, the bare domain is no longer home —
    // Subjects is. Bounce there. Unauthed visitors keep the public landing.
    fetch('/api/v2/timeline', { credentials: 'include' })
      .then(async r => {
        if (r.status === 401) {
          setPublicMode(true)
          // Fetch public productions instead.
          const pr = await fetch('/api/p')
          const pd: any = pr.ok ? await pr.json() : { productions: [] }
          setPublicProductions(pd.productions ?? [])
          setCards([])
          return null
        }
        // Authed → Subjects is the home surface now.
        router.replace('/subjects')
        return r.ok ? r.json() : { cards: [], counts: {} }
      })
      .then((d: any) => {
        if (d) { setCards(d.cards ?? []); setCounts(d.counts ?? {}); setPublicMode(false) }
      })
      .catch(() => setCards([]))
    // Stats + clusters are operator-only; silently skip when unauthed.
    fetch('/api/v2/graph/stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d) setStats(d) })
      .catch(() => {})
    fetch('/api/v2/clusters?limit=6', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => { if (d?.clusters) setClusters(d.clusters) })
      .catch(() => {})
  }, [])

  // Filter + group cards by day band.
  const filteredCards = useMemo(() => {
    if (!cards) return null
    if (filter === 'all') return cards
    return cards.filter(c => c.type === filter)
  }, [cards, filter])

  const byDay = useMemo(() => {
    if (!filteredCards) return null
    const map = new Map<string, ApiCard[]>()
    for (const c of filteredCards) {
      const ts = c.recorded_at || c.posted_at || c.created_at || c.extracted_at
      if (!ts) continue
      const d = new Date(ts)
      const dayKey = d.toISOString().slice(0, 10)
      if (!map.has(dayKey)) map.set(dayKey, [])
      map.get(dayKey)!.push(c)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredCards])

  // Hero "Top of mind" — the 3 strongest recent threads.
  const heroTopOfMind = useMemo(() => {
    if (!cards) return [] as ApiCard[]
    const recentThreads = cards.filter(c => c.type === 'thread').slice(0, 30)
    if (recentThreads.length === 0) return []
    return [...recentThreads].sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)).slice(0, 3)
  }, [cards])

  // Topic spectrum — count threads/clusters per topic (top 10).
  const spectrum = useMemo(() => {
    if (!cards) return []
    const tally = new Map<string, number>()
    for (const c of cards) {
      const t = c.topic || c.abstracted_topic
      if (!t) continue
      tally.set(t, (tally.get(t) ?? 0) + 1)
    }
    const all = Array.from(tally.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
    const max = all[0]?.[1] ?? 1
    return all.map(([name, count]) => ({ name, count, mag: count / max }))
  }, [cards])

  const setFilter = (f: Filter) => {
    const url = new URL(window.location.href)
    if (f === 'all') url.searchParams.delete('filter')
    else url.searchParams.set('filter', f)
    router.replace(url.pathname + url.search)
  }

  if (publicMode) {
    return <PublicTimeline productions={publicProductions}/>
  }

  return (
    <Shell>
      <CanonHero topOfMind={heroTopOfMind}/>
      <CanonStats stats={stats} counts={counts}/>
      {spectrum.length > 0 && <CanonSpectrum spectrum={spectrum}/>}
      <div className="canon-body">
        <div className="canon-feed-col">
          {byDay === null && <div style={{ color: 'var(--fg-3)', padding: 20 }}>Loading…</div>}
          {byDay !== null && byDay.length === 0 && (
            <CanonEmpty/>
          )}
          {byDay !== null && byDay.length > 0 && (
            <>
              <FilterRow current={filter} counts={counts} onChange={setFilter}/>
              <RipenestMacroBanner cluster={clusters[0]}/>
              {byDay.map(([dayKey, dayCards]) => (
                <DayBand key={dayKey} dayKey={dayKey} cards={dayCards}/>
              ))}
            </>
          )}
        </div>
        <aside className="canon-rail">
          <NowCard/>
          <RipeningRail clusters={clusters}/>
          <GraphMiniCard stats={stats}/>
          <CtaCard/>
        </aside>
      </div>
    </Shell>
  )
}

// ─── Hero ────────────────────────────────────────────────────────────────
function CanonHero({ topOfMind }: { topOfMind: ApiCard[] }) {
  const dateLine = useMemo(() => {
    const d = new Date()
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
    return d.toLocaleDateString('en-US', opts)
  }, [])

  return (
    <section className="canon-hero canon-reveal d1">
      <div>
        <div className="canon-hero-eyebrow">
          <span className="pip"/> Operator · neolog.ai · {dateLine}
        </div>
        <h1>
          Everything<span className="soft">,</span><br/>
          <span className="soft">in</span> order<span className="period">.</span>
        </h1>
        <p className="canon-hero-sub">
          A personal life graph and production engine. Raw, unedited voice in — threads, clusters,
          and finished work out. This is the live record.
        </p>
        <div className="canon-hero-cta">
          <Link href="/vlogs?capture=open" className="canon-btn primary">
            New capture
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
          </Link>
          <Link href="/studio" className="canon-btn ghost">
            <span className="ico"><svg viewBox="0 0 14 14"><circle cx="7" cy="7" r="3.5" fill="currentColor" stroke="none"/><circle cx="7" cy="7" r="6"/></svg></span>
            Open Studio
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 2.4,
          textTransform: 'uppercase', color: 'var(--fg-3)',
          display: 'inline-flex', alignItems: 'center', gap: 8,
          marginBottom: 4,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
          Top of mind
          <span style={{ color: 'var(--fg-5)' }}>·</span>
          <span style={{ color: 'var(--fg-4)' }}>strongest 3</span>
        </div>
        {topOfMind.length === 0 ? (
          <div style={{
            padding: '24px 22px',
            border: '1px dashed var(--line-2)',
            borderRadius: 12,
            background: 'var(--bg-1)',
            color: 'var(--fg-3)', fontSize: 13.5, lineHeight: 1.5,
          }}>
            Drop your first vlog. The system extracts the takes, finds the patterns, and surfaces
            the strongest threads here.
          </div>
        ) : (
          topOfMind.map((t, i) => <TopOfMindCard key={t.id} card={t} rank={i + 1}/>)
        )}
      </div>
    </section>
  )
}

function TopOfMindCard({ card, rank }: { card: ApiCard; rank: number }) {
  const topic = card.topic || card.abstracted_topic || ''
  const tcolor = `var(${topicVar(topic)})`
  const body = card.key_quote || card.take || ''
  return (
    <Link href={`/thread/${card.id}`} className="canon-hero-card" style={{
      display: 'block', textDecoration: 'none', color: 'inherit',
      borderLeft: `2px solid ${tcolor}`,
      padding: '14px 18px',
    }}>
      <div className="kicker" style={{ marginBottom: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            color: tcolor, fontWeight: 600,
          }}>{String(rank).padStart(2, '0')}</span>
          <span style={{ color: 'var(--fg-3)' }}>{topic ? topic : 'Thread'}</span>
        </span>
        <span className="strength" aria-label={`Strength ${card.strength ?? 0} of 5`} style={{ display: 'inline-flex', gap: 3 }}>
          {[1,2,3,4,5].map(i => (
            <span key={i} style={{
              width: 4, height: 4, borderRadius: '50%',
              background: i <= (card.strength ?? 0) ? tcolor : 'var(--bg-5)',
            }}/>
          ))}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontWeight: 400,
        fontSize: 15.5, lineHeight: 1.35, letterSpacing: '-0.25px',
        color: 'var(--fg)',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {body || 'no take extracted'}
      </div>
      {card.source_vlog_title && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 9.5,
          color: 'var(--fg-4)', letterSpacing: 0.4,
          marginTop: 8,
        }}>
          from {card.source_vlog_title}{card.source_timecode && ` · ${card.source_timecode}`}
        </div>
      )}
    </Link>
  )
}

// ─── Stats strip ─────────────────────────────────────────────────────────
function CanonStats({ stats, counts }: { stats: any; counts: Record<string, number> }) {
  const cells = [
    { n: counts.vlog ?? 0, l: 'Vlogs' },
    { n: stats?.thread_count ?? counts.thread ?? 0, l: 'Threads' },
    { n: stats?.cluster_count ?? 0, l: 'Clusters' },
    { n: 0, l: 'Macro', accent: true },
    { n: stats?.entity_count ?? 0, l: 'Entities' },
    { n: counts.post ?? 0, l: 'Posts' },
    { n: counts.clip ?? 0, l: 'Clips' },
    { n: counts.article ?? 0, l: 'Articles' },
  ]
  return (
    <section className="canon-stats canon-reveal d2">
      {cells.map((c, i) => (
        <div key={i} className="canon-stat">
          <span className={`n ${c.accent ? 'accent' : ''}`}>{c.n.toLocaleString()}</span>
          <span className="l">{c.l}</span>
        </div>
      ))}
    </section>
  )
}

// ─── Spectrum ────────────────────────────────────────────────────────────
function CanonSpectrum({ spectrum }: { spectrum: { name: string; count: number; mag: number }[] }) {
  return (
    <section className="canon-spectrum canon-reveal d2">
      <div className="canon-spectrum-label">Topic<br/>spectrum</div>
      <div className="canon-spectrum-bar">
        {spectrum.map(s => (
          <button
            key={s.name}
            className="canon-spectrum-chip"
            style={{ '--c': `var(${topicVar(s.name)})`, '--mag': s.mag } as any}
          >
            <span className="t">{s.name}</span>
            <span className="c">{s.count}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

// ─── Filter chip row ─────────────────────────────────────────────────────
function FilterRow({ current, counts, onChange }: { current: Filter; counts: Record<string, number>; onChange: (f: Filter) => void }) {
  return (
    <div className="canon-filter-row">
      {FILTERS.map(f => {
        const n = f.key === 'all'
          ? Object.entries(counts).filter(([k]) => k !== 'all').reduce((s, [, v]) => s + (v as number), 0)
          : (counts[f.key] ?? 0)
        return (
          <button
            key={f.key}
            className={`canon-filter-chip ${current === f.key ? 'active' : ''}`}
            onClick={() => onChange(f.key)}
          >
            {f.label}
            {n > 0 && <span className="n">{n}</span>}
          </button>
        )
      })}
    </div>
  )
}

// ─── Macro banner ────────────────────────────────────────────────────────
function RipenestMacroBanner({ cluster }: { cluster?: ApiCluster }) {
  if (!cluster || (cluster.ripeness_score ?? 0) < 70) return null
  const ripeness = Math.round(cluster.ripeness_score ?? 0)
  const radius = 44
  const circ = 2 * Math.PI * radius
  const fillDash = circ * (ripeness / 100)
  const offset = circ - fillDash
  const topic = cluster.abstracted_topic || cluster.topic
  return (
    <Link href={`/studio/${cluster.id}`} className="canon-macro-banner canon-reveal d3">
      <div className="ripeness">
        <svg viewBox="0 0 100 100">
          <circle className="track" cx="50" cy="50" r={radius}/>
          <circle className="fill" cx="50" cy="50" r={radius} strokeDasharray={circ} strokeDashoffset={offset}/>
        </svg>
        <div className="num">
          {ripeness}
          <span className="l">Ripe</span>
        </div>
      </div>
      <div className="mb-eyebrow">Cluster ready · {topic}</div>
      <h2>{topic}<span className="soft"> is ready.</span></h2>
      <p className="mb-sub">
        Threads have braided into a position. Open in Studio to see the breakdown, riff
        progression, and production candidates.
      </p>
      <div className="mb-row">
        <span className="stat"><span className="n">{cluster.thread_count ?? 0}</span> threads</span>
        <span className="stat"><span className="n">{ripeness}</span>/100 ripe</span>
        <span className="arrow">
          Open in Studio
          <svg viewBox="0 0 12 12"><path d="M3 6 L9 6 M6.5 3.5 L9 6 L6.5 8.5"/></svg>
        </span>
      </div>
    </Link>
  )
}

// ─── Day band ────────────────────────────────────────────────────────────
function DayBand({ dayKey, cards }: { dayKey: string; cards: ApiCard[] }) {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const d = new Date(dayKey + 'T12:00:00Z')
  const isToday = dayKey === today
  const isYesterday = dayKey === yesterday
  const name = isToday ? 'Today' : isYesterday ? 'Yesterday' : d.toLocaleDateString('en-US', { weekday: 'long' })
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <section className="canon-feed-section">
      <div className="canon-day">
        <span className={`name ${isToday ? 'today' : ''}`}>{name}</span>
        <span className="date">{date}</span>
        <span className="count"><strong>{cards.length}</strong> item{cards.length === 1 ? '' : 's'}</span>
      </div>
      <div className="canon-day-cards">
        {cards.map((c, i) => <Card key={c.id ?? i} card={c}/>)}
      </div>
    </section>
  )
}

// ─── Card dispatcher ─────────────────────────────────────────────────────
function Card({ card }: { card: ApiCard }) {
  switch (card.type) {
    case 'vlog':     return <VlogCard card={card}/>
    case 'thread':   return <ThreadCard card={card}/>
    case 'post':     return <PostCard card={card}/>
    case 'clip':     return <ClipCard card={card}/>
    case 'surfaced': return <SurfacedCard card={card}/>
    case 'creative': return <CreativeCard card={card}/>
    case 'entity':   return null  // entities surface inline in cluster/thread rails, not main feed
    default:         return null
  }
}

function timeOnly(iso?: string): string {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
function fmtDuration(sec?: number | null): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtSize(bytes?: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Vlog card
function VlogCard({ card }: { card: ApiCard }) {
  const topic = card.is_broll ? 'broll' : (card.topic || 'vlog')
  const style: any = {
    '--topic': `var(${topicVar(topic)})`,
    '--topic-soft': topicSoft(topic),
  }
  return (
    <Link href={`/vlog/${card.id}`} className="tcard vlog" style={style}>
      <div className="t-header">
        <span className="topic-pill">
          <span className="type">{card.is_broll ? 'B-roll' : 'Vlog'}</span>
        </span>
        {!card.is_broll && (card.thread_count || card.clip_count) ? (
          <span className="t-status">
            {card.thread_count ? <><strong>{card.thread_count}</strong> threads</> : null}
            {card.thread_count && card.clip_count ? ' · ' : ''}
            {card.clip_count ? <><strong>{card.clip_count}</strong> clips</> : null}
          </span>
        ) : card.is_broll ? (
          <span className="t-status">Silent footage</span>
        ) : null}
        <span className="t-time">{timeOnly(card.recorded_at || card.created_at)}</span>
      </div>
      <div className="vlog-row">
        <div className="vlog-thumb">
          {card.thumbnail_url && <img src={card.thumbnail_url} alt=""/>}
          {card.duration_seconds != null && <span className="dur">{fmtDuration(card.duration_seconds)}</span>}
        </div>
        <div className="vlog-info">
          <div className="title">{card.title || 'Untitled vlog'}</div>
          <div className="extracted">
            {card.transcript_word_count != null && <><span className="n">{card.transcript_word_count.toLocaleString()}</span> words · </>}
            {fmtSize(card.file_size_bytes)}{card.mime_type ? ` · ${card.mime_type.replace('video/', '').toUpperCase()}` : ''}
          </div>
          {(card.thread_count || card.clip_count) ? (
            <div className="extractions">
              {card.thread_count ? <span className="ex"><span className="n">{card.thread_count}</span> threads</span> : null}
              {card.clip_count ? <span className="ex hot"><span className="n">{card.clip_count}</span> clips</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  )
}

// Thread card
function ThreadCard({ card }: { card: ApiCard }) {
  const topic = card.topic || card.abstracted_topic || 'thread'
  const style: any = {
    '--topic': `var(${topicVar(topic)})`,
    '--topic-soft': topicSoft(topic),
  }
  return (
    <Link href={`/thread/${card.id}`} className="tcard thread" style={style}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Thread</span><span className="sep">·</span>{topic}</span>
        <span className="t-time">{timeOnly(card.recorded_at || card.created_at)}</span>
      </div>
      {card.take && <div className="t-headline">{card.take}</div>}
      {card.key_quote && (
        <div className="quote">{card.key_quote}</div>
      )}
      <div className="strength-row">
        <span className="strength-label">Strength</span>
        <span className="canon-pips">
          {[1,2,3,4,5].map(i => (
            <span key={i} className={`pip ${i <= (card.strength ?? 0) ? 'on' : ''}`}/>
          ))}
        </span>
        {card.source_vlog_title && (
          <span className="from">
            from <b>{card.source_vlog_title}</b>{card.source_timecode && ` · ${card.source_timecode}`}
          </span>
        )}
      </div>
    </Link>
  )
}

// Post card
function PostCard({ card }: { card: ApiCard }) {
  const style: any = {
    '--topic': 'var(--t-terra)',
    '--topic-soft': 'rgba(230,99,74,0.08)',
  }
  return (
    <div className="tcard post" style={style}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Post</span></span>
        <span className="t-status">Published to {card.platform || 'X'}</span>
        <span className="t-time">{timeOnly(card.posted_at)}</span>
      </div>
      <div className="post-text">{card.text || ''}</div>
      {(card.views != null || card.reposts != null || card.replies != null) && (
        <div className="engagement">
          {card.views != null && <span className="stat"><span className="n">{card.views.toLocaleString()}</span> <span className="label">views</span></span>}
          {card.reposts != null && <span className="stat"><span className="n">{card.reposts.toLocaleString()}</span> <span className="label">reposts</span></span>}
          {card.replies != null && <span className="stat"><span className="n">{card.replies.toLocaleString()}</span> <span className="label">replies</span></span>}
        </div>
      )}
    </div>
  )
}

// Clip card (folded into thread vocabulary per earlier operator note).
// Renders inline on Timeline as a feed item but doesn't link anywhere —
// clip_candidates IDs aren't thread IDs and the standalone /clip/[id]
// route was retired.
function ClipCard({ card }: { card: ApiCard }) {
  const style: any = {
    '--topic': 'var(--t-terra)',
    '--topic-soft': 'rgba(230,99,74,0.08)',
    cursor: 'default',
  }
  return (
    <div className="tcard thread" style={style}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Clip</span><span className="sep">·</span>{card.status === 'published' ? 'Published' : 'Candidate'}</span>
        <span className="t-time">{timeOnly(card.recorded_at || card.created_at)}</span>
      </div>
      {card.quote && <div className="quote">{card.quote}</div>}
      <div className="strength-row">
        <span className="strength-label">
          {card.start_seconds != null && card.end_seconds != null
            ? `${fmtDuration(card.start_seconds)} → ${fmtDuration(card.end_seconds)} · ${fmtDuration(card.end_seconds - card.start_seconds)}`
            : ''}
        </span>
      </div>
    </div>
  )
}

// Creative element card
function CreativeCard({ card }: { card: any }) {
  const style: any = {
    '--topic': 'var(--t-plum)',
    '--topic-soft': 'rgba(164,122,209,0.08)',
  }
  return (
    <div className="tcard" style={style}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">{card.element_type || 'Creative'}</span></span>
        <span className="t-time">{timeOnly(card.created_at)}</span>
      </div>
      <div style={{ fontSize: 14.5, lineHeight: 1.55, color: 'var(--fg-1)' }}>
        {card.content}
      </div>
    </div>
  )
}

// Surfaced card (dashed border, three subtypes)
function SurfacedCard({ card }: { card: ApiCard }) {
  const subtype = card.kind || 'adjacent_insight'
  const label = subtype === 'cluster_ready' ? 'Cluster ready'
    : subtype === 'gap_question' ? 'Gap question'
    : subtype === 'auto_link' ? 'Auto-linked'
    : 'Adjacent insight'
  const topicToken = subtype === 'cluster_ready' ? '--sig'
    : subtype === 'gap_question' ? '--t-ochre'
    : '--t-violet'
  const style: any = {
    '--topic': `var(${topicToken})`,
    '--topic-soft': 'rgba(126,123,227,0.07)',
  }
  return (
    <div className="tcard surfaced" style={style}>
      <div className="t-header">
        <span className="topic-pill"><span className="type">Surfaced</span></span>
        <span className="t-status">{label}</span>
        <span className="t-time">{timeOnly(card.created_at)}</span>
      </div>
      <div className="surfaced-body">
        <span className="surfaced-ico">
          <svg viewBox="0 0 16 16"><path d="M8 14 L8 2 M3 7 L8 2 L13 7"/></svg>
        </span>
        <div className="surfaced-text" dangerouslySetInnerHTML={{ __html: card.body ?? '' }}/>
      </div>
    </div>
  )
}

// ─── Empty state ─────────────────────────────────────────────────────────
function CanonEmpty() {
  return (
    <div style={{
      padding: '60px 32px',
      border: '1px dashed var(--line-2)',
      borderRadius: 14,
      background: 'var(--bg-1)',
      textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 2.5,
        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 18,
      }}>
        The feed
      </div>
      <h2 style={{
        fontFamily: 'var(--font-body)', fontSize: 36, fontWeight: 400,
        letterSpacing: '-1.2px', color: 'var(--fg)', margin: '0 0 14px',
      }}>
        Nothing here yet.
      </h2>
      <p style={{ color: 'var(--fg-2)', maxWidth: 480, margin: '0 auto 24px', lineHeight: 1.55 }}>
        Drop your first vlog. The system threads it, finds the patterns, and ships the work back.
      </p>
      <Link href="/capture" className="canon-btn primary">
        Capture
        <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
      </Link>
    </div>
  )
}

// ─── Right rail cards ────────────────────────────────────────────────────
function NowCard() {
  return (
    <div className="rail-card canon-reveal d4">
      <div className="rc-head">
        <h3>Now</h3>
        <span className="more">{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
      </div>
      <div className="live-now">
        <div className="ico">
          <svg viewBox="0 0 14 14">
            <rect x="5" y="2" width="4" height="7" rx="2"/>
            <path d="M3 7 Q3 11 7 11 Q11 11 11 7 M7 11 L7 13"/>
          </svg>
        </div>
        <div className="waveform">
          {[40, 65, 30, 80, 50, 70, 35, 90, 45, 60, 75, 55].map((h, i) => (
            <span key={i} style={{ height: `${h}%`, animationDelay: `${i * 0.08}s` }}/>
          ))}
        </div>
        <div className="label">
          <span className="l">Ready</span>
          <span className="v">⌘N</span>
        </div>
      </div>
    </div>
  )
}

function RipeningRail({ clusters }: { clusters: ApiCluster[] }) {
  if (clusters.length === 0) return null
  return (
    <div className="rail-card canon-reveal d4">
      <div className="rc-head">
        <h3>Ripening</h3>
        <Link href="/studio" className="more">all →</Link>
      </div>
      <div className="ripening-list">
        {clusters.slice(0, 5).map(c => {
          const r = Math.round(c.ripeness_score ?? 0)
          const hot = r >= 70
          const topic = c.abstracted_topic || c.topic
          return (
            <Link key={c.id} href={`/studio/${c.id}`} className="ripening" style={{ '--c': `var(${topicVar(topic)})` } as any}>
              <div className="row1">
                <span className="name">{topic}</span>
                <span className={`pct ${hot ? 'hot' : ''}`}>{r}</span>
              </div>
              <div className="track"><div className={`fill ${hot ? 'hot' : ''}`} style={{ width: `${r}%` }}/></div>
              <div className="threads">{c.thread_count ?? 0} threads</div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function GraphMiniCard({ stats }: { stats: any }) {
  return (
    <div className="rail-card canon-reveal d5">
      <div className="rc-head">
        <h3>The graph · today</h3>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16, fontFamily: 'var(--font-mono)',
      }}>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 22, color: 'var(--fg)', letterSpacing: '-0.5px' }}>
            {(stats?.thread_count ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--fg-3)', marginTop: 4 }}>Threads</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 22, color: 'var(--fg)', letterSpacing: '-0.5px' }}>
            {(stats?.cluster_count ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--fg-3)', marginTop: 4 }}>Clusters</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 22, color: 'var(--fg)', letterSpacing: '-0.5px' }}>
            {(stats?.entity_count ?? 0).toLocaleString()}
          </div>
          <div style={{ fontSize: 9.5, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--fg-3)', marginTop: 4 }}>Entities</div>
        </div>
      </div>
    </div>
  )
}

function CtaCard() {
  return (
    <div className="cta-card canon-reveal d5">
      <h4>Your <span className="soft">own</span> neolog.</h4>
      <p>One operator at a time. Bring your API keys. Talk into it. Watch the graph grow.</p>
      <Link href="/about" className="canon-btn accent">
        About the system
        <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
      </Link>
    </div>
  )
}

/**
 * Public-mode Timeline — what unauthed visitors see at `/`.
 * Minimal masthead (logo + Sign in), canon hero, list of public
 * productions. No operator-only data (stats, ripening, etc).
 */
function PublicTimeline({ productions }: { productions: any[] }) {
  return (
    <div className="canon-page">
      <div className="canon-wrap">
        {/* Minimal public masthead */}
        <header style={{
          padding: '22px 0 20px',
          display: 'grid', gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center', gap: 32,
          borderBottom: '1px solid var(--line)',
        }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'var(--fg)', textDecoration: 'none' }}>
            <span style={{ width: 26, height: 26 }}>
              <svg viewBox="0 0 32 32" width="26" height="26" fill="none">
                <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round"/>
                <circle cx="3" cy="16" r="2.4" fill="currentColor"/>
                <circle cx="29" cy="16" r="2.4" fill="currentColor"/>
              </svg>
            </span>
            <span style={{ fontFamily: 'var(--font-body)', fontWeight: 500, fontSize: 19, letterSpacing: '-0.5px' }}>neolog</span>
          </Link>
          <div/>
          <Link href="/signin" className="canon-btn primary">
            Sign in
            <span className="ico"><svg viewBox="0 0 14 14"><path d="M3 7 L11 7 M8 4 L11 7 L8 10"/></svg></span>
          </Link>
        </header>

        <main className="canon-main">
          {/* Hero */}
          <section className="canon-reveal d1" style={{ padding: '72px 0 48px', maxWidth: 860 }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 22,
              display: 'inline-flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ width: 28, height: 1, background: 'var(--line-3)' }}/>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 8px var(--sig-glow)' }}/>
              neolog · published work
            </div>
            <h1 style={{
              fontFamily: 'var(--font-body)', fontWeight: 300,
              fontSize: 92, lineHeight: 0.94, letterSpacing: '-3.8px',
              color: 'var(--fg)', margin: '0 0 28px', textWrap: 'balance',
            }}>
              Everything<span style={{ color: 'var(--fg-3)', fontWeight: 300 }}>,</span> in order<span style={{ color: 'var(--sig)' }}>.</span>
            </h1>
            <p style={{
              fontSize: 18, lineHeight: 1.55, color: 'var(--fg-1)',
              maxWidth: 660, letterSpacing: '-0.2px', marginBottom: 16,
            }}>
              A personal life graph and production engine. The operator talks into it —
              raw, unedited. It threads, clusters, and ships in their voice. What you see
              below is the public face of the work.
            </p>
            <p style={{ fontSize: 14.5, color: 'var(--fg-2)', lineHeight: 1.55, maxWidth: 660 }}>
              The full graph is private. Sign in if you're the operator.
            </p>
          </section>

          {/* Published work */}
          <section style={{ paddingBottom: 64 }}>
            <div className="canon-section-head">
              <h2>Published work</h2>
              <div className="meta">{productions.length} {productions.length === 1 ? 'piece' : 'pieces'}</div>
            </div>

            {productions.length === 0 ? (
              <div style={{
                padding: '48px 32px',
                border: '1px dashed var(--line-2)',
                borderRadius: 14, background: 'var(--bg-1)',
                color: 'var(--fg-3)', fontSize: 14.5, lineHeight: 1.55,
                textAlign: 'center', maxWidth: 640,
              }}>
                Nothing yet. Productions appear here once the operator publishes them —
                essays, articles, threads, clips.
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 14,
              }}>
                {productions.map((p: any) => (
                  <Link key={p.id} href={`/p/${p.id}`} className="tcard" style={{
                    '--topic': 'var(--sig)',
                    '--topic-soft': 'var(--sig-soft)',
                    display: 'flex', flexDirection: 'column', gap: 10,
                  } as any}>
                    <div className="t-header">
                      <span className="topic-pill"><span className="type">{labelForType(p.type)}</span>{p.form && <><span className="sep">·</span>{String(p.form).replace(/_/g, ' ')}</>}</span>
                      <span className="t-time">
                        {new Date(p.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-body)', fontSize: 19, fontWeight: 500,
                      letterSpacing: '-0.3px', lineHeight: 1.3, color: 'var(--fg)',
                    }}>
                      {p.title || '(untitled)'}
                    </div>
                    {p.attribution && (
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', letterSpacing: 0.4 }}>
                        by <b style={{ color: 'var(--fg-1)' }}>{p.attribution}</b>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>

          <footer style={{
            borderTop: '1px solid var(--line)',
            padding: '32px 0 56px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
            textTransform: 'uppercase', color: 'var(--fg-3)', fontWeight: 500,
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--sig)', boxShadow: '0 0 6px var(--sig-glow)' }}/>
              neolog
            </span>
            <Link href="/signin" style={{ color: 'inherit', textDecoration: 'none' }}>Sign in</Link>
          </footer>
        </main>
      </div>
    </div>
  )
}

function labelForType(t: string): string {
  return ({
    video_essay: 'Video essay',
    article: 'Article',
    x_post: 'Post',
    x_thread: 'Thread',
    clip: 'Clip',
    creative_work: 'Creative',
  } as Record<string, string>)[t] || t.replace(/_/g, ' ')
}
