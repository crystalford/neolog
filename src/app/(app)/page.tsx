'use client'

/**
 * The log — home.
 *
 * Translated from the design package's `log.html` (7 Sep 2026). The composer
 * on top, the log beneath, the rail beside it. The way every feed works.
 *
 * The rules this page is built to keep, each from `SPEC.md`:
 *
 *   §0.1  There is one log. This feed is the only feed; the public one is
 *         this filtered to what's marked public, never authored separately.
 *   §0    rule 6 — never ask a question at the moment of input. The receipt
 *         is one line and one undo, and then it goes away.
 *   §1    Two times on every entry, and the toolbar orders by either.
 *   §11   Two gestures on a row and only two: the image opens a lightbox
 *         over the feed, everything else opens the entry's own page. There
 *         is no third expand-in-place gesture — having one alongside the
 *         other two made every row a guess about what a click would do.
 *   §11   A row links to its content, never to the container it belongs to,
 *         and a row whose entry has no page of its own is not clickable.
 *   §11   The row carries its context; the second line stays visible.
 *
 * `day-one.html`: the log with nothing in it is the same page as the log
 * with four thousand entries. No welcome, no tour, no setup, no empty-state
 * illustration. One entry gets it going.
 *
 * What used to be here — the CapturePanel and "Ready to send" — moved to
 * `/ready`, whole. It is the machine's suggestions drawn from the record,
 * and the record is what home is for now.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { useIntake } from '@/components/useIntake'
import { LogDays } from '@/components/LogRow'
import { LogLightbox, useShots, useRestorePlace } from '@/components/LogLightbox'
import { OpenQuestions } from '@/components/OpenQuestions'
import { FoldedPeriods, type FoldBucket } from '@/components/FoldedPeriods'
import {
  type LogEntry, type FeedFilter, type DatePrecision,
  stampFor, isFuzzy, dayKeyFor, dayHeadingFor, tagsFor, clockDuration,
} from '@/lib/log-entry'

// ── Icons, at the design's stroke weights ─────────────────────────────────
const MicIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="6" y="1.8" width="4" height="7.6" rx="2" />
    <path d="M3.6 8.4a4.4 4.4 0 0 0 8.8 0M8 13v1.4" />
  </svg>
)
const FileIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.5 2.2H4.6a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.5Z" />
    <path d="M9.5 2.2v3.3h3.3" />
  </svg>
)
const PhotoIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.8" y="3.4" width="12.4" height="9.4" rx="1.6" />
    <circle cx="8" cy="8.1" r="2.4" />
  </svg>
)
const LinkIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.6 9.4 9.4 6.6M5.2 10.8l-1 1a2.5 2.5 0 0 1-3.5-3.5l2-2a2.5 2.5 0 0 1 3.5 0M10.8 5.2l1-1a2.5 2.5 0 0 1 3.5 3.5l-2 2a2.5 2.5 0 0 1-3.5 0" />
  </svg>
)
const SendIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />
  </svg>
)

const FILTERS: { k: FeedFilter; label: string }[] = [
  { k: 'all',  label: 'everything' },
  { k: 'said', label: 'what I said' },
  { k: 'did',  label: 'what I did' },
  { k: 'auto', label: 'arrived on its own' },
  { k: 'mem',  label: 'from memory' },
  { k: 'pub',  label: 'public' },
  { k: 'priv', label: 'kept private' },
  { k: 'held', label: 'held back' },
]

const PRECISION_LABELS: { p: DatePrecision; label: string }[] = [
  { p: 'exact', label: 'that day' },
  { p: 'month', label: 'that month' },
  { p: 'year',  label: 'that year' },
]

export default function LogHome() {
  // ── Composer ────────────────────────────────────────────────────────────
  // The mechanics live in `useIntake`, shared with the full-screen `/now`
  // page so the two ways in can't drift apart.
  const [whenOpen, setWhenOpen] = useState(false)
  const [when, setWhen] = useState('')
  const [precision, setPrecision] = useState<DatePrecision>('exact')
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Feed ────────────────────────────────────────────────────────────────
  // The intake reloads the feed when something goes in. It's declared before
  // `loadFeed` exists, so the reloader is reached through a ref rather than
  // ordering one of them around the other.
  const loadFeedRef = useRef<(() => Promise<void>) | null>(null)
  const intake = useIntake(() => { void loadFeedRef.current?.() })
  const {
    text, setText, pending, attach, removePending,
    recording, toggleMic, canSend, wordCount, receipt,
  } = intake

  const [items, setItems] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [buried, setBuried] = useState(0)
  // Coverage describes the whole log, so it comes from the server and does
  // not move when the feed is filtered.
  const [coverage, setCoverage] = useState<Record<string, number>>({})
  // Everything older than the open window, as one line per period.
  const [fold, setFold] = useState<FoldBucket[]>([])
  const [buriedByDay, setBuriedByDay] = useState<Record<string, number>>({})
  const [filter, setFilter] = useState<FeedFilter>(() => {
    // ?filter=buried is how the buried view is reached — it is not a ninth
    // button on a toolbar the design gives eight.
    if (typeof window === 'undefined') return 'all'
    const f = new URLSearchParams(window.location.search).get('filter')
    return f === 'buried' ? 'buried' : 'all'
  })
  const [order, setOrder] = useState<'happened' | 'logged'>('happened')
  const [q, setQ] = useState('')
  const [shotAt, setShotAt] = useState<number | null>(null)
  // Arriving from an entry with "write what this led to". The composer
  // carries the turn so the next thing typed joins the thread.
  const [ledFrom] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('led_from')
  })
  const [relation] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('relation')
  })

  const loadFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({ order, filter, limit: '200' })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/v2/log?${params}`, { cache: 'no-store' })
      if (!res.ok) { setItems([]); return }
      const data = await res.json() as {
        items: LogEntry[]; buried: number
        coverage?: Record<string, number>; fold?: FoldBucket[]
        buried_by_day?: Record<string, number>
      }
      setItems(data.items || [])
      setBuried(data.buried || 0)
      if (data.coverage) setCoverage(data.coverage)
      // Empty on a filtered or searched feed — that is already a narrowed
      // list, and folding it again would hide the thing being looked for.
      setFold(data.fold || [])
      setBuriedByDay(data.buried_by_day || {})
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [order, filter, q])
  loadFeedRef.current = loadFeed

  // Filters as you type, debounced so it isn't a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { void loadFeed() }, q ? 220 : 0)
    return () => clearTimeout(t)
  }, [loadFeed, q])

  // One box at any length: it grows with the text and never switches mode.
  // "got a job" and a 900-word memory of 2008 are the same action.
  const grow = useCallback(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])
  useEffect(() => { grow() }, [text, grow])

  // ── Putting it in ───────────────────────────────────────────────────────
  const submit = useCallback(async () => {
    const r = await intake.submit({
      happened_at: when ? new Date(`${when}T12:00:00Z`).toISOString() : undefined,
      date_precision: when ? precision : undefined,
      led_from: ledFrom || undefined,
      relation: relation || undefined,
    })
    if (!r) return
    // Receipt, then silence. Nothing is asked.
    setWhen('')
    setWhenOpen(false)
    setPrecision('exact')
    if (receiptTimer.current) clearTimeout(receiptTimer.current)
    receiptTimer.current = setTimeout(() => intake.setReceipt(null), 8000)
    taRef.current?.focus()
  }, [intake, when, precision, ledFrom, relation])

  const undo = useCallback(async () => {
    await intake.undo()
  }, [intake])

  // The search box's filter offer. Matched on the button's own label so the
  // two can never drift apart.
  const filterOffer = useMemo(() => {
    const t = q.trim().toLowerCase()
    if (!t) return null
    const hit = FILTERS.find(f =>
      f.label.toLowerCase() === t
      || (t === 'private' && f.k === 'priv')
      || (t === 'public' && f.k === 'pub')
      || (t === 'held' && f.k === 'held'))
    return hit && hit.k !== filter ? hit : null
  }, [q, filter])

  // Every picture on the page, in order, so the lightbox steps through them
  // rather than showing one in isolation.
  const shots = useShots(items)
  const openShot = useCallback((url: string) => {
    const i = shots.findIndex(sh => sh.url === url)
    setShotAt(i >= 0 ? i : null)
  }, [shots])

  // Put the reader back on the row they left from. Every look at detail is a
  // navigation now, so without this the two-gesture rule costs more than it
  // saves.
  useRestorePlace(!loading && items.length > 0)

  return (
    <Shell active="log">
      <div className="logpage">
        <div className="grid">
          <main>
            {/* ── The composer ─────────────────────────────────────────── */}
            <div className="comp">
              <div className="in">
                {pending.length > 0 && (
                  <div className="att">
                    {pending.map(p => (
                      <span className="chip" key={p.key}>
                        {p.file.type.startsWith('image/') ? <PhotoIcon />
                          : p.file.type.startsWith('audio/') ? <MicIcon />
                          : <FileIcon />}
                        <span>{p.file.name}</span>
                        <em>{p.error ? p.error : p.uploading ? 'going up' : fmtBytes(p.file.size)}</em>
                        <button onClick={() => removePending(p.key)} aria-label="Remove">×</button>
                      </span>
                    ))}
                  </div>
                )}
                {wordCount > 0 && (
                  <span className="cnt">{wordCount} {wordCount === 1 ? 'word' : 'words'}</span>
                )}
                <textarea
                  ref={taRef}
                  rows={2}
                  value={text}
                  placeholder="What happened?"
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
                  }}
                  onPaste={e => {
                    const files = e.clipboardData?.files
                    if (files && files.length) { e.preventDefault(); void attach(files) }
                  }}
                />

                {/* Continuing a thread. Said plainly, with a way out — the
                    composer must never silently attach what you type to
                    something you have forgotten you clicked. */}
                {ledFrom && (
                  <div className="whenrow">
                    <span>
                      {relation === 'reflects'
                        ? 'This is a later thought about an earlier entry. It attaches to it rather than becoming its own.'
                        : 'This carries on from an earlier entry.'}
                    </span>
                    <Link className="clr" href="/">on its own instead</Link>
                    <Link className="clr" href={`/entry/${ledFrom}`}>see it</Link>
                  </div>
                )}
                {whenOpen && (
                  <div className="whenrow">
                    <span>It happened</span>
                    <input
                      type="date"
                      value={when}
                      max={new Date().toISOString().slice(0, 10)}
                      onChange={e => setWhen(e.target.value)}
                    />
                    {/* "2008 was a huge year" has no day in it. Say how much
                        of the date to believe rather than invent a day. */}
                    <div className="prec">
                      {PRECISION_LABELS.map(({ p, label }) => (
                        <button
                          key={p}
                          className={precision === p ? 'on' : ''}
                          onClick={() => setPrecision(p)}
                        >{label}</button>
                      ))}
                    </div>
                    {when && (
                      <button className="clr" onClick={() => { setWhen(''); setWhenOpen(false) }}>
                        today instead
                      </button>
                    )}
                  </div>
                )}

                <div className="bar2">
                  <button
                    className={`way mic${recording ? ' on' : ''}`}
                    onClick={() => void toggleMic()}
                    title={recording ? 'Stop' : 'Talk'}
                  ><MicIcon /></button>
                  <span className="sep" />
                  <label className="way" title="Files">
                    <FileIcon />
                    <input type="file" multiple onChange={e => {
                      if (e.target.files) void attach(e.target.files)
                      e.target.value = ''
                    }} />
                  </label>
                  <label className="way" title="Photos and video">
                    <PhotoIcon />
                    <input type="file" accept="image/*,video/*" multiple onChange={e => {
                      if (e.target.files) void attach(e.target.files)
                      e.target.value = ''
                    }} />
                  </label>
                  <button
                    className="way"
                    title="A link"
                    onClick={() => {
                      const u = window.prompt('Paste the link')
                      if (u) setText(t => (t ? `${t}\n${u}` : u))
                    }}
                  ><LinkIcon /></button>
                  <button
                    className={`when${when ? ' set' : ''}`}
                    onClick={() => setWhenOpen(o => !o)}
                  >{when ? whenLabel(when, precision) : 'when'}</button>
                  <Link className="focus" href="/now">full screen</Link>
                  <button
                    className="send"
                    title="Put it in · Enter"
                    disabled={!canSend}
                    onClick={() => void submit()}
                  ><SendIcon /></button>
                </div>
              </div>
            </div>

            {/* The receipt: what happened, and one undo. Then it's gone. */}
            <div className={`rcpt${receipt ? ' show' : ''}`}>
              {receipt && (
                <>
                  <b>In.</b>{receipt.line.replace(/^In\.\s*/, ' ')}
                  <button onClick={() => void undo()}>undo</button>
                </>
              )}
            </div>

            {/* ── Search: the way in, not a feature ────────────────────── */}
            <div className="find">
              <svg viewBox="0 0 14 14"><circle cx="6" cy="6" r="4.3" /><path d="M9.3 9.3 12.5 12.5" /></svg>
              <input
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search the log — a word, a name, a day"
                aria-label="Search the log"
              />
              {q && <button className="clr" onClick={() => setQ('')}>clear</button>}
            </div>

            {/* Typing "private" or "public" searches for the word, which
                returns the handful of entries that happen to contain it and
                looks exactly like an answer. The filter of the same name
                finds every one, including the entries that never say it. */}
            {filterOffer && (
              <div className="qhint">
                &ldquo;{q.trim()}&rdquo; is also a filter —{' '}
                <button onClick={() => { setQ(''); setFilter(filterOffer.k) }}>
                  {filterOffer.label}
                </button>{' '}
                finds every one, including entries that don&rsquo;t contain the word.
              </div>
            )}

            {/* ── Toolbar. Both controls read the same list, so they can
                   never disagree with the day dividers. ────────────────── */}
            <div className="bar">
              <div className="f">
                {filter === 'buried' && (
                  <button className="on" onClick={() => setFilter('all')}>
                    buried — back to the log
                  </button>
                )}
                {filter !== 'buried' && FILTERS.map(f => (
                  <button
                    key={f.k}
                    className={filter === f.k ? 'on' : ''}
                    onClick={() => setFilter(f.k)}
                  >{f.label}</button>
                ))}
              </div>
              <div className="r">
                <span>{loading ? '' : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}</span>
                <span>order:</span>
                <button className={order === 'happened' ? 'on' : ''} onClick={() => setOrder('happened')}>
                  when it happened
                </button>
                <button className={order === 'logged' ? 'on' : ''} onClick={() => setOrder('logged')}>
                  when I logged it
                </button>
              </div>
            </div>

            <WhileYouWereGone />

            {/* ── The feed ─────────────────────────────────────────────── */}
            <div id="feed">
              <LogDays items={items} order={order} q={q} onImage={openShot}
                        buriedByDay={filter === 'buried' ? undefined : buriedByDay} />
              <FoldedPeriods fold={fold} order={order} onImage={openShot} />

              {/* Day one is the same page as day one thousand. Nothing is
                  offered here that isn't offered when the log is full. */}
              {!loading && items.length === 0 && fold.length === 0 && (
                <div className="none">
                  {q ? (
                    <>Nothing in the log matches that.<button onClick={() => setQ('')}>clear the search</button></>
                  ) : filter !== 'all' ? (
                    <>Nothing under that filter.<button onClick={() => setFilter('all')}>everything</button></>
                  ) : 'Nothing in the log yet.'}
                </div>
              )}
            </div>

            <div className="asview">
              <span>Everything above is public unless marked otherwise.</span>
              {buried > 0 && (
                <Link href="/?filter=buried">{buried} buried</Link>
              )}
              <Link href="/public">See it as a stranger does →</Link>
            </div>
          </main>

          {/* ── The rail ───────────────────────────────────────────────── */}
          <aside className="rail">
            <OpenQuestions onAnswered={() => { void loadFeed() }} />
            <WrittenDown coverage={coverage} onYear={y => setQ(String(y))} />
            <ArrivedOnItsOwn items={items} />
            <WhatArrived />
            <OnThisDay />
            <SafeToClear />
            <Relog onDone={() => { void loadFeed() }} />
            {/* day-one.html: "The rail has nothing to show, so it says so in
                one line rather than showing empty boxes." Every card above
                hides itself when it is empty; this one would not, so on an
                empty log the whole rail becomes the one line. */}
            {items.length > 0 ? (
              <div className="rc">
                <div className="h"><Link href="/ready">Ready to send</Link></div>
                <div className="i">
                  What the machine has drawn out of the record — drafts,
                  clips, candidates.
                  <em>suggestions, not the record</em>
                </div>
              </div>
            ) : !loading && (
              <div className="quiet">Nothing to show until there is something in the log.</div>
            )}
          </aside>
        </div>

        <footer className="ft">
          <span>neolog · the log · private</span>
          <span className="r">
            <Link href="/now">now</Link>
            <Link href="/search">search</Link>
            <Link href="/pages">the index</Link>
            <Link href="/public">what&rsquo;s public</Link>
            <Link href="/export">export</Link>
            <Link href="/ways-in">ways in</Link>
          </span>
        </footer>

        {/* Click the image → a lightbox over the feed; you never leave. */}
        <LogLightbox shots={shots} index={shotAt} onClose={() => setShotAt(null)} onIndex={setShotAt} />
      </div>
    </Shell>
  )
}

