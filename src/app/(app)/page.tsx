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
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [order, setOrder] = useState<'happened' | 'logged'>('happened')
  const [q, setQ] = useState('')
  const [lightbox, setLightbox] = useState<string | null>(null)

  const loadFeed = useCallback(async () => {
    try {
      const params = new URLSearchParams({ order, filter, limit: '200' })
      if (q.trim()) params.set('q', q.trim())
      const res = await fetch(`/api/v2/log?${params}`, { cache: 'no-store' })
      if (!res.ok) { setItems([]); return }
      const data = await res.json() as { items: LogEntry[]; buried: number }
      setItems(data.items || [])
      setBuried(data.buried || 0)
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
    })
    if (!r) return
    // Receipt, then silence. Nothing is asked.
    setWhen('')
    setWhenOpen(false)
    setPrecision('exact')
    if (receiptTimer.current) clearTimeout(receiptTimer.current)
    receiptTimer.current = setTimeout(() => intake.setReceipt(null), 8000)
    taRef.current?.focus()
  }, [intake, when, precision])

  const undo = useCallback(async () => {
    await intake.undo()
  }, [intake])

  // ── Day groups ──────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const out: { key: string; title: string; sub: string; rows: LogEntry[] }[] = []
    const now = new Date()
    for (const e of items) {
      const date = order === 'logged' ? e.logged_at : e.happened_at
      const key = dayKeyFor(date, order === 'logged' ? 'exact' : e.date_precision)
      const last = out[out.length - 1]
      if (last && last.key === key) last.rows.push(e)
      else {
        const h = dayHeadingFor(key, now)
        out.push({ key, title: h.title, sub: h.sub, rows: [e] })
      }
    }
    return out
  }, [items, order])

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

            {/* ── Toolbar. Both controls read the same list, so they can
                   never disagree with the day dividers. ────────────────── */}
            <div className="bar">
              <div className="f">
                {FILTERS.map(f => (
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

            {/* ── The feed ─────────────────────────────────────────────── */}
            <div id="feed">
              {groups.map(g => (
                <div key={g.key}>
                  <div className="day"><b>{g.title}</b>{g.sub}</div>
                  {g.rows.map(e => (
                    <Row key={`${e.source}-${e.id}`} e={e} order={order} q={q} onImage={setLightbox} />
                  ))}
                </div>
              ))}

              {/* Day one is the same page as day one thousand. Nothing is
                  offered here that isn't offered when the log is full. */}
              {!loading && items.length === 0 && (
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
              {buried > 0 && <span>{buried} buried</span>}
              <Link href="/published">See it as a stranger does →</Link>
            </div>
          </main>

          {/* ── The rail ───────────────────────────────────────────────── */}
          <aside className="rail">
            <WrittenDown items={items} />
            <div className="rc">
              <div className="h">
                Arrived on its own <span>{items.filter(i => i.author === 'log').length}</span>
              </div>
              <div className="i">
                Recordings, photos and files the log placed and described itself.
                <em>every line it wrote is correctable in one tap</em>
              </div>
            </div>
            <Relog onDone={() => { void loadFeed() }} />
            <div className="rc">
              <div className="h"><Link href="/ready">Ready to send</Link></div>
              <div className="i">
                What the machine has drawn out of the record — drafts, clips,
                candidates.
                <em>suggestions, not the record</em>
              </div>
            </div>
          </aside>
        </div>

        {/* Click the image → a lightbox over the feed; you never leave. */}
        {lightbox && (
          <div className="lb" onClick={() => setLightbox(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={lightbox} alt="" />
          </div>
        )}
      </div>
    </Shell>
  )
}

// ── A row ─────────────────────────────────────────────────────────────────

function Row({ e, order, q, onImage }: {
  e: LogEntry
  order: 'happened' | 'logged'
  q: string
  onImage: (url: string) => void
}) {
  const date = order === 'logged' ? e.logged_at : e.happened_at
  const precision: DatePrecision = order === 'logged' ? 'exact' : e.date_precision
  const fuzzy = order === 'happened' && isFuzzy(e.date_precision)
  const tags = tagsFor(e)
  const image = e.media.find(m => m.kind === 'image')
  const video = e.media.find(m => m.kind === 'video')
  const held = e.visibility === 'held'

  const body = (
    <>
      <div className={`t${fuzzy ? ' fz' : ''}`}>{stampFor(date, precision)}</div>
      <div>
        <div className="x">
          <span className="s">{highlight(e.sentence, q)}</span>
          <span className="tags">
            {tags.map((t, i) => (
              <i key={i} className={t.tone === 'plain' ? undefined : t.tone}>{t.text}</i>
            ))}
          </span>
        </div>

        {/* The row carries its context — the second line stays visible. */}
        {e.detail && !held && <div className="more">{highlight(e.detail, q)}</div>}

        {/* The log says what it saw, never an unnamed reason. */}
        {held && (
          <div className="more">
            <b>The log kept this back on its own.</b>{' '}
            {e.held_reason
              ? `It looks like ${e.held_reason}.`
              : 'It has not been looked at yet.'}{' '}
            Nothing about it is on the public log. You can publish it anyway,
            but you have to say so.
          </div>
        )}

        {(image || video) && (
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
                      onClick={ev => { ev.preventDefault(); ev.stopPropagation(); onImage(image.url!) }}
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
            {held && <span className="cap">blurred here too, until you say otherwise</span>}
          </div>
        )}
      </div>
    </>
  )

  // A row links to its content. An entry with no page of its own is not
  // clickable — a destination is never invented to satisfy an affordance.
  return e.href
    ? <Link className={`en${held ? ' isheld' : ''}`} href={e.href}>{body}</Link>
    : <div className={`en${held ? ' isheld' : ''}`}>{body}</div>
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
      // Keep going until the server says there is no next page.
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
  // Nothing to say when the whole corpus is already on the log.
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

function WrittenDown({ items }: { items: LogEntry[] }) {
  const stats = useMemo(() => {
    const counts = new Map<number, number>()
    for (const e of items) {
      const y = new Date(e.happened_at).getUTCFullYear()
      if (!isNaN(y)) counts.set(y, (counts.get(y) || 0) + 1)
    }
    if (!counts.size) return null
    const to = new Date().getUTCFullYear()
    const from = Math.min(...Array.from(counts.keys()))
    const max = Math.max(...Array.from(counts.values()))
    const years: { y: number; n: number; h: number }[] = []
    for (let y = from; y <= to; y++) {
      const n = counts.get(y) || 0
      years.push({ y, n, h: max ? Math.max(2, Math.round((n / max) * 100)) : 2 })
    }
    return {
      years, from, to, max,
      covered: years.filter(v => v.n > 0).length,
      thin: years.filter(v => v.n > 0 && v.n / max < 0.09).length,
    }
  }, [items])

  if (!stats) return null
  const pct = Math.round((stats.covered / stats.years.length) * 100)

  return (
    <div className="rc">
      <div className="h">Written down <span>{stats.from} – {stats.to}</span></div>
      <div className="yrs">
        {stats.years.map(v => (
          <i
            key={v.y}
            style={{
              height: `${v.h}%`,
              background: v.n === 0
                ? 'var(--line-2)'
                : v.n / stats.max < 0.09 ? 'var(--t-ochre)' : 'var(--sig)',
            }}
            title={`${v.y} — ${v.n} ${v.n === 1 ? 'entry' : 'entries'}`}
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

/**
 * A search result shows its reason: the matched term is marked. Searching
 * text the reader cannot see is worse than no search.
 */
function highlight(s: string, q: string): ReactNode {
  const term = q.trim()
  if (!term) return s
  const i = s.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return s
  return <>{s.slice(0, i)}<mark>{s.slice(i, i + term.length)}</mark>{s.slice(i + term.length)}</>
}
