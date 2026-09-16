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
import { Rail } from '@/components/Rail'
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
  /**
   * What this route made, in the order it made it: every page a turn on it
   * named, carrying the turn it came out of. `walk.html`'s `.own` section is
   * the same shape written about the log's own making — here it is written
   * about this route, off the rows already loaded. Nothing is generated:
   * a page is on this list because a turn named it.
   */
  const made = turns.flatMap(t => t.made.map(p => ({ ...p, turn: t })))

  return (
    <Shell>
      <div className="logpage pg-walk">
        <div className="back">
          <Link href="/">the log</Link>
          {start && <Link href={start.href}>the first turn</Link>}
        </div>

        <section className="top">
          <h1>The log kept the places your thought arrived.</h1>
          <p>
            It should also keep <b>the route it took to get there</b>. A
            thought isn&rsquo;t a point — this is the path, with the turn each
            one came out of, still growing.
          </p>
        </section>

        <div className="grid">
          <main>

        {loading && <div className="none">Following it back.</div>}

        {!loading && !start && (
          <div className="none">
            Nothing leads to or from that entry, so there is no route to
            show. A walk appears once one entry comes from another.
          </div>
        )}

        {start && (
          <>
            {/* ⚠️ `.route` is the design's BOX — it wraps the header and
                every step, and it is what draws the border round the whole
                walk. It was on the little label line inside `.hd` instead,
                so the route had no frame and a caption had one. */}
            <div className="route">
            <div className="hd">
              <div>
                <div className="k">
                  a thread · started {day(start.happened_at)} · {clock(start.happened_at)}
                </div>
                <h2>{start.text}</h2>
                <div className="m">
                  <span>started with: {start.kind}</span>
                  <span>
                    a start + {turns.length - 1}{' '}
                    {turns.length - 1 === 1 ? 'turn' : 'turns'}
                  </span>
                  {made.length > 0 && (
                    <span>made: {made.length} {made.length === 1 ? 'page' : 'pages'}</span>
                  )}
                  {turns.some(t => t.loop) && (
                    <span>{turns.filter(t => t.loop).length} loop back</span>
                  )}
                </div>
              </div>
              {/* The count, as a count. `walk.html` puts it in the corner
                  and says when the last turn was — both facts off the rows
                  already loaded. */}
              <div className="cnt">
                <b>{turns.length - 1}</b>
                {turns.length - 1 === 1 ? 'turn so far' : 'turns so far'}<br />
                {turns.length > 1 && <>last one {clock(turns[turns.length - 1].happened_at)}</>}
              </div>
            </div>


            <div className="walk">
              {turns.map((t, i) => {
                const from = t.led_from ? byId.get(t.led_from) : null
                const prev = i > 0 ? turns[i - 1] : null
                const gap = prev
                  ? (new Date(t.happened_at).getTime() - new Date(prev.happened_at).getTime()) / 1000
                  : 0
                return (
                  <div
                    /* `walk.html`'s `.turn` marks a step that came from
                       reading the log rather than from the moment — the
                       source line is one the log wrote. It tints the step
                       and nothing else; it is not the entry page's card of
                       the same name (see globals.css). */
                    /* ⚠️ One template literal, on purpose. Built with `+`
                       across three of them, `check-design.mjs` could not
                       read any of it — its regex wants the backtick right
                       after `className={` — so `.turn` reported as unbuilt
                       while rendering correctly. Formatting, not
                       contortion: the class string is the same. */
                    className={`step${t.loop ? ' loop' : ''}${t.relation === REFLECTS ? ' refl' : ''}${from && from.author !== 'operator' ? ' turn' : ''}`}
                    key={t.id}
                    /* `walk.html` colours each step's dot through a custom
                       property on the row. Steel for a loop — the one turn
                       that did not come from the turn before it in time. */
                    style={{
                      ['--c' as string]: t.loop
                        ? 'var(--t-steel)'
                        : from && from.author !== 'operator' ? 'var(--t-ochre)' : 'var(--fg-3)',
                    }}
                  >
                    <div className="t">
                      <time dateTime={t.happened_at}>
                        {t.returned ? gapLabel(gap) : offsetLabel(t.offset_seconds)}
                      </time>
                      <i>{clock(t.happened_at)}</i>
                    </div>
                    {/* The gutter, and the dot on the line. A reflection is
                        hollow because it is not a new event (SPEC §1). */}
                    <div className="rail">
                      <span className={`dot${t.relation === REFLECTS ? '' : ' f'}`} />
                    </div>
                    <div className="c">
                      <div className="x"><Link href={t.href}>{t.text}</Link></div>
                      {t.detail && <div className="p">{t.detail}</div>}
                      <div className="m">
                        {from ? (
                          <span className="led">
                            {t.loop ? 'looped back to' : 'led from'}{' '}
                            <Link href={from.href}>{shorten(from.text)}</Link>
                          </span>
                        ) : (
                          <span className="led">where it started</span>
                        )}
                        {t.relation === REFLECTS && <span>a later thought, not a new event</span>}
                        {t.author !== 'operator' && <span>written by the log</span>}
                        {t.revised_at && <span>revised {day(t.revised_at)}</span>}
                      </div>
                      {t.made.length > 0 && (
                        <div className="made">
                          {t.made.map(p => (
                            /* `.s` takes the step's own colour, so the
                               thing a turn made reads as belonging to that
                               turn rather than to the row. */
                            <Link className="s" key={p.id} href={`/page/${p.id}`}>
                              {p.kind} · {p.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* The design's last row: the thread stays open. Not a prompt
                  to do anything — a statement that nothing is closed. */}
              <div className="step open" style={{ ['--c' as string]: 'var(--line-2)' }}>
                <div className="t"><time>not yet</time></div>
                <div className="rail"><span className="dot" /></div>
                <div className="c">
                  <div className="p">
                    Anything that leads from any turn above attaches here,
                    dated, with the turn it came from. The route stays open.
                  </div>
                </div>
              </div>
            </div>
            </div>
          </>
        )}

            {/* `walk.html`'s two columns. Said after the route rather than
                before it, because the rows are the argument and this is what
                they add up to. */}
            <div className="two">
              <div>
                <div className="k">as a log</div>
                <h3>
                  A thread keeps two things an entry can&rsquo;t:{' '}
                  <b>the order things came in, and what each one led from.</b>
                </h3>
                <p>
                  A page is a pile — everything about one thing, newest
                  first. A thread is a path: this led to that. The log
                  already has the pieces; what it adds is the{' '}
                  <b>led-from</b>, one link per step.
                </p>
                <ul>
                  <li>
                    <b>Loops are kept.</b> A turn whose led-from is not the
                    turn before it in time is followed as a real edge, never
                    inferred from the order.
                  </li>
                  <li>
                    <b>Turns from outside the moment are kept.</b> A turn that
                    came from reading the log hours later is still on the
                    route. There is no session window.
                  </li>
                  <li>
                    <b>Wrong turns are kept.</b> Nothing here is pruned.
                  </li>
                </ul>
              </div>
              <div>
                <div className="k">as making</div>
                <h3>
                  There is no separate creative process.{' '}
                  <b>Making something is a thread you keep walking.</b>
                </h3>
                <p>
                  Each return is a turn: a revision, a new example, a
                  counter-case, a fork that becomes its own page. The log
                  keeps the growth in order.
                </p>
                <ul>
                  <li>
                    <b>Nothing is drafted for you.</b> The thread is yours;
                    the log keeps it in order and shows you the shape.
                  </li>
                  <li>
                    <b>The reading of it is yours too.</b> This page shows
                    the route and stops — which turn you have not taken is
                    the log having an opinion about your work.
                  </li>
                </ul>
              </div>
            </div>
            {/* walk.html's closing comparison, and the reason the route is
                worth keeping at all. */}
            <div className="prov">
              <div className="k">the trace, at its deepest</div>
              <h3>
                Where a finished piece came from isn&rsquo;t a list of
                sources. <b>It&rsquo;s the whole route.</b>
              </h3>
              {/* ⚠️ The right-hand column was `.own`, which on this page is
                  a whole steel-bordered SECTION — so one comparison column
                  rendered inside a gradient box. It is a plain column, and
                  `.own` is the section below, where the design puts it. */}
              <div className="cmp">
                <div className="old">
                  <div className="l">What every other publication offers</div>
                  <ol><li>Source</li><li>Source</li><li>Source</li><li>Source</li></ol>
                </div>
                <div>
                  <div className="l">What a piece from this log would carry</div>
                  <ol>
                    {turns.slice(0, 7).map(t => {
                      const from = t.led_from ? byId.get(t.led_from) : null
                      return (
                        <li key={t.id}>
                          <b>{shorten(t.text)}</b>
                          <em>
                            {from
                              ? `${t.loop ? 'a loop — led from' : 'led from'} ${shorten(from.text)}`
                              : 'where it started'}
                          </em>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </div>
              <p className="v">
                Every turn dated, including the wrong ones and the one that
                came from looking at the log itself.{' '}
                <b>Nobody can produce that but you</b> — not the piece, but
                how the piece came to exist.
              </p>
            </div>

            {/* What this route made. Same shape as `walk.html`'s `.own`, and
                every row is a page a turn on this route named — the date it
                was named, the name, and the turn it came out of. A page is
                made when he names it; nothing here decides anything. */}
            {made.length > 0 && (
              <section className="own">
                <div className="k">what this route made</div>
                <h3>
                  {made.length} {made.length === 1 ? 'page' : 'pages'} came out
                  of this thought. <b>Each one carries the turn it came from.</b>
                </h3>
                <div className="rows">
                  {made.map(m => {
                    const from = m.turn.led_from ? byId.get(m.turn.led_from) : null
                    return (
                      <div className="r" key={`${m.turn.id}-${m.id}`}>
                        <span className="d">{day(m.turn.happened_at)}</span>
                        <span className="w">
                          <Link href={`/page/${m.id}`}>{m.name}</Link>
                          <i>{m.kind}</i>
                        </span>
                        <span className="f">
                          {from
                            ? `${m.turn.loop ? 'looped back to' : 'led from'} ${shorten(from.text)}`
                            : 'where it started'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
          </main>

          <Rail goesTo={[
            { href: '/', label: 'the log' },
            { href: '/pages', label: 'the index' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}

function shorten(s: string): string {
  const t = s.trim()
  return t.length <= 52 ? t : `${t.slice(0, 50).trimEnd()}…`
}