// ── What arrived on its own ───────────────────────────────────────────────
// Derived from the rows, not written by hand. The design's card breaks the
// count down by where things came from, and a hand-written sentence would go
// stale the first time the mix changed.

function ArrivedOnItsOwn({ items }: { items: LogEntry[] }) {
  const arrived = items.filter(i => i.author === 'log')
  if (!arrived.length) return null

  const bySource: Record<string, number> = {}
  for (const i of arrived) {
    const k = i.source === 'vlog' ? 'recordings'
      : i.source === 'photo' ? 'photos'
      : i.media.length ? 'files'
      : 'lines the log wrote'
    bySource[k] = (bySource[k] || 0) + 1
  }
  const parts = Object.entries(bySource)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${k}`)

  return (
    <div className="rc">
      <div className="h">Arrived on its own <span>{arrived.length}</span></div>
      <div className="i">
        {parts.join(' · ')}
        <em>every line the log wrote is correctable in one tap</em>
      </div>
    </div>
  )
}

// ── While you were gone ───────────────────────────────────────────────────
// away.html is mostly a list of things the log refuses to do. No welcome
// back, no broken streak, no badge, no unread count, no queue to clear. Its
// own summary line is "all filed · nothing waiting", and the point of the
// band is to say that the days are not empty rather than to ask him to do
// anything about them.

function WhileYouWereGone() {
  const [a, setA] = useState<{
    away: boolean; days: number; total: number
    parts: { label: string; n: number }[]
  } | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v2/away', { cache: 'no-store' })
        if (res.ok) setA(await res.json())
      } catch { /* the band just doesn't show */ }
    })()
  }, [])

  if (!a?.away) return null

  const list = a.parts.map(p => `${p.n} ${p.label}`).join(', ')

  return (
    <div className="gone">
      <b>{a.days} days without writing anything.</b>{' '}
      {a.total > 0 ? (
        <>
          {list} arrived on their own, so the days aren&rsquo;t empty — they
          just have no words on them. All filed; nothing waiting.
        </>
      ) : (
        <>Nothing arrived either. The days are simply blank.</>
      )}
    </div>
  )
}

// ── What arrived ──────────────────────────────────────────────────────────
// triage.html's rule is that skipping the pile costs nothing, so this card
// is an offer and never a queue: no unread badge, nothing blocked on it, and
// the copy says outright that ignoring it is fine.

function WhatArrived() {
  const [n, setN] = useState(0)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v2/triage', { cache: 'no-store' })
        if (res.ok) setN(((await res.json()) as { total: number }).total || 0)
      } catch { /* the card just doesn't show */ }
    })()
  }, [])
  if (n <= 0) return null
  return (
    <div className="rc">
      <div className="h">Arrived, not looked at <span>{n}</span></div>
      <div className="i">
        <b>All of it is already filed.</b>
        <em>
          Going through it adds your words. Skipping it costs nothing — it
          stays on the log either way, and stays searchable.
        </em>
        <div className="fixrow">
          <Link href="/triage"><button>Go through it</button></Link>
        </div>
      </div>
    </div>
  )
}

// ── On this day ───────────────────────────────────────────────────────────
// The only resurfacing in the product, and the restraint is the feature.
// One line in the rail: what was written on this date in another year, as it
// was written. No "one year ago today", no count, no nudge.

function OnThisDay() {
  const [row, setRow] = useState<{ year: number; text: string; id: string } | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v2/onthisday', { cache: 'no-store' })
        if (!res.ok) return
        const r = await res.json() as { years: { year: number; entries: { id: string; text: string }[] }[] }
        // The most recent other year that had something. One, not a list.
        const y = (r.years || []).find(v => v.year < new Date().getUTCFullYear() && v.entries.length)
        if (y) setRow({ year: y.year, text: y.entries[0].text, id: y.entries[0].id })
      } catch { /* the card just doesn't show */ }
    })()
  }, [])
  if (!row) return null
  return (
    <div className="rc">
      <div className="h">On this day <span>{row.year}</span></div>
      <Link className="i" href="/onthisday" style={{ display: 'block' }}>
        {row.text.length > 150 ? `${row.text.slice(0, 148)}…` : row.text}
      </Link>
    </div>
  )
}

// ── Safe to clear your phone ──────────────────────────────────────────────
// The loop the log exists to close. Only appears when the log can honestly
// say something is safe to delete — it never nags, and it never guesses.

function SafeToClear() {
  const [s, setS] = useState<{ clearable: number; clearable_bytes: number } | null>(null)
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/v2/clear', { cache: 'no-store' })
        if (res.ok) setS(await res.json())
      } catch { /* the card just doesn't show */ }
    })()
  }, [])
  if (!s || s.clearable <= 0) return null
  const gb = s.clearable_bytes >= 1e9
    ? `${(s.clearable_bytes / 1e9).toFixed(1)} GB`
    : `${Math.round(s.clearable_bytes / 1e6)} MB`
  return (
    <div className="rc">
      <div className="h">Safe to clear <span>{s.clearable} files</span></div>
      <div className="i">
        <b>{gb} is kept and checked.</b>
        <em>
          Verified against what your phone sent, not just uploaded. Safe to
          delete locally.
        </em>
        <div className="fixrow">
          <Link href="/clear"><button>See what</button></Link>
        </div>
      </div>
    </div>
  )
}

// ── Relog ─────────────────────────────────────────────────────────────────
// The recordings are already here, already transcribed, already extracted.
// What was SAID in them is not on the log until this runs. It pages through
// the corpus, so a long run is a series of short requests rather than one
// that times out, and it is idempotent — stopping halfway and starting again
// loses nothing.

function Relog({ onDone }: { onDone: () => void }) {
  const [status, setStatus] = useState<{ vlogs: number; threads: number; relogged: number; remaining: number } | null>(null)
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(0)
  const stop = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/relog', { cache: 'no-store' })
      if (res.ok) setStatus(await res.json())
    } catch { /* the card just doesn't show */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = useCallback(async () => {
    setRunning(true)
    stop.current = false
    let cursor: string | null = null
    let written = 0
    try {
      for (;;) {
        if (stop.current) break
        const res: Response = await fetch('/api/v2/log/relog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, limit: 20 }),
        })
        if (!res.ok) break
        const r = await res.json() as { entries_written: number; next_cursor: string | null }
        written += r.entries_written
        setDone(written)
        cursor = r.next_cursor
        if (!cursor) break
      }
    } finally {
      setRunning(false)
      await load()
      onDone()
    }
  }, [load, onDone])

  if (!status) return null
  if (status.remaining <= 0 && !running && done === 0) return null

  return (
    <div className="rc">
      <div className="h">
        Recordings not on the log <span>{status.relogged} of {status.threads}</span>
      </div>
      <div className="i">
        {running ? (
          <>
            <b>Putting them on the log.</b>
            <em>{done} {done === 1 ? 'entry' : 'entries'} so far — you can leave this page.</em>
          </>
        ) : done > 0 ? (
          <>
            <b>Done. {done} {done === 1 ? 'entry' : 'entries'} added.</b>
            <em>Each one sits at the second it was said.</em>
          </>
        ) : (
          <>
            <b>{status.remaining} things you said are not on the log.</b>
            <em>
              They are in {status.vlogs} recordings that were already
              transcribed. This puts each one on the day and the minute it was
              said. Nothing is written or rephrased — your words, where a
              recording has them.
            </em>
          </>
        )}
        <div className="fixrow">
          {running ? (
            <button onClick={() => { stop.current = true }}>Stop</button>
          ) : (
            <button className="p" onClick={() => void run()}>
              {done > 0 ? 'Check for more' : 'Put them on the log'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── The written-down bar: the door to thin years ──────────────────────────

function WrittenDown({ coverage, onYear }: {
  coverage: Record<string, number>
  onYear: (y: number) => void
}) {
  const stats = useMemo(() => {
    const years = Object.keys(coverage).map(Number).filter(y => !isNaN(y) && y > 1900)
    if (!years.length) return null
    const to = Math.max(new Date().getUTCFullYear(), ...years)
    const from = Math.min(...years)
    const max = Math.max(...Object.values(coverage))
    const bars: { y: number; n: number; h: number }[] = []
    for (let y = from; y <= to; y++) {
      const n = coverage[String(y)] || 0
      bars.push({ y, n, h: max ? Math.max(2, Math.round((n / max) * 100)) : 2 })
    }
    return {
      bars, from, to, max,
      covered: bars.filter(v => v.n > 0).length,
      thin: bars.filter(v => v.n > 0 && v.n / max < 0.09).length,
    }
  }, [coverage])

  if (!stats) return null
  const pct = Math.round((stats.covered / stats.bars.length) * 100)

  return (
    <div className="rc">
      <div className="h">Written down <span>{stats.from} – {stats.to} · click a year</span></div>
      <div className="yrs">
        {stats.bars.map(v => (
          <i
            key={v.y}
            style={{
              height: `${v.h}%`,
              background: v.n === 0
                ? 'var(--line-2)'
                : v.n / stats.max < 0.09 ? 'var(--t-ochre)' : 'var(--sig)',
            }}
            title={`${v.y} — ${v.n} ${v.n === 1 ? 'entry' : 'entries'} · click to see what's there`}
            onClick={() => onYear(v.y)}
          />
        ))}
      </div>
      <div className="yl"><span>{stats.from}</span><span>{stats.to}</span></div>
      <div className="i">
        {pct}% of these years has anything on it.
        {stats.thin > 0 && (
          <> <b>{stats.thin} {stats.thin === 1 ? 'year is' : 'years are'} nearly empty.</b></>
        )}
        <em>this is where filling in the past starts</em>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${Math.round(b / 1e3)} KB`
}

function whenLabel(iso: string, p: DatePrecision): string {
  const d = new Date(`${iso}T12:00:00Z`)
  if (isNaN(d.getTime())) return 'when'
  if (p === 'year') return `${d.getUTCFullYear()}`
  if (p === 'month') return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}

