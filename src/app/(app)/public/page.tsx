'use client'

/**
 * The public log — what a stranger sees.
 *
 * SPEC §0.1, settled 6 Sep: **there is one log.** Public is a flag on an
 * entry, not a section of the site. This page is the same feed as `/`,
 * filtered to the entries marked public — generated from it, never authored
 * separately.
 *
 * The reason that rule exists, in the package's own words: it was built the
 * other way until 6 September, as two hand-authored feeds, and "nine public
 * entries were absent from the private log." A record cannot be missing what
 * it published. So this page holds no content of its own. It calls
 * `/api/v2/log?filter=pub` and renders it plainer.
 *
 * ── Why this is a preview and not a public URL ───────────────────────────
 *
 * Nothing here is reachable without signing in, and that is deliberate.
 *
 * Under SPEC §0.2 everything the operator writes is public by default — the
 * feed marks only the exceptions. That is the right default for a record he
 * is building deliberately. It is the wrong thing to point at the open web
 * without him having looked, because relog puts hundreds of lines from three
 * hundred existing recordings onto the log in one click, and none of them
 * were written with a reader in mind.
 *
 * Making this genuinely public is one deliberate act — a Cloudflare Access
 * bypass app for this path, added to the bootstrap workflow the way
 * `/podcast.xml` and `/p/*` already are. That act is the operator's, not
 * mine, and this page says so at the top rather than quietly implying it is
 * already live.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import {
  type LogEntry, type FeedFilter,
  stampFor, isFuzzy, tagsFor, dayKeyFor, dayHeadingFor,
} from '@/lib/log-entry'

const FILTERS: { k: FeedFilter; label: string }[] = [
  { k: 'pub',  label: 'everything' },
  { k: 'said', label: 'what I said' },
  { k: 'did',  label: 'what I did' },
  { k: 'auto', label: 'arrived on its own' },
  { k: 'mem',  label: 'from memory' },
]

export default function PublicLog() {
  const [items, setItems] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FeedFilter>('pub')
  const [order, setOrder] = useState<'happened' | 'logged'>('happened')

  const load = useCallback(async () => {
    try {
      const params = new URLSearchParams({ order, filter, limit: '200' })
      const res = await fetch(`/api/v2/log?${params}`, { cache: 'no-store' })
      if (!res.ok) { setItems([]); return }
      const data = await res.json() as { items: LogEntry[] }
      // Belt and braces: whatever the filter did, nothing private or held
      // back renders on the page that exists to show what a stranger sees.
      setItems((data.items || []).filter(e => e.visibility === 'public'))
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [order, filter])
  useEffect(() => { void load() }, [load])

  // Same grouping as the private feed, so the two cannot disagree about
  // which day something happened on.
  const groups: { key: string; title: string; rows: LogEntry[] }[] = []
  const byKey = new Map<string, { key: string; title: string; rows: LogEntry[] }>()
  const now = new Date()
  for (const e of items) {
    const date = order === 'logged' ? e.logged_at : e.happened_at
    const key = dayKeyFor(date, order === 'logged' ? 'exact' : e.date_precision)
    let g = byKey.get(key)
    if (!g) {
      g = { key, title: dayHeadingFor(key, now).title, rows: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.rows.push(e)
  }

  return (
    <Shell>
      <div className="logpage publog pg-public-log">
        <div className="who">
          <div className="k">what a stranger sees</div>
          <h1>The public log — everything except what I&rsquo;ve kept private.</h1>
          <div className="upd">
            {loading ? '' : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
            {' · '}
            <Link href="/">your log →</Link>
          </div>

          <div className="notlive">
            <b>Nobody can see this yet.</b> This page needs signing in, like
            every other page. Everything you write is public by default and
            the log marks only the exceptions, so this is what would go out —
            but it is not out. Putting it on the open web is one deliberate
            change to the Cloudflare Access rules, and it is yours to make
            once you have read what is on this page.
          </div>
        </div>

        <div className="bar">
          <div className="f">
            {FILTERS.map(f => (
              <button
                key={f.k}
                className={filter === f.k ? 'on' : ''}
                onClick={() => setFilter(f.k)}
              >{f.label}</button>
            ))}
          </div>
          <div className="r">
            <span>order:</span>
            <button className={order === 'happened' ? 'on' : ''} onClick={() => setOrder('happened')}>
              when it happened
            </button>
            <button className={order === 'logged' ? 'on' : ''} onClick={() => setOrder('logged')}>
              when I logged it
            </button>
          </div>
        </div>

        {groups.map(g => (
          <div key={g.key}>
            <div className="pubday">{g.title}</div>
            {g.rows.map(e => {
              const date = order === 'logged' ? e.logged_at : e.happened_at
              const image = e.media.find(m => m.kind === 'image')
              return (
                <article className="e" key={`${e.source}-${e.id}`}>
                  <div className="x">
                    <span className="s">{e.sentence}</span>
                    <span className="tags">
                      {/* A stranger needs one thing the operator does not:
                          whether this was written down at the time or
                          recalled later. */}
                      <i>{stampFor(date, e.date_precision)}</i>
                      {isFuzzy(e.date_precision) && <i>from memory</i>}
                      {e.author === 'log' && <i>written by the log</i>}
                    </span>
                  </div>
                  {e.detail && <p>{e.detail}</p>}
                  {image?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={image.url} alt="" loading="lazy" />
                  )}
                </article>
              )
            })}
          </div>
        ))}

        {!loading && items.length === 0 && (
          <div className="none">Nothing is public yet.</div>
        )}

        <footer className="ft">
          <span>neolog · the public log</span>
          <span className="r">
            <Link href="/">the log</Link>
            <Link href="/facts">the facts</Link>
            <Link href="/pages">the index</Link>
            <Link href="/export">export</Link>
            <Link href="/everything">everything</Link>
          </span>
        </footer>
      </div>
    </Shell>
  )
}
