'use client'

/**
 * A row on the log, and the day dividers around it.
 *
 * SPEC §11: "A page is the log filtered, not a report about a subject. A
 * person, a project, a place, a month is the same masthead, the same
 * two-column grid, the same day dividers and entry rows." So the feed and
 * every page render through this one component — if they diverge, a page
 * starts reading as a different site the moment you click into it, which is
 * the exact failure the rule exists to prevent.
 *
 * Two gestures, and only two:
 *   - the image  → a lightbox over the feed; you never leave
 *   - anywhere else → the entry's own page
 * There is no third expand-in-place gesture. A row whose entry has no page
 * of its own is not clickable — a destination is never invented to satisfy
 * an affordance.
 */

import type { ReactNode } from 'react'
import Link from 'next/link'
import { rememberPlace } from '@/components/LogLightbox'
import {
  type LogEntry, type DatePrecision,
  stampFor, isFuzzy, dayKeyFor, dayHeadingFor, tagsFor, clockDuration,
} from '@/lib/log-entry'
import { AudioNote } from '@/components/AudioNote'

/**
 * A search result shows its reason: the matched term is marked. Searching
 * text the reader cannot see is worse than no search.
 */
export function highlight(s: string, q: string): ReactNode {
  const term = q.trim()
  if (!term) return s
  const i = s.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return s
  return <>{s.slice(0, i)}<mark>{s.slice(i, i + term.length)}</mark>{s.slice(i + term.length)}</>
}

export function LogRow({ e, order, q, onImage }: {
  e: LogEntry
  order?: 'happened' | 'logged'
  q?: string
  onImage?: (url: string) => void
}) {
  const ord = order || 'happened'
  const term = q || ''
  const date = ord === 'logged' ? e.logged_at : e.happened_at
  const precision: DatePrecision = ord === 'logged' ? 'exact' : e.date_precision
  const fuzzy = ord === 'happened' && isFuzzy(e.date_precision)
  const tags = tagsFor(e)
  const image = e.media.find(m => m.kind === 'image')
  const video = e.media.find(m => m.kind === 'video')
  const audio = e.media.find(m => m.kind === 'audio')
  const held = e.visibility === 'held'

  const body = (
    <>
      <div className={`t${fuzzy ? ' fz' : ''}`}>{stampFor(date, precision)}</div>
      <div>
        <div className="x">
          <span className="s">{highlight(e.sentence, term)}</span>
          <span className="tags">
            {tags.map((t, i) => (
              <i key={i} className={t.tone === 'plain' ? undefined : t.tone}>{t.text}</i>
            ))}
            {(e.layers?.length || 0) > 0 && (
              <i className="lay">
                thought about {e.layers!.length === 1 ? 'again' : `${e.layers!.length} times since`}
              </i>
            )}
          </span>
        </div>

        {/* The row carries its context — the second line stays visible. */}
        {e.detail && !held && <div className="more">{highlight(e.detail, term)}</div>}

        {/* The log says what it saw, never an unnamed reason. */}
        {held && (
          <div className="more">
            <b>The log kept this back on its own.</b>{' '}
            {e.held_reason || 'It has not been looked at yet.'}{' '}
            Nothing about it is on the public log. You can publish it anyway,
            but you have to say so.
          </div>
        )}

        {/* Later thoughts about this entry. They sit under it because a
            reflection is not a second event — it is the same event, thought
            about again. */}
        {(e.layers || []).map(l => (
          <div className="lay-row" key={l.id}>
            <span>{stampFor(l.at, 'exact')}</span>
            {l.text}
          </div>
        ))}

        {/* A compressed run of photos: every tile at once, with the rest
            behind one "+N" tile. */}
        {e.source === 'photo' && e.media.length > 1 ? (
          <div className="pics">
            {e.media.filter(m => m.kind === 'image').map((m, i) => (
              m.url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img
                    className="tile" key={i} src={m.url} alt="" loading="lazy"
                    onClick={ev => {
                      if (!onImage || !m.url) return
                      ev.preventDefault(); ev.stopPropagation(); onImage(m.url)
                    }}
                  />
                : <span className="tile" key={i} />
            ))}
            {Number(e.searchable) > e.media.length && (
              <span className="tile more2">+{Number(e.searchable) - e.media.length}</span>
            )}
          </div>
        ) : (image || video || audio) && (
          <div className="pics">
            {image && (
              held
                ? <span className="still"><span className="lbl2">not shown</span></span>
                : image.url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img
                      src={image.url}
                      alt=""
                      loading="lazy"
                      onClick={ev => {
                        if (!onImage) return
                        ev.preventDefault(); ev.stopPropagation(); onImage(image.url!)
                      }}
                    />
                  : <span className="still"><span className="lbl2">no picture</span></span>
            )}
            {video && (
              <span className="vid">
                {video.poster_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={video.poster_url}
                    alt=""
                    loading="lazy"
                    style={{ width: '100%', height: '100%', border: 0, borderRadius: 0, cursor: 'inherit' }}
                  />
                )}
                <span className="play" />
                {video.duration_seconds
                  ? <span className="dur">{clockDuration(video.duration_seconds)}</span>
                  : null}
              </span>
            )}
            {/* `log.html`'s inline player, in `AudioNote` — a round play
                button, a track that fills and seeks, the duration in mono.
                No waveform bars: nothing measures amplitude, and drawing
                them would put a picture the log never took beside a
                duration it did. */}
            {audio && audio.url && (
              <AudioNote src={audio.url} duration={audio.duration_seconds} />
            )}
            {held
              ? <span className="cap">blurred here too, until you say otherwise</span>
              // What the file is called, beside it. The API has been sending
              // this since the feed was built and nothing read it.
              : (image?.label || video?.label || audio?.label)
                ? <span className="cap">{image?.label || video?.label || audio?.label}</span>
                : null}
          </div>
        )}
      </div>
    </>
  )

  // `data-open` is how the return finds this row again, and marking the
  // place on the way out is what makes leaving the feed safe.
  return e.href
    ? (
      <Link
        className={`en${held ? ' isheld' : ''}`}
        href={e.href}
        data-open={e.href}
        onClick={() => rememberPlace(e.href)}
      >{body}</Link>
    )
    : <div className={`en${held ? ' isheld' : ''}`}>{body}</div>
}

