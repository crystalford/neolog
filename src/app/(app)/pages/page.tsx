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

const KIND_CLASS: Record<string, string> = {
  job: 'job', project: 'proj', subject: 'subj', person: 'per', place: 'place',
}

export default function PagesIndex() {
  const [items, setItems] = useState<IndexPage[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [seeding, setSeeding] = useState(false)
  const [seedNote, setSeedNote] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [tab, setTab] = useState<'all' | PageBand>('all')

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

  const make = useCallback(async () => {
    const name = newName.trim()
    if (!name || seeding) return
    setSeeding(true)
    setSeedNote(null)
    try {
      const res = await fetch('/api/v2/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!res.ok) { setSeedNote('that did not go in'); return }
      const r = await res.json() as { name: string; existed: boolean }
      setSeedNote(r.existed
        ? `${r.name} already has a page.`
        : `${r.name} has a page. Anything that names it attaches on its own.`)
      setNewName('')
      await load()
    } finally { setSeeding(false) }
  }, [newName, seeding, load])

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
      <div className="logpage pg-headings">
        <div className="back">
          <Link href="/">← the log</Link>
          <span className="sep">·</span>
          <span>{items.length} {items.length === 1 ? 'page' : 'pages'}</span>
        </div>

        <div className="grid">
          <main>
            <div className="top">
              <h1>The index</h1>
              <span className="sub">
                {items.length} · every name, place, project and subject on the
                log — each one a page, pointing at everything about it
              </span>
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

            {/* `headings.html`: all · going on now · from before · people ·
                places. A filter with nothing behind it is not shown — the
                bar offers only the bands that exist. */}
            <div className="tabs">
              <button className={tab === 'all' ? 'on' : undefined} onClick={() => setTab('all')}>all</button>
              {bands.filter(b => b.rows.length).map(({ band }) => (
                <button
                  key={band}
                  className={tab === band ? 'on' : undefined}
                  onClick={() => setTab(band)}
                >{BAND_LABELS[band].title.toLowerCase()}</button>
              ))}
              <span className="r">newest activity first</span>
            </div>

            {bands.filter(b => tab === 'all' || b.band === tab).map(({ band, rows }) => (
              <div key={band}>
                <div className="grp">
                  <b>{BAND_LABELS[band].title}</b>
                  {rows.length}
                  {BAND_LABELS[band].sub && ` · ${BAND_LABELS[band].sub}`}
                </div>
                <div className="row hd">
                  <span>page</span><span>kind</span><span>span</span>
                  <span>entries</span><span>status</span>
                </div>
                {rows.map(p => (
                  <Link className="row" key={p.id} href={p.href}>
                    <div className="n">
                      {p.name}
                      {p.summary && <i>{firstClause(p.summary)}</i>}
                    </div>
                    <span className={`k ${KIND_CLASS[p.kind] || ''}`}>a {p.kind}</span>
                    <span className={`sp${/^from memory|^\d{4}$/.test(p.span) ? ' fz' : ''}`}>{p.span}</span>
                    <span className="c">{p.entry_count || ''}</span>
                    <span className={`st${p.status === 'going on now' ? ' on' : p.status === 'said once' ? ' q' : ''}`}>
                      {p.status}
                    </span>
                  </Link>
                ))}
              </div>
            ))}

            {/* Day one and day one thousand are the same page. The only
                thing offered on an empty index is the one action that fills
                it, and it is offered the same way when the index is full. */}
            {!loading && items.length === 0 && (
              <div className="none">
                {q ? <>No page matches that.<button onClick={() => setQ('')}>clear</button></>
                  : 'No pages yet.'}
              </div>
            )}

            <div className="rule">
              <b>One shape, five kinds.</b> A job, a project, a subject, a
              person, a place — each is a page: made once, the first time you
              name it; the log&rsquo;s one paragraph; every entry under it.
              The kind is a label, not a different page.
            </div>
          </main>

          <aside className="rail">
            {/* A page is made because he named something. Seeding from what
                a model thought mattered is gone, and its absence is the
                feature. */}
            <div className="rc">
              <div className="h">Name something</div>
              <div className="i">
                <input
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') void make() }}
                  placeholder="a person, a place, a project, an idea"
                  aria-label="Name something"
                />
              </div>
              <div className="acts">
                <button onClick={() => void make()} disabled={seeding || !newName.trim()}>
                  {seeding ? 'making it…' : 'Make the page'}
                </button>
              </div>
              <div className="i">
                {seedNote || 'A page is made the first time you name something. Everything after attaches on its own.'}
              </div>
            </div>
          </aside>
        </div>

        <footer className="ft">
          <span>neolog · the index</span>
          <span className="r">
            <Link href="/">the log</Link>
            <Link href="/everything">everything</Link>
          </span>
        </footer>
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
