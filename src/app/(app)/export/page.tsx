'use client'

/**
 * Pulling a stretch of it out.
 *
 * "Pick a date range, or a page, or both. Everything the log has for it
 * comes out in order" (`export.html`). This is the promise the whole thing
 * rests on, so it is deliberately plain: two dates, an optional page, and a
 * button that puts a file on disk.
 *
 * The two guarantees are stated on the screen because they are the point,
 * not decoration: nothing is added that isn't in the log, and every line
 * traces back to an entry.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface IndexPage { id: string; name: string; kind: string; entry_count: number }

export default function ExportPage() {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [pageId, setPageId] = useState('')
  const [pages, setPages] = useState<IndexPage[]>([])
  const [count, setCount] = useState<number | null>(null)
  const [counting, setCounting] = useState(false)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v2/pages?limit=500', { cache: 'no-store' })
        if (res.ok) setPages(((await res.json()) as { items: IndexPage[] }).items || [])
      } catch { /* the picker just stays empty */ }
    })()
  }, [])

  const params = useCallback((format: 'md' | 'json') => {
    const p = new URLSearchParams({ format })
    if (from) p.set('from', from)
    if (to) p.set('to', to)
    if (pageId) p.set('page_id', pageId)
    return p.toString()
  }, [from, to, pageId])

  // Say how much is in the range before he downloads it, so the file is
  // never a surprise.
  useEffect(() => {
    let cancelled = false
    setCounting(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v2/export?${params('json')}`, { cache: 'no-store' })
        if (!res.ok || cancelled) return
        const b = await res.json() as { counts: { entries: number } }
        if (!cancelled) setCount(b.counts.entries)
      } catch { if (!cancelled) setCount(null) }
      finally { if (!cancelled) setCounting(false) }
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [params])

  const chosen = pages.find(p => p.id === pageId)

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb"><Link href="/">the log</Link></div>

        <div className="pghead">
          <h1>Pulling a stretch of it out</h1>
          <div className="pgmeta">
            <span>
              Pick a date range, or a page, or both. Everything the log has
              for it comes out in order.
            </span>
          </div>
        </div>

        <div className="pgpara" style={{ marginTop: 22 }}>
          Nothing is added that isn&rsquo;t in the log. Every line traces back
          to an entry, and dates marked approximate come out marked
          approximate. The Markdown opens in anything; the JSON manifest
          beside it carries every field the document doesn&rsquo;t show, so
          nothing is lost by reading the readable one.
          <span className="who">
            Media stays in storage and the manifest points at it — a download
            link that works for a day, not eleven gigabytes in a zip.
          </span>
        </div>

        <div className="rc" style={{ marginTop: 26, maxWidth: 660 }}>
          <div className="h">What to pull out</div>

          <div className="i">
            <b>A range</b>
            <em>Leave either side empty for &ldquo;everything up to&rdquo; or &ldquo;everything since&rdquo;.</em>
            <div className="fixrow" style={{ alignItems: 'center' }}>
              <input
                type="date" value={from} onChange={e => setFrom(e.target.value)}
                style={dateStyle} aria-label="From"
              />
              <span style={{ fontSize: 12, color: 'var(--fg-4)' }}>to</span>
              <input
                type="date" value={to} onChange={e => setTo(e.target.value)}
                style={dateStyle} aria-label="To"
              />
              {(from || to) && (
                <button onClick={() => { setFrom(''); setTo('') }}>whole log</button>
              )}
            </div>
          </div>

          <div className="i">
            <b>A page</b>
            <em>Everything the log gathered under one name.</em>
            <select value={pageId} onChange={e => setPageId(e.target.value)}>
              <option value="">the whole log</option>
              {pages.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} — a {p.kind}{p.entry_count ? ` · ${p.entry_count}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="i">
            <b>
              {counting ? 'Counting…'
                : count === null ? 'Ready'
                : `${count} ${count === 1 ? 'entry' : 'entries'} in this range.`}
            </b>
            <em>
              {chosen ? `Everything under ${chosen.name}` : 'The whole log'}
              {from || to ? `, ${from || 'the beginning'} to ${to || 'today'}` : ''}.
            </em>
            <div className="fixrow">
              <a href={`/api/v2/export?${params('md')}`} download>
                <button className="p" disabled={count === 0}>Download the document</button>
              </a>
              <a href={`/api/v2/export?${params('json')}`} download>
                <button disabled={count === 0}>Download the manifest</button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  )
}

const dateStyle: React.CSSProperties = {
  background: 'var(--bg-2)',
  border: '1px solid var(--line-1)',
  borderRadius: 7,
  color: 'var(--fg-1)',
  font: 'inherit',
  fontSize: 12.5,
  padding: '5px 9px',
  colorScheme: 'dark',
}