/**
 * Collapse consecutive uncaptioned photo rows into one. Returns a mixed
 * list: ordinary entries, plus synthetic group rows carrying the whole run.
 */
function compressPhotoRuns(rows: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = []
  let run: LogEntry[] = []

  const flush = () => {
    if (!run.length) return
    if (run.length < 3) { out.push(...run); run = []; return }
    // The group keeps the first row's identity so its date and href behave
    // like any other row; only the sentence and the media change.
    const first = run[0]
    out.push({
      ...first,
      sentence: `Added ${run.length} photos.`,
      detail: null,
      href: '',
      media: run.flatMap(r => r.media).filter(m => m.kind === 'image').slice(0, 8),
      // Carried so the row can say how many are not shown.
      searchable: String(run.length),
    })
    run = []
  }

  for (const e of rows) {
    const groupable = e.source === 'photo'
      && e.visibility !== 'held'
      && e.author === 'log'          // he captioned it -> it is his line
      && e.media.some(m => m.kind === 'image')
    if (groupable) run.push(e)
    else { flush(); out.push(e) }
  }
  flush()
  return out
}

/**
 * Group rows into days and render them. The dividers are generated from
 * whichever date you are ordering by, so the toolbar's two controls can
 * never disagree with the headings.
 */
export function LogDays({ items, order, q, onImage, buriedByDay }: {
  items: LogEntry[]
  order?: 'happened' | 'logged'
  q?: string
  onImage?: (url: string) => void
  /** date -> how many entries on it are buried. */
  buriedByDay?: Record<string, number>
}) {
  const ord = order || 'happened'
  const groups: { key: string; title: string; sub: string; rows: LogEntry[] }[] = []
  const byKey = new Map<string, { key: string; title: string; sub: string; rows: LogEntry[] }>()
  const now = new Date()
  for (const e of items) {
    const date = ord === 'logged' ? e.logged_at : e.happened_at
    const key = dayKeyFor(date, ord === 'logged' ? 'exact' : e.date_precision)
    // Keyed, not adjacent-only. A year-precision entry sorts into the middle
    // of a run of exact days it shares no key with, and an adjacency check
    // would print that day's heading a second time underneath it.
    let g = byKey.get(key)
    if (!g) {
      const h = dayHeadingFor(key, now)
      g = { key, title: h.title, sub: h.sub, rows: [] }
      byKey.set(key, g)
      groups.push(g)
    }
    g.rows.push(e)
  }

  // A burst of photos is one act, not fifty lines. Within a day, runs of
  // photo rows collapse into one row of tiles — "Added 9 photos." — with the
  // rest behind a "+N" tile. Anything the operator captioned stays its own
  // row, because a caption is a thing he said about that one picture.
  for (const g of groups) g.rows = compressPhotoRuns(g.rows)

  // A day whose only entry is buried had disappeared from the feed
  // altogether, which makes burial a delete with extra steps. The day keeps
  // one dim row (buried.html), and days that exist ONLY because something on
  // them is buried are put back in date order.
  const buried = buriedByDay || {}
  if (Object.keys(buried).length) {
    for (const [day, n] of Object.entries(buried)) {
      if (!n || byKey.has(day)) continue
      const h = dayHeadingFor(day, now)
      const g = { key: day, title: h.title, sub: h.sub, rows: [] as LogEntry[] }
      byKey.set(day, g)
      groups.push(g)
    }
    groups.sort((a, b) => b.key.localeCompare(a.key))
  }

  return (
    <>
      {groups.map(g => (
        <div key={g.key}>
          <div className="day"><b>{g.title}</b>{g.sub}</div>
          {g.rows.map(e => (
            <LogRow key={`${e.source}-${e.id}`} e={e} order={ord} q={q} onImage={onImage} />
          ))}
          {buried[g.key] > 0 && (
            <Link className="en buriedrow" href="/?filter=buried">
              <div className="t" />
              <div>
                <span className="s">
                  {buried[g.key]} {buried[g.key] === 1 ? 'entry' : 'entries'} buried
                </span>
              </div>
            </Link>
          )}
        </div>
      ))}
    </>
  )
}
