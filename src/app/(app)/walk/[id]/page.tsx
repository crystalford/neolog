'use client'

/**
 * The walk — one thought as the route it took.
 *
 * `walk.html`: "A thought isn't a point... The route is the thing worth
 * keeping, not just where it ended up."
 *
 * ── Why `/walk/[id]` ─────────────────────────────────────────────────────
 *
 * The design's own page is called `walk.html`. It was also, until the
 * extraction engine was removed on 8 Sep, the only name available: `/thread`
 * served the `threads` table, a different thing with the same word. That
 * table is gone and the name is free, and the page keeps the design's word
 * rather than taking it — a route that moves costs more than one that reads
 * slightly oddly.
 *
 * The id in the path is an ENTRY's, not a thread's, because there is no
 * thread row — a thread is `led_from` followed either way. Any turn opens
 * the same walk.
 *
 * ── What is deliberately absent ──────────────────────────────────────────
 *
 * The design's page carries an "offer" at the bottom — "here's the route
 * you've walked, and here's the turn you haven't taken." That is below the
 * drafting fence and stays there. The page shows the route; the reading of
 * it is his.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import Shell from '@/components/Shell'
import { REFLECTS } from '@/lib/log-entry'

interface Turn {
  id: string; text: string; detail: string | null
  happened_at: string; logged_at: string
  kind: string; author: string; visibility: string
  led_from: string | null; relation: string
  offset_seconds: number; loop: boolean; returned: boolean
  made: { id: string; name: string; kind: string }[]
  revised_at: string | null
  href: string
}
interface Walk { start: Turn | null; turns: Turn[]; open: boolean }

/** "+0:12 into the note" — the design's own unit for a turn inside one take. */
function offsetLabel(sec: number): string {
  if (sec <= 0) return 'where it started'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `+${h}:${String(m).padStart(2, '0')}`
  const s = sec % 60
  return `+${m}:${String(s).padStart(2, '0')}`
}

/** A return says how long, in words, because the number stops meaning much. */
function gapLabel(sec: number): string {
  const h = Math.round(sec / 3600)
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} later`
  const d = Math.round(h / 24)
  if (d < 30) return `${d} ${d === 1 ? 'day' : 'days'} later`
  const mo = Math.round(d / 30)
  return mo < 12 ? `${mo} ${mo === 1 ? 'month' : 'months'} later` : `${Math.round(mo / 12)} years later`
}

const clock = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
const day = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function WalkPage() {
  const params = useParams<{ id: string }>()
  const [w, setW] = useState<Walk | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/log/walk/${params.id}`, { cache: 'no-store' })
      if (res.ok) setW(await res.json() as Walk)
    } catch { setW(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const start = w?.start
  const turns = w?.turns ?? []
  // The turn a `led_from` points at, so a loop can say what it looped to.
  const byId = new Map(turns.map(t => [t.id, t]))

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          {start && <Link href={start.href}>the first turn</Link>}
        </div>

        {loading && <div className="none">Following it back.</div>}

        {!loading && !start && (
          <div className="none">
            Nothing leads to or from that entry, so there is no route to
            show. A walk appears once one entry comes from another.
          </div>
        )}

        {start && (
          <>
            <div className="pghead">
              <h1>{start.text}</h1>
            </div>
            <div className="stamp">
              <span>started</span>
              <time dateTime={start.happened_at}>{day(start.happened_at)} · {clock(start.happened_at)}</time>
              <span>{turns.length - 1} {turns.length - 1 === 1 ? 'turn' : 'turns'} since</span>
              {turns.some(t => t.loop) && <span>{turns.filter(t => t.loop).length} loop back</span>}
            </div>

            <div className="walk">
              {turns.map((t, i) => {
                const from = t.led_from ? byId.get(t.led_from) : null
                const prev = i > 0 ? turns[i - 1] : null
                const gap = prev
                  ? (new Date(t.happened_at).getTime() - new Date(prev.happened_at).getTime()) / 1000
                  : 0
                return (
                  <div className={`leg${t.loop ? ' loop' : ''}${t.relation === REFLECTS ? ' refl' : ''}`} key={t.id}>
                    <div className="when">
                      <time dateTime={t.happened_at}>
                        {t.returned ? gapLabel(gap) : offsetLabel(t.offset_seconds)}
                      </time>
                      <em>{clock(t.happened_at)}</em>
                    </div>
                    <div className="what">
                      <div className="x"><Link href={t.href}>{t.text}</Link></div>
                      {t.detail && <div className="p">{t.detail}</div>}
                      <div className="m">
                        {from ? (
                          <span>
                            {t.loop ? 'looped back to' : 'led from'}{' '}
                            <Link href={from.href}>{shorten(from.text)}</Link>
                          </span>
                        ) : (
                          <span>where it started</span>
                        )}
                        {t.relation === REFLECTS && <span>a later thought, not a new event</span>}
                        {t.author !== 'operator' && <span>written by the log</span>}
                        {t.revised_at && <span>revised {day(t.revised_at)}</span>}
                      </div>
                      {t.made.length > 0 && (
                        <div className="made">
                          {t.made.map(p => (
                            <Link key={p.id} href={`/page/${p.id}`}>{p.kind} · {p.name}</Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* The design's last row: the thread stays open. Not a prompt
                  to do anything — a statement that nothing is closed. */}
              <div className="leg open">
                <div className="when"><time>not yet</time></div>
                <div className="what">
                  <div className="p">
                    Anything that leads from any turn above attaches here,
                    dated, with the turn it came from. The route stays open.
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}

function shorten(s: string): string {
  const t = s.trim()
  return t.length <= 52 ? t : `${t.slice(0, 50).trimEnd()}…`
}
