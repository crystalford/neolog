'use client'

/**
 * The folded periods, under the open days.
 *
 * "Nothing is a flat list past about twenty — fold by time, fold by heading,
 * search first" (SPEC §1). `log-2028.html` is the same page at 4,212
 * entries: this week open, earlier weeks one line, months one line, years
 * one line.
 *
 * A folded line carries a real sentence out of that period — the longest
 * thing he said in it — rather than a summary of the period. That is the
 * honest version, it needs no model, and it is better for finding your way
 * back: the line you remember is the line you click.
 *
 * Opening one fetches exactly that range and renders it with the same rows
 * as the feed, so an opened period is the log, not a different screen.
 */

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { LogDays } from '@/components/LogRow'
import type { LogEntry } from '@/lib/log-entry'

export interface FoldBucket {
  grain: 'week' | 'month' | 'year' | 'months' | 'years'
  from: string
  to: string
  label: string
  count: number
  /** How many periods this one line stands for. 1 for everything but a band. */
  spans: number
  line: string | null
  line_entry_id: string | null
  kinds?: { entries: number; recordings: number; photos: number }
}

/**
 * What a folded period is made of, when there is no line out of it.
 *
 * ⚠️ 21 Sep — this row used to read "Nothing written in words — files and
 * photos only" whenever the period held no typed entry. The fold counted
 * only `log_entries` then, so that was true by construction. It counts
 * recordings now, and this operator's log is four hundred of them: every
 * folded month would have said "files and photos only" over a hundred and
 * ten recordings, and once the open window cut those rows it would have
 * been the ONLY thing on the home page.
 *
 * A count with the noun it counts. Nothing is described and nothing is
 * summarised — the words come from which of three numbers is non-zero.
 */
function madeOf(k: FoldBucket['kinds']): string {
  if (!k) return 'Nothing written in words.'
  const parts: string[] = []
  if (k.recordings) parts.push(`${k.recordings} recording${k.recordings === 1 ? '' : 's'}`)
  if (k.photos) parts.push(`${k.photos} photo${k.photos === 1 ? '' : 's'}`)
  if (k.entries) parts.push(`${k.entries} written down`)
  if (!parts.length) return 'Nothing written in words.'
  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  // A period made only of recordings or files has no sentence of his in it,
  // and saying so is the point — not an absence, a description.
  return k.entries ? list : `${list}, none written down`
}

const BAND: Record<FoldBucket['grain'], string> = {
  week: 'earlier — weeks',
  month: 'months',
  year: 'years',
  months: 'months',
  years: 'earlier years',
}

export function FoldedPeriods({ fold, order, onImage }: {
  fold: FoldBucket[]
  order: 'happened' | 'logged'
  onImage?: (url: string) => void
}) {
  const [open, setOpen] = useState<Record<string, LogEntry[] | 'loading'>>({})

  const toggle = useCallback(async (b: FoldBucket) => {
    const key = `${b.from}:${b.to}`
    if (open[key]) {
      setOpen(o => { const n = { ...o }; delete n[key]; return n })
      return
    }
    setOpen(o => ({ ...o, [key]: 'loading' }))
    try {
      const params = new URLSearchParams({
        order, filter: 'all', limit: '500', from: b.from, to: b.to,
      })
      const res = await fetch(`/api/v2/log?${params}`, { cache: 'no-store' })
      if (!res.ok) { setOpen(o => ({ ...o, [key]: [] })); return }
      const data = await res.json() as { items: LogEntry[] }
      setOpen(o => ({ ...o, [key]: data.items || [] }))
    } catch {
      setOpen(o => ({ ...o, [key]: [] }))
    }
  }, [open, order])

  if (!fold.length) return null

  // Band the periods by grain, so weeks, months and years are visibly
  // different distances rather than one undifferentiated list.
  const bands: { grain: FoldBucket['grain']; rows: FoldBucket[] }[] = []
  for (const b of fold) {
    const last = bands[bands.length - 1]
    if (last && last.grain === b.grain) last.rows.push(b)
    else bands.push({ grain: b.grain, rows: [b] })
  }

  return (
    <>
      {bands.map((band, i) => (
        <div key={`${band.grain}-${i}`}>
          <div className="foldband">
            <b>{BAND[band.grain]}</b>
            {band.rows.reduce((n, r) => n + r.count, 0)} entries
          </div>
          {band.rows.map(b => {
            const key = `${b.from}:${b.to}`
            const state = open[key]
            return (
              <div key={key}>
                <button
                  className={`fold${state ? ' open' : ''}`}
                  onClick={() => void toggle(b)}
                  aria-expanded={!!state}
                >
                  <span className="fl">{b.label}</span>
                  <span className="fs">
                    {b.line || <em>{madeOf(b.kinds)}</em>}
                  </span>
                  <span className="fc">
                    {/* A band says how many years it stands for as well as
                        how many entries, because "203 entries" over ten
                        years and over one are different facts. */}
                    {b.spans > 1 && (
                      <em style={{ fontStyle: 'normal', display: 'block', color: 'var(--fg-4)' }}>
                        {b.spans} {b.grain === 'years' ? 'years' : 'months'}
                      </em>
                    )}
                    {b.count} {b.count === 1 ? 'entry' : 'entries'}
                  </span>
                </button>
                {/* A month is also a place, with its own paragraph. The fold
                    opens it here; the month page is the whole of it. */}
                {b.grain === 'month' && state && (
                  <div className="foldopen" style={{ paddingBottom: 8 }}>
                    <Link
                      href={`/month/${b.from.slice(0, 7)}`}
                      style={{ fontSize: 12.5, color: 'var(--fg-3)', borderBottom: '1px solid var(--line-2)' }}
                    >
                      {b.label} as a place →
                    </Link>
                  </div>
                )}
                {state === 'loading' && (
                  <div className="foldopen"><div className="none">opening…</div></div>
                )}
                {Array.isArray(state) && (
                  <div className="foldopen">
                    <LogDays items={state} order={order} onImage={onImage} />
                    {state.length === 0 && (
                      <div className="none">Nothing in this period after all.</div>
                    )}
                    {/* A band can hold more than one request returns. Saying
                        so is not optional: a list that quietly stops at five
                        hundred reads as the whole period, and a decade behind
                        one line is exactly where that would be believed. */}
                    {state.length >= 500 && b.count > state.length && (
                      <div className="none">
                        Showing {state.length} of {b.count}. Open a shorter
                        stretch, or <Link href="/search">search</Link>, to
                        reach the rest.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </>
  )
}
