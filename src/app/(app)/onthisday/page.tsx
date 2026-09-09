'use client'

/**
 * On this day — the log falls open at a page.
 *
 * SPEC §1: "Resurfacing without comment is allowed. An old entry shown again
 * on its date — on this day — with nothing said about it. **Shows; doesn't
 * say.**"
 *
 * This is the only resurfacing in the product, and the restraint is the
 * whole feature. `onthisday.html`: "No comment, no 'remember when', no
 * count. The way a diary falls open at a page... It shows; it never says.
 * The entry appears as it was written. The log adds no 'one year ago today',
 * no nudge, no count. If seeing it makes you write something, that's yours."
 *
 * So: no "N years ago" arithmetic on a row, no counts beside a year, no
 * prompt to do anything about it. The year, and what was written under it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { stampFor, isFuzzy, type DatePrecision } from '@/lib/log-entry'

interface Row {
  id: string
  text: string
  detail: string | null
  happened_at: string
  date_precision: DatePrecision
  author: string
  visibility: string
  media_url: string | null
}

interface Result {
  on: string
  years: { year: number; entries: Row[] }[]
  empty_years: number
  first_year: number
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function OnThisDay() {
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/onthisday', { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const title = r
    ? `${parseInt(r.on.slice(3), 10)} ${MONTHS[parseInt(r.on.slice(0, 2), 10) - 1]} in other years`
    : ''

  return (
    <Shell>
      <div className="logpage pg-onthisday">
        <div className="back"><Link href="/">the log</Link></div>

        <section className="top">
          <h1>{title}</h1>
          <p>Every year this date had something on it, shown as it was.</p>
        </section>

        {/* ⚠️ `.idxband` is `/pages`' index band, borrowed here for a year
            heading. `onthisday.html` has its own: `.yr` is the block, `.y`
            is the year. A different thing gets a different class rather than
            a page taking another page's furniture. */}
        {r?.years.map(y => (
          <div className="yr" key={y.year}>
            <div className="y"><b>{y.year}</b></div>
            {/* ⚠️ One wrapper, because `.yr` is a two-column grid (110px +
                1fr). With the rows as direct children, a year with two
                entries put the second one back in the year column. */}
            <div>
            {y.entries.map(e => (
              <Link className="en" href={`/entry/${e.id}`} key={e.id}>
                <div className={`t${isFuzzy(e.date_precision) ? ' fz' : ''}`}>
                  {stampFor(e.happened_at, e.date_precision)}
                </div>
                <div>
                  <div className="x">
                    <span className="s">{e.text}</span>
                    <span className="tags">
                      <i>{e.author === 'operator' ? 'said' : 'arrived'}</i>
                      {e.visibility === 'private' && <i className="priv">private</i>}
                    </span>
                  </div>
                  {e.detail && <div className="more">{e.detail}</div>}
                  {/* The pictures from that day, beside the line rather than
                      described in it. A held row is sent no URL at all. */}
                  {e.media_url && (
                    <div className="ph">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={e.media_url} alt="" loading="lazy" />
                    </div>
                  )}
                </div>
              </Link>
            ))}
            </div>
          </div>
        ))}

        {/* A gap in the log is not proof nothing happened, and saying so is
            not the same as nudging him to fill it. */}
        {r && r.empty_years > 0 && (
          <>
            <div className="idxband"><b>Nothing on this date</b></div>
            <div className="quiet" style={{ padding: '10px 2px 0' }}>
              {r.empty_years} {r.empty_years === 1 ? 'year' : 'years'} since{' '}
              {r.first_year} with nothing written down for this day. Not because
              nothing happened.
            </div>
          </>
        )}

        {!loading && (!r || r.years.length === 0) && (
          <div className="none">Nothing on this date in any year yet.</div>
        )}
        {/* `onthisday.html`: the one permitted resurfacing, and the page
            says what it will not do rather than leaving it to be noticed. */}
        <div className="rules">
          <b>It shows; it never says.</b> No &ldquo;one year ago today&rdquo;,
          no count, no nudge. The entry appears as it was written. Dates the
          log had to guess are left out — a guessed day has no business on the
          surface whose whole discipline is not saying.
        </div>
      </div>
    </Shell>
  )
}
