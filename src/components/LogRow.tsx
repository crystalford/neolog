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
import {
  type LogEntry, type DatePrecision,
  stampFor, isFuzzy, dayKeyFor, dayHeadingFor, tagsFor, clockDuration,
} from '@/lib/log-entry'

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
          </span>
        </div>

        {/* The row carries its context — the second line stays visible. */}
        {e.detail && !held && <div className="more">{highlight(e.detail, term)}</div>}

        {/* The log says what it saw, never an unnamed reason. */}
        {held && (
          <div className="more">
            <b>The log kept this back on its own.</b>{' '}
            {e.held_reason ? `It looks like ${e.held_reason}.` : 'It has not been looked at yet.'}{' '}
            Nothing about it is on the public log. You can publish it anyway,
            but you have to say so.
          </div>
        )}

        {(image || video || audio) && (
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
            {/* A recording is something you play, not a picture of a
                waveform. The player stops the row's click reaching the
                link, so pressing play does not navigate away. */}
            {audio && audio.url && (
              <span
                className="aud"
                onClick={ev => { ev.preventDefault(); ev.stopPropagation() }}
              >
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <audio src={audio.url} controls preload="none" />
                {audio.duration_seconds
                  ? <span className="tm">{clockDuration(audio.duration_seconds)}</span>
                  : null}
              </span>
            )}
            {held && <span className="cap">blurred here too, until you say otherwise</span>}
          </div>
        )}
      </div>
    </>
  )

  return e.href
    ? <Link className={`en${held ? ' isheld' : ''}`} href={e.href}>{body}</Link>
    : <div className={`en${held ? ' isheld' : ''}`}>{body}</div>
}

/**
 * Group rows into days and render them. The dividers are generated from
 * whichever date you are ordering by, so the toolbar's two controls can
 * never disagree with the headings.
 */
export function LogDays({ items, order, q, onImage }: {
  items: LogEntry[]
  order?: 'happened' | 'logged'
  q?: string
  onImage?: (url: string) => void
}) {
  const ord = order || 'happened'
  const groups: { key: string; title: string; sub: string; rows: LogEntry[] }[] = []
  const now = new Date()
  for (const e of items) {
    const date = ord === 'logged' ? e.logged_at : e.happened_at
    const key = dayKeyFor(date, ord === 'logged' ? 'exact' : e.date_precision)
    const last = groups[groups.length - 1]
    if (last && last.key === key) last.rows.push(e)
    else {
      const h = dayHeadingFor(key, now)
      groups.push({ key, title: h.title, sub: h.sub, rows: [e] })
    }
  }

  return (
    <>
      {groups.map(g => (
        <div key={g.key}>
          <div className="day"><b>{g.title}</b>{g.sub}</div>
          {g.rows.map(e => (
            <LogRow key={`${e.source}-${e.id}`} e={e} order={ord} q={q} onImage={onImage} />
          ))}
        </div>
      ))}
    </>
  )
}
