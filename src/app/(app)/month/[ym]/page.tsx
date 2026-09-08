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

export default function MonthPage({ params }: { params: { ym: string } }) {
  const router = useRouter()
  const [v, setV] = useState<MonthView | null>(null)
  const [loading, setLoading] = useState(true)
  const [writing, setWriting] = useState(false)
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
          <div className="back"><Link href="/">the log</Link></div>
          <div className="none">That month isn&rsquo;t a month.</div>
        </div>
      </Shell>
    )
  }

  const max = Math.max(1, ...Object.values(v.days).map(Number))
  const citedIndex = new Map(v.cited.map((id, i) => [i + 1, id]))

  return (
    <Shell>
      <div className="logpage pg-month">
        <div className="back">
          <Link href="/">the log</Link>
          <span>·</span>
          <Link href={`/month/${shift(v.ym, -1)}`}>← {shift(v.ym, -1)}</Link>
          <Link href={`/month/${shift(v.ym, 1)}`}>{shift(v.ym, 1)} →</Link>
        </div>

        <div className="pghead">
          <h1>{v.label}</h1>
          <div className="pgmeta">
            <span>{v.entries.length} {v.entries.length === 1 ? 'entry' : 'entries'}</span>
            <span>{v.days_with_something} of {v.days_in_month} days</span>
            {v.public_count > 0 && <span>{v.public_count} public</span>}
          </div>
        </div>

        {/* The month in one paragraph. */}
        <div className="pgpara" style={{ marginTop: 22 }}>
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

        {/* How much of the month is written down. */}
        <div className="idxband"><b>How much of the month is written down</b>
          {v.days_with_something} days with something · {v.days_in_month - v.days_with_something} with nothing
        </div>
        <div className="monthdays">
          {Array.from({ length: v.days_in_month }, (_, i) => i + 1).map(d => {
            const n = Number(v.days[String(d)] || 0)
            return (
              <i
                key={d}
                style={{
                  height: `${n ? Math.max(14, Math.round((n / max) * 100)) : 4}%`,
                  background: n ? 'var(--sig)' : 'var(--line-2)',
                }}
                title={`${d} ${v.label} — ${n} ${n === 1 ? 'entry' : 'entries'}`}
              />
            )
          })}
        </div>

        <div className="idxband"><b>The month</b>{v.entries.length}</div>
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
