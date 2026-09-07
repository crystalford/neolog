'use client'

/**
 * The index — every name, place, project and subject on the log, each one a
 * page pointing at everything about it.
 *
 * Translated from `headings.html`: one table, banded into going-on-now /
 * from-before / people / places, columns page · kind · span · entries ·
 * status, newest activity first inside each band.
 *
 * "One shape, five kinds. A job, a project, a subject, a person, a place —
 * each is a page: made once, the first time you name it; the log's one
 * paragraph; every entry under it. The kind is a label, not a different
 * page."
 *
 * The counts here are information. They are never a reason for the log to
 * do anything, and nothing on this page asks a question.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { type PageBand, BAND_LABELS } from '@/lib/pages'

interface IndexPage {
  id: string
  name: string
  kind: string
  summary: string | null
  entry_count: number
  status: string
  span: string
  band: PageBand
  href: string
  named_by_system: number
}

const BAND_ORDER: PageBand[] = ['now', 'before', 'people', 'places']

export default function PagesIndex() {
  const [items, setItems] = useState<IndexPage[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [seedNote, setSeedNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/pages?limit=500', { cache: 'no-store' })
      if (!res.ok) { setItems([]); return }
      const data = await res.json() as { items: IndexPage[] }
      setItems(data.items || [])
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const seed = useCallback(async () => {
    setSeeding(true)
    setSeedNote(null)
    try {
      const res = await fetch('/api/v2/pages/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 500 }),
      })
      if (!res.ok) return
      const r = await res.json() as { pages_written: number; attachments_written: number }
      setSeedNote(
        r.pages_written > 0
          ? `${r.pages_written} pages made, ${r.attachments_written} entries attached.`
          : 'Nothing new to make — every name already has a page.',
      )
      await load()
    } finally { setSeeding(false) }
  }, [load])

  const bands = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const shown = needle
      ? items.filter(p => p.name.toLowerCase().includes(needle)
          || (p.summary || '').toLowerCase().includes(needle))
      : items
    return BAND_ORDER
      .map(b => ({ band: b, rows: shown.filter(p => p.band === b) }))
      .filter(g => g.rows.length > 0)
  }, [items, q])

  return (
    <Shell active="index">
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <span>·</span>
          <span>{items.length} {items.length === 1 ? 'page' : 'pages'}</span>
        </div>

        <div className="pghead">
          <h1>The index</h1>
          <div className="pgmeta">
            <span>
              Every name, place, project and subject on the log — each one a
              page, pointing at everything about it.
            </span>
          </div>
        </div>

        <div className="find">
          <svg viewBox="0 0 14 14"><circle cx="6" cy="6" r="4.3" /><path d="M9.3 9.3 12.5 12.5" /></svg>
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a page — a name, a place, a project"
            aria-label="Find a page"
          />
          {q && <button className="clr" onClick={() => setQ('')}>clear</button>}
        </div>

        {bands.map(({ band, rows }) => (
          <div key={band}>
            <div className="idxband">
              <b>{BAND_LABELS[band].title}</b>
              {rows.length}
              {BAND_LABELS[band].sub && ` · ${BAND_LABELS[band].sub}`}
            </div>
            <div className="idxhead">
              <span>page</span><span>kind</span><span>span</span>
              <span style={{ textAlign: 'right' }}>entries</span><span>status</span>
            </div>
            {rows.map(p => (
              <Link className="idxrow" key={p.id} href={p.href}>
                <span className="nm">
                  {p.name}
                  {p.summary && <em>{firstClause(p.summary)}</em>}
                </span>
                <span className="kd">a {p.kind}</span>
                <span className="sp">{p.span}</span>
                <span className="ct">{p.entry_count || ''}</span>
                <span className={`st${p.status === 'mostly blank' ? ' blank' : p.status === 'said once' ? ' once' : ''}`}>
                  {p.status}
                </span>
              </Link>
            ))}
          </div>
        ))}

        {/* Day one and day one thousand are the same page. The only thing
            offered on an empty index is the one action that fills it, and
            it is offered the same way when the index is full. */}
        {!loading && items.length === 0 && (
          <div className="none">
            {q ? <>No page matches that.<button onClick={() => setQ('')}>clear</button></>
              : 'No pages yet.'}
          </div>
        )}

        <div className="asview">
          <span>
            {seedNote
              ? seedNote
              : 'A page is made the first time you name something. Everything after attaches on its own.'}
          </span>
          <button
            onClick={() => void seed()}
            disabled={seeding}
            style={{
              marginLeft: 'auto', fontSize: 12.5, color: 'var(--fg-2)',
              borderBottom: '1px solid var(--line-2)', background: 'none',
              border: 0, cursor: seeding ? 'default' : 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {seeding ? 'making pages…' : 'Make pages from what the log already named'}
          </button>
        </div>
      </div>
    </Shell>
  )
}

/** The log's paragraph, cut to its first sentence for the index row. */
function firstClause(s: string): string {
  const t = s.trim()
  const stop = t.search(/[.!?](\s|$)/)
  const cut = stop > 0 ? t.slice(0, stop) : t
  return cut.length > 110 ? `${cut.slice(0, 108)}…` : cut
}
