'use client'

/**
 * A month, as a place.
 *
 * `month.html` — the reduction mechanic given somewhere to live. The month
 * in one paragraph, the coverage strip, then the entries.
 *
 * The line printed under the paragraph is the load-bearing one: "Every
 * sentence above points at entries below. Nothing in it is from outside the
 * month." It is true because the model is only ever shown this month, and
 * because every sentence's citations are checked against the entries that
 * were actually sent before the paragraph is stored.
 *
 * Once the operator edits the paragraph it is his, and the log stops
 * rewriting it. The page says which of the two it is looking at.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import { stampFor } from '@/lib/log-entry'

interface Entry {
  id: string
  text: string
  detail: string | null
  happened_at: string
  author: string
  visibility: string
}

interface MonthView {
  ym: string
  label: string
  entries: Entry[]
  days: Record<string, number>
  by_day: Record<string, { n: number; pub: boolean; q: boolean }>
  year: Record<string, number>
  days_with_something: number
  days_in_month: number
  public_count: number
  summary: string | null
  summary_author: 'log' | 'operator'
  cited: string[]
  stale: boolean
}

function shift(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** The month either side, so the page is a place you can walk along. */
function shiftYm(ym: string, by: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m - 1) + by, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}
function ymLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

export default function MonthPage({ params }: { params: { ym: string } }) {
  const router = useRouter()
  const [v, setV] = useState<MonthView | null>(null)
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(false)
  // Which week is open. One at a time — the page is a month, not a list of
  // every day in it.
  const [openWeek, setOpenWeek] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/month/${params.ym}`, { cache: 'no-store' })
      if (res.ok) setV(await res.json() as MonthView)
      else setV(null)
    } catch { setV(null) }
    finally { setLoading(false) }
  }, [params.ym])

  const prevYm = shiftYm(params.ym, -1)
  const nextYm = shiftYm(params.ym, 1)
  const prevLabel = ymLabel(prevYm)
  const nextLabel = ymLabel(nextYm)
  useEffect(() => { void load() }, [load])

  const write = useCallback(async () => {
    setWriting(true)
    try {
      await fetch(`/api/v2/month/${params.ym}`, { method: 'POST' })
      await load()
    } finally { setWriting(false) }
  }, [params.ym, load])

  if (loading) return <Shell><div className="logpage pg-month" /></Shell>
  if (!v) {
    return (
      <Shell>
        <div className="logpage pg-month">
          <div className="crumb"><Link href="/">the log</Link></div>
          <div className="none">That month isn&rsquo;t a month.</div>
        </div>
      </Shell>
    )
  }

  const max = Math.max(1, ...Object.values(v.days).map(Number))
  const yearMax = Math.max(1, ...Object.values(v.year).map(Number))

  /**
   * A cell per day of the month. Three densities against the fullest day, so
   * "a lot" is relative to his own month rather than to a number the log
   * picked. Public and question are marks ON a day, not densities — a day
   * can be both.
   */
  const days = Array.from({ length: v.days_in_month }, (_, i) => i + 1).map(d => {
    const cell = v.by_day[String(d)] || { n: 0, pub: false, q: false }
    const band = cell.n === 0 ? '' : cell.n >= max * 0.66 ? 's3' : cell.n >= max * 0.33 ? 's2' : 's1'
    const cls = [band, cell.pub ? 'pub' : '', cell.q ? 'q' : ''].filter(Boolean).join(' ')
    const what = cell.n === 0
      ? 'nothing'
      : `${cell.n} ${cell.n === 1 ? 'entry' : 'entries'}`
        + (cell.pub ? ' · something public' : '')
        + (cell.q ? ' · a question' : '')
    return { d, cls, title: `${d} ${v.label} — ${what}` }
  })

  /**
   * The month cut into weeks, newest first, each carrying its own entries.
   * Cut on the DAY, not by a rolling seven from the 1st, so a week is the
   * calendar week he lived rather than an offset from a boundary.
   */
  const weeks = (() => {
    const out: { key: string; label: string; count: number; days: number; entries: Entry[] }[] = []
    const [yy, mm] = v.ym.split('-').map(Number)
    const last = v.days_in_month
    // Walk backwards in blocks that end on the last day and break on Mondays.
    let end = last
    while (end >= 1) {
      const dow = new Date(Date.UTC(yy, mm - 1, end)).getUTCDay() // 0 Sun
      // Monday starts a week; step back to it, or to the 1st.
      const span = dow === 1 ? 1 : dow === 0 ? 7 : dow
      const start = Math.max(1, end - span + 1)
      const inWeek = v.entries.filter(e => {
        const d = new Date(e.happened_at).getUTCDate()
        return d >= start && d <= end
      })
      const withSomething = new Set(inWeek.map(e => new Date(e.happened_at).getUTCDate())).size
      const month = new Date(Date.UTC(yy, mm - 1, 1))
        .toLocaleDateString('en-GB', { month: 'short' })
      out.push({
        key: `${start}-${end}`,
        label: start === end ? `${start} ${month}` : `${start} – ${end} ${month}`,
        count: inWeek.length,
        days: withSomething,
        entries: inWeek,
      })
      end = start - 1
    }
    return out
  })()

  const citedIndex = new Map(v.cited.map((id, i) => [i + 1, id]))

  return (
    <Shell>
      <div className="logpage pg-month">
        <div className="crumb">
          <Link href="/">the log</Link>
          <span>·</span>
          <Link href={`/month/${shift(v.ym, -1)}`}>← {shift(v.ym, -1)}</Link>
          <Link href={`/month/${shift(v.ym, 1)}`}>{shift(v.ym, 1)} →</Link>
        </div>

        {/* `month.html`: the month either side, then the month itself. */}
        <div className="nav2">
          <Link href={`/month/${prevYm}`}>← {prevLabel}</Link>
          <Link href={`/month/${nextYm}`}>{nextLabel} →</Link>
        </div>

        <h1>{v.label}</h1>
        <div className="strip">
          <span>{v.entries.length} {v.entries.length === 1 ? 'entry' : 'entries'}</span>
          <span>{v.days_with_something} of {v.days_in_month} days</span>
          {v.public_count > 0 && <span>{v.public_count} public</span>}
        </div>

        <div className="grid">
          <main>

        {/* The month in one paragraph. */}
        <div className="para" style={{ marginTop: 22 }}>
          {editing ? (
            <>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
              <div className="fixrow" style={{ marginTop: 10 }}>
                <button
                  className="p"
                  onClick={async () => {
                    await fetch(`/api/v2/month/${v.ym}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ summary: draft }),
                    })
                    setEditing(false)
                    await load()
                  }}
                >Save</button>
                <button onClick={() => setEditing(false)}>Cancel</button>
              </div>
            </>
          ) : v.summary ? (
            <>
              <Cited text={v.summary} index={citedIndex} />
              <span className="who">
                {v.summary_author === 'operator'
                  ? 'your words · you rewrote this, and the log leaves it alone now'
                  : 'written by the log from this month’s entries · every sentence points at an entry below, and nothing in it is from outside the month'}
                {v.stale && v.summary_author === 'log' && ' · entries have landed since this was written'}
              </span>
            </>
          ) : (
            <>
              Nothing written about this month yet.
              <span className="who">
                The log can write one from the {v.entries.length} entries below.
                Every sentence would point at one of them.
              </span>
            </>
          )}
          <div className="fixrow" style={{ marginTop: 12 }}>
            {v.summary_author !== 'operator' && (
              <button onClick={() => void write()} disabled={writing || !v.entries.length}>
                {writing ? 'reading the month…' : v.summary ? 'write it again' : 'write it'}
              </button>
            )}
            {v.summary && (
              <button onClick={() => { setDraft(v.summary || ''); setEditing(true) }}>
                {v.summary_author === 'operator' ? 'edit it' : 'rewrite it yourself'}
              </button>
            )}
          </div>
        </div>

        {/* ── How much of the month is written down ─────────────────────
            `month.html`'s strip: a cell per day, shaded by how much was
            said, with a mark where something is public or a question was
            asked. Three densities and nothing — the design's own four
            states, so the strip says how much without saying what. */}
        <div className="strip">
          <div className="k">
            <span>How much of the month is written down</span>
            <span>
              {v.days_with_something} days with something ·{' '}
              {v.days_in_month - v.days_with_something} with nothing
            </span>
          </div>
          <div className="days">
            {days.map(d => (
              <i key={d.d} className={d.cls} title={d.title} />
            ))}
          </div>
          {/* Every fifth day numbered, the way the design numbers them —
              enough to find a date, not so many that it becomes a ruler. */}
          <div className="dnums">
            {days.map(d => (
              <span key={d.d}>{d.d === 1 || d.d % 5 === 0 || d.d === v.days_in_month ? d.d : ''}</span>
            ))}
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--t-steel)' }} />a lot said</span>
            <span><i style={{ background: 'rgba(78,161,213,.28)' }} />a little</span>
            <span><i style={{ background: 'var(--bg-3)' }} />nothing</span>
            <span><i style={{ background: 'var(--t-teal)' }} />something public</span>
            <span><i style={{ background: 'var(--t-ochre)' }} />an open question</span>
          </div>
        </div>

        {/* ── The month, week by week ────────────────────────────────────
            Newest first, like everything else. A week opens to its days.
            Nothing is summarised: the line under a week is a count, and the
            rows inside it are the entries themselves. */}
        <div className="sh">
          <span>The month, week by week</span>
          <b>click a week to open its days · newest first</b>
        </div>
        {weeks.map(w => (
          <div className={`wk${openWeek === w.key ? ' open' : ''}`} key={w.key}>
            <button className="h" onClick={() => setOpenWeek(openWeek === w.key ? null : w.key)}>
              <div className="d">
                {w.label}
                <i>{w.count} {w.count === 1 ? 'entry' : 'entries'} · {w.days} {w.days === 1 ? 'day' : 'days'}</i>
              </div>
            </button>
            {openWeek === w.key && (
              <div className="body">
                {w.entries.length === 0
                  ? <div className="dy"><span className="t">nothing</span><div className="x">No entry that week.</div></div>
                  : w.entries.map(e => (
                    <Link className="dy" href={`/entry/${e.id}`} key={e.id}>
                      <span className="t">{stampFor(e.happened_at, 'exact')}</span>
                      <div className="x">
                        {e.text}
                        {e.visibility === 'public' && <i className="pub">public</i>}
                        {e.author !== 'operator' && <i>written by the log</i>}
                      </div>
                    </Link>
                  ))}
              </div>
            )}
          </div>
        ))}

        {/* ── The year, the same shape ───────────────────────────────────
            `month.html`: "zoom out one level — the year is the same shape."
            A month with nothing is not a link, because there is nothing to
            open. */}
        <div className="yr">
          <div className="k">The year, the same shape</div>
          <div className="mos">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
              const n = Number(v.year[String(m)] || 0)
              const mm = `${v.ym.slice(0, 4)}-${String(m).padStart(2, '0')}`
              const label = new Date(Date.UTC(2000, m - 1, 1))
                .toLocaleDateString('en-GB', { month: 'short' })
              const cls = n === 0 ? '' : n >= yearMax * 0.5 ? 'some' : 'some q'
              return n === 0
                ? <span key={m} title={`${label} — nothing`}>{label}</span>
                : (
                  <Link key={m} href={`/month/${mm}`} className={cls}
                    title={`${label} — ${n} ${n === 1 ? 'entry' : 'entries'}`}>
                    {label}
                  </Link>
                )
            })}
          </div>
        </div>

        {/* The one line the log says about the paragraph above, and it is
            about authorship, not about him. */}
        <div className="rule">
          The paragraph is the log&rsquo;s. The entries are yours. Open any week
          to read them.
        </div>

        <div className="sh"><b>The month</b>{v.entries.length}</div>
        {v.entries.map(e => (
          <Link className="en" href={`/entry/${e.id}`} key={e.id} id={`e-${e.id}`}>
            <div className="t">{stampFor(e.happened_at, 'exact')}</div>
            <div>
              <div className="x">
                <span className="s">{e.text}</span>
                <span className="tags">
                  <i>{e.author === 'operator' ? 'said' : 'arrived'}</i>
                  {e.visibility === 'private' && <i className="priv">private</i>}
                </span>
              </div>
              {e.detail && <div className="more">{e.detail}</div>}
            </div>
          </Link>
        ))}

        {v.entries.length === 0 && (
          <div className="none">Nothing on the log for {v.label}.</div>
        )}
            <div className="foot">
              Every sentence above points at an entry below. Nothing in it is
              from outside the month.
            </div>
          </main>

          <Rail goesTo={[
            { href: '/', label: 'the log' },
            { href: '/onthisday', label: 'on this day' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}

/** The paragraph, with its citations turned into links to the entries. */
function Cited({ text, index }: { text: string; index: Map<number, string> }) {
  const parts = text.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        if (!m) return <span key={i}>{part}</span>
        const n = parseInt(m[1], 10)
        const id = index.get(n)
        if (!id) return null
        return (
          <button
            className="cite"
            key={i}
            title={`Entry ${n}`}
            onClick={() => document.getElementById(`e-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
          >{n}</button>
        )
      })}
    </>
  )
}
