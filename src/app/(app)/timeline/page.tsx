/**
 * Timeline — the landing surface. Heterogeneous chronological feed: Vlogs,
 * Threads, Posts, Clips, Articles, Surfaced cards, Project updates. One
 * stream, by date. Pill row filters the type.
 *
 * Reads from /api/v2/timeline which fans across vlogs, threads, clip_candidates,
 * posts, surfaced_cards, etc. and returns a sorted union.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'
import { TimelineCard, type TimelineCardData } from '@/components/cards'

type Filter = 'all' | 'vlog' | 'thread' | 'post' | 'clip' | 'article' | 'broll' | 'attachment' | 'surfaced'

interface Counts {
  all: number
  vlog: number
  thread: number
  post: number
  clip: number
  article: number
  broll: number
  attachment: number
  surfaced: number
}

const FILTER_LABELS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'vlog', label: 'Vlogs' },
  { key: 'thread', label: 'Threads' },
  { key: 'post', label: 'Posts' },
  { key: 'clip', label: 'Clips' },
  { key: 'article', label: 'Articles' },
  { key: 'broll', label: 'B-roll' },
  { key: 'attachment', label: 'Attachments' },
  { key: 'surfaced', label: 'Surfaced' },
]

interface DayGroup {
  label: string
  date: string
  cards: TimelineCardData[]
}

function dayBucketKey(iso: string): string {
  return iso.slice(0, 10) // YYYY-MM-DD
}

function dayLabel(iso: string): { label: string; date: string } {
  const d = new Date(iso + 'T00:00:00')
  const now = new Date()
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (iso === now.toISOString().slice(0, 10)) return { label: 'Today', date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  if (iso === yesterday.toISOString().slice(0, 10)) return { label: 'Yesterday', date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }
  return {
    label: d.toLocaleDateString('en-US', { weekday: 'short' }),
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }
}

export default function TimelinePage() {
  const [cards, setCards] = useState<TimelineCardData[]>([])
  const [counts, setCounts] = useState<Counts>({ all: 0, vlog: 0, thread: 0, post: 0, clip: 0, article: 0, broll: 0, attachment: 0, surfaced: 0 })
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    setError(null)
    fetch('/api/v2/timeline', { credentials: 'include' })
      .then(async (r: any) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then((data: { cards: TimelineCardData[]; counts: Counts }) => {
        if (!alive) return
        setCards(data.cards || [])
        setCounts(data.counts || { all: 0, vlog: 0, thread: 0, post: 0, clip: 0, article: 0, broll: 0, attachment: 0, surfaced: 0 })
        setLoading(false)
      })
      .catch(err => {
        if (!alive) return
        setError(String(err.message || err))
        setLoading(false)
      })
    return () => { alive = false }
  }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return cards
    return cards.filter(c => c.type === filter)
  }, [cards, filter])

  const days: DayGroup[] = useMemo(() => {
    const buckets = new Map<string, TimelineCardData[]>()
    const UNKNOWN_KEY = '__unknown_date__'
    for (const c of filtered) {
      // Vlogs whose recorded_at_source is upload_time_default / null have no
      // real recording date — bucket them separately so they don't pollute
      // "yesterday" or wherever their upload time happens to be.
      const isVlog = c.type === 'vlog'
      const src = isVlog ? (c as any).recorded_at_source : null
      const realSrc = src === 'pre_extracted' || src === 'mvhd' || src === 'filename'
      if (isVlog && !realSrc) {
        const arr = buckets.get(UNKNOWN_KEY) || []
        arr.push(c)
        buckets.set(UNKNOWN_KEY, arr)
        continue
      }
      const t: string = ('recorded_at' in c && c.recorded_at) ||
                        ('posted_at' in c && c.posted_at) ||
                        ('created_at' in c && c.created_at) ||
                        new Date().toISOString()
      const key = dayBucketKey(t)
      const arr = buckets.get(key) || []
      arr.push(c)
      buckets.set(key, arr)
    }
    // Sort: real dates DESC, then the unknown bucket pinned to the bottom.
    const realDays = Array.from(buckets.entries())
      .filter(([k]) => k !== UNKNOWN_KEY)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, cards]) => {
        const { label, date } = dayLabel(key)
        return { label, date, cards }
      })
    const unknown = buckets.get(UNKNOWN_KEY)
    if (unknown && unknown.length > 0) {
      realDays.push({ label: 'Date unknown', date: `${unknown.length} item${unknown.length === 1 ? '' : 's'}`, cards: unknown })
    }
    return realDays
  }, [filtered])

  return (
    <main>
      <section className="hero">
        <div className="crumb reveal d2">Everything, in order</div>
        <h1 className="reveal d3">Timeline</h1>
        <p className="lead reveal d4">Your captures, threads, posts, clips, drafts, and what the system surfaces. All on one stream, by date.</p>
      </section>

      <div className="filter-bar reveal d4">
        {FILTER_LABELS.map(f => (
          <button
            key={f.key}
            className={`fchip ${filter === f.key ? 'active' : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label} <span className="num">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading && (
        <div className="empty-row reveal d5">
          <p style={{ color: 'var(--bone-3)', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2 }}>LOADING…</p>
        </div>
      )}

      {error && error.includes('401') && (
        <div className="empty-row reveal d5">
          <h3>Sign in to see your timeline</h3>
          <p>Cloudflare Access protects this domain. Hit the button below to get a one-time PIN to your operator email.</p>
          <div style={{ marginTop: 16 }}>
            <a href="/signin" style={{
              padding: '10px 20px',
              borderRadius: 100,
              border: '1px solid var(--bone-3)',
              background: 'rgba(236,228,210,0.06)',
              color: 'var(--bone)',
              fontSize: 14,
              fontWeight: 500,
              display: 'inline-block',
            }}>Sign in →</a>
          </div>
        </div>
      )}

      {error && !error.includes('401') && (
        <div className="error-row reveal d5">Error: {error}</div>
      )}

      {!loading && !error && days.length === 0 && (
        <div className="empty-row reveal d5">
          <h3>Nothing here yet</h3>
          <p>Tap <strong style={{ color: 'var(--bone)' }}>Record</strong> or <strong style={{ color: 'var(--bone)' }}>Upload</strong> below to drop in your first vlog. The pipeline transcribes it, pulls threads, finds clips, and surfaces what's worth materializing.</p>
        </div>
      )}

      {days.map((day, di) => (
        <div key={`${day.label}-${day.date}-${di}`}>
          <div className="day-band reveal d5">
            <span className="day-name">{day.label}</span>
            <span className="day-date">{day.date}</span>
            <span className="day-count">{day.cards.length} item{day.cards.length === 1 ? '' : 's'}</span>
          </div>
          <div className="feed reveal d5">
            {day.cards.map(c => <TimelineCard key={`${c.type}-${c.id}`} card={c} />)}
          </div>
        </div>
      ))}
    </main>
  )
}
