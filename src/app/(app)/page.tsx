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
import Link from 'next/link'
import Shell, { NavIcons, Pips, TopicDot } from '@/components/Shell'

type Filter = 'all' | 'vlog' | 'thread' | 'clip' | 'post' | 'surfaced'

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
  { key: 'clip',     label: 'Clips' },
  { key: 'post',     label: 'Posts' },
  { key: 'surfaced', label: 'Surfaced' },
]

export default function TimelinePage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')

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
    const c: Record<Filter, number> = { all: 0, vlog: 0, thread: 0, clip: 0, post: 0, surfaced: 0 }
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
      {/* Editorial reading column — slightly wider than the default
          760 to give cards more presence; topic spines lean inward.
          Generous vertical rhythm (32px between days, 14px between
          cards) so the page feels like a journal, not a dashboard. */}
      <div className="pad-tight" style={{ maxWidth: 820, marginLeft: 'auto', marginRight: 'auto' }}>
        <div className="h1-row" style={{ alignItems: 'flex-start' }}>
          <div style={{
            borderLeft: '3px solid var(--t-1)',
            paddingLeft: 14,
          }}>
            <div className="mono" style={{
              fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'var(--fg-4)', marginBottom: 6,
            }}>
              The feed
            </div>
            <h1 style={{ marginTop: 0, marginBottom: 8 }}>Timeline</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 0, maxWidth: 540 }}>
              Everything in order. Vlogs, threads, clips, posts, surfaced cards — newest first.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 28, marginBottom: 30 }}>
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
            <p>Drop a vlog on Capture to seed it. New threads, clips, and surfaced cards land here as they're created.</p>
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
    </Shell>
  )
}

function FeedCard({ item }: { item: FeedItem }) {
  switch (item.kind) {
    case 'vlog':     return <VlogCard r={item.raw}/>
    case 'thread':   return <ThreadCard r={item.raw}/>
    case 'clip':     return <ClipCard r={item.raw}/>
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
  const cls = status === 'complete' ? 'ok' : status === 'failed' ? 'err' : status === 'archived' ? 'mute' : 'hot'
  const size = r.file_size_bytes ? `${(r.file_size_bytes / 1_000_000).toFixed(1)} MB` : ''
  const color = topicColor(r.title ?? r.original_filename ?? r.id)
  return (
    <Link href={`/timeline/${r.id}`} className="card" style={{
      padding: '14px 18px', display: 'block',
      borderLeft: `3px solid ${color}`,
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
              Vlog
            </span>
            <span className={`pill ${cls}`}>{status}</span>
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
  const d = new Date(ts)
  const now = new Date()
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
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
