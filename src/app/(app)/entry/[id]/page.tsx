'use client'

/**
 * An entry.
 *
 * The entry page IS the expansion (SPEC §11) — there is no expand-in-place
 * gesture on the feed, so this is where a row's second line becomes the
 * whole thing: the file at full size, the transcript, both dates, and who
 * wrote each line.
 *
 * "A page is the log filtered, not a report about a subject" — same
 * masthead, same frame, same type as the feed, with a compact header on
 * top. Everything that is not the entry goes in the rail, and what's in the
 * rail here is the corrections, because **the fix lives where the mistake
 * is**: no settings screen, no review queue, no confirmation dialog.
 *
 * The log guesses about twenty times a day. It cannot be built on being
 * right; it is built on being cheap to correct (`wrong.html`).
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { type DatePrecision, stampFor, isFuzzy, clockDuration } from '@/lib/log-entry'
import { entrySchema } from '@/lib/entry-schema'
import { asCorrectedBy, describeCorrection } from '@/lib/corrections'

interface Entry {
  id: string
  text: string
  detail: string | null
  happened_at: string
  logged_at: string
  date_precision: DatePrecision
  kind: string
  visibility: 'public' | 'private' | 'held'
  held_reason: string | null
  author: 'operator' | 'log' | 'drafted'
  source_kind: string
  buried_at: string | null
  r2_key: string | null
  mime: string | null
  duration_seconds: number | null
  transcript: string | null
  link_url: string | null
  original_filename: string | null
  media_url: string | null
  vlog_id: string | null
  source_ref: string | null
  span_start: number | null
  span_end: number | null
  grounded: number | null
  transcript_segments: string | null
  led_from: string | null
  came_from?: Turn | null
  led_to?: Turn[]
  earlier?: { id: string; text: string } | null
  later?: { id: string; text: string } | null
  on_pages?: { id: string; name: string; kind: string }[]
  copies?: { id: string; logged_at: string }[]
  revisions?: Revision[]
}

interface Turn {
  id: string
  text: string
  happened_at: string
  date_precision: DatePrecision
}

interface Revision {
  field: string
  old_value: string | null
  new_value: string | null
  created_at: string
  /** Some of these the log made. A line the log wrote is marked as the
      log's, always — including here (§0 rule 3). */
  by_whom: string | null
}

const AUTHOR_LINE: Record<string, string> = {
  operator: 'You said it.',
  log:      'The log wrote this line, from the file.',
  drafted:  'The log drafted it; you edited it.',
}

/** A neighbour's line, cut to a glance — the design shows about this much. */
function shorten(t: string, n = 62): string {
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length <= n ? one : one.slice(0, n - 1).replace(/\s\S*$/, '') + '…'
}

export default function EntryPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [e, setE] = useState<Entry | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [fixingDate, setFixingDate] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newPrecision, setNewPrecision] = useState<DatePrecision>('exact')
  const [newYear, setNewYear] = useState('')
  const [sheet, setSheet] = useState(false)
  // Pointing at the word the second thought starts on. The read path's one
  // honest limitation is a MISSED seam — two thoughts in one entry — and
  // this is where he says so.
  const [splitting, setSplitting] = useState(false)
  const [splitSaid, setSplitSaid] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/log/${params.id}`, { cache: 'no-store' })
      if (!res.ok) { setE(null); return }
      setE(await res.json() as Entry)
    } catch { setE(null) }
    finally { setLoading(false) }
  }, [params.id])

  useEffect(() => { void load() }, [load])

  const patch = useCallback(async (body: Record<string, unknown>) => {
    await fetch(`/api/v2/log/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    await load()
  }, [params.id, load])

  // The cut is made by the server, which knows whether the entry is still
  // exactly what the recording says. The line below says which check ran,
  // the same way /clear names the one it used.
  const splitAt = useCallback(async (atWord: number) => {
    const res = await fetch(`/api/v2/log/${params.id}/split`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ at_word: atWord }),
    })
    const j = await res.json().catch(() => ({})) as { cut_by?: string; error?: string }
    setSplitting(false)
    setSplitSaid(
      j.error ? j.error
        : j.cut_by === 'timings'
          ? 'Two entries. The second is dated to the second you said it.'
          : 'Two entries, both dated as this one was — the log has no second for the new one.',
    )
    await load()
  }, [params.id, load])

  const [detailEditing, setDetailEditing] = useState(false)
  const [detailDraft, setDetailDraft] = useState('')
  // A description he has corrected is his. The revision record already says
  // so, so nothing new is stored to know it.
  const detailIsHis = !!e?.revisions?.some(r => r.field === 'detail')

  // Described from the entry on screen, never re-fetched. `origin` is read
  // in the browser so a deployed page and a preview each describe themselves.
  const schema = useMemo(
    () => (e
      ? entrySchema(e, { origin: typeof window === 'undefined' ? '' : window.location.origin })
      : null),
    [e],
  )

  if (loading) return <Shell><div className="logpage" /></Shell>
  if (!e) {
    return (
      <Shell>
        <div className="logpage pg-entry">
          <div className="back"><Link href="/">the log</Link></div>
          <div className="none">That entry isn&rsquo;t in the log.</div>
        </div>
      </Shell>
    )
  }

  // Whisper's timed segments, when the intake kept them.
  let segments: { s: number; t: string }[] = []
  try {
    const parsed = JSON.parse(e.transcript_segments || '[]')
    if (Array.isArray(parsed)) segments = parsed.filter(x => x && typeof x.s === 'number' && x.t)
  } catch { /* an older entry has none; the blob below still renders */ }

  const held = e.visibility === 'held'
  const isImage = (e.mime || '').startsWith('image/')
  const isAudio = (e.mime || '').startsWith('audio/')
  const isVideo = (e.mime || '').startsWith('video/')
  const gap = daysBetween(e.happened_at, e.logged_at)

  return (
    <Shell>
      <div className="logpage pg-entry">
        <div className="back">
          <Link href="/">the log</Link>
          <span>·</span>
          <span>{stampFor(e.happened_at, e.date_precision)}</span>
          {e.buried_at && <><span>·</span><span>buried</span></>}
        </div>

        <div className="grid">
          <main>
            <div className="ehead">
              {editing ? (
                <>
                  <textarea
                    value={draft}
                    onChange={ev => setDraft(ev.target.value)}
                    style={{
                      width: '100%', maxWidth: 640, minHeight: 140,
                      background: 'var(--bg-2)', border: '1px solid var(--line-1)',
                      borderRadius: 10, color: 'var(--fg)', padding: '14px 16px',
                      fontSize: 17, lineHeight: 1.5, fontWeight: 300,
                      fontFamily: 'var(--font-body)', resize: 'vertical',
                    }}
                  />
                  <div className="fixrow" style={{ marginTop: 10 }}>
                    <button className="p" onClick={async () => { await patch({ text: draft }); setEditing(false) }}>
                      Save
                    </button>
                    <button onClick={() => setEditing(false)}>Cancel</button>
                  </div>
                </>
              ) : splitting ? (
                /* fix.html's gesture, on the line instead of the transcript:
                   point at a word, and the entry becomes two. Every word is
                   a target except the first — a cut before the first word
                   is not a cut. */
                <h1 className="cutting">
                  {e.text.trim().split(/\s+/).filter(Boolean).map((w, i) => (
                    i === 0
                      ? <span key={i}>{w}</span>
                      : <button key={i} className="cut" onClick={() => void splitAt(i)}>{' '}{w}</button>
                  ))}
                </h1>
              ) : (
                <h1>{e.text}</h1>
              )}
              {splitting && (
                <div className="fixrow" style={{ marginTop: 10 }}>
                  <span className="say">
                    Click the word the second thought starts on. Nothing is
                    rewritten — the words are the ones already there.
                  </span>
                  <button onClick={() => setSplitting(false)}>Never mind</button>
                </div>
              )}
              {splitSaid && !splitting && (
                <div className="fixrow" style={{ marginTop: 10 }}>
                  <span className="say">{splitSaid}</span>
                </div>
              )}

              {/* Two dates, always. The distance between them is the signal. */}
              <div className="meta">
                <span>
                  Happened <b>{stampFor(e.happened_at, e.date_precision)}</b>
                  {isFuzzy(e.date_precision) && ' — the log had to guess this'}
                </span>
                <span>Logged <b>{fullDate(e.logged_at)}</b></span>
                {gap !== null && gap > 0 && (
                  <span>{gap} {gap === 1 ? 'day' : 'days'} between</span>
                )}
                <span>{AUTHOR_LINE[e.author] || ''}</span>
                <span>{KIND_WORD[e.kind] || e.kind}</span>
                {e.duration_seconds ? <span>{clockDuration(e.duration_seconds)}</span> : null}
              </div>
            </div>

            {/* `image.html`: "what it shows marked as the operator's or the
                log's." There is no author column on the description and it
                does not need one — once a `detail` revision exists the words
                are his, which is derived rather than stored twice. */}
            {e.detail && !held && (
              detailEditing ? (
                <div className="paste" style={{ margin: '14px 0 0' }}>
                  <textarea
                    value={detailDraft}
                    onChange={ev => setDetailDraft(ev.target.value)}
                    rows={4}
                  />
                  <div className="bar">
                    <button
                      className="p"
                      onClick={async () => { await patch({ detail: detailDraft }); setDetailEditing(false) }}
                    >Keep my words</button>
                    <button onClick={() => setDetailEditing(false)}>Not now</button>
                    <span className="say">The log&rsquo;s wording is kept, dated.</span>
                  </div>
                </div>
              ) : (
                <div className="lede">
                  {e.detail}
                  {e.author !== 'operator' && !detailIsHis && (
                    <em style={{
                      display: 'block', fontStyle: 'normal', marginTop: 8,
                      fontSize: 12.5, color: 'var(--fg-4)',
                    }}>
                      the log wrote this ·{' '}
                      <button
                        onClick={() => { setDetailDraft(e.detail || ''); setDetailEditing(true) }}
                        style={{ color: 'var(--fg-2)', borderBottom: '1px solid var(--line-2)' }}
                      >say what it actually shows</button>
                    </em>
                  )}
                </div>
              )
            )}

            {held && (
              <div className="lede">
                <b>The log kept this back on its own.</b>{' '}
                {e.held_reason || 'It has not been looked at yet.'}{' '}
                It is stored whole and kept out of every feed. You can publish
                it anyway — the log takes your word for it.
              </div>
            )}

            {e.link_url && (
              <div className="lede">
                <a href={e.link_url} target="_blank" rel="noopener noreferrer"
                   style={{ color: 'var(--sig)', borderBottom: '1px solid var(--line-2)' }}>
                  {e.link_url}
                </a>
              </div>
            )}

            {e.media_url && (
              <div className="entry-media">
                {isImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.media_url} alt="" className={held ? 'blur' : undefined} />
                )}
                {isAudio && <audio src={e.media_url} controls preload="metadata" />}
                {isVideo && <video src={e.media_url} controls preload="metadata" />}
                {!isImage && !isAudio && !isVideo && (
                  <a href={e.media_url} target="_blank" rel="noopener noreferrer"
                     style={{ color: 'var(--sig)', fontSize: 14 }}>
                    {e.original_filename || 'the file'}
                  </a>
                )}
              </div>
            )}

            {/* A thread is `led_from` followed either way. Both directions
                sit here rather than on a page of their own, so the turn you
                are reading always shows what it came out of and what came
                out of it — which is the whole of the mechanic. */}
            {(e.came_from || (e.led_to && e.led_to.length > 0)) && (
              <div className="turns">
                {e.came_from && (
                  <Link className="turn back" href={`/entry/${e.came_from.id}`}>
                    <span className="tl">came out of</span>
                    <span className="tx">
                      {e.came_from.text.length > 150
                        ? `${e.came_from.text.slice(0, 148)}…`
                        : e.came_from.text}
                      <em>{stampFor(e.came_from.happened_at, e.came_from.date_precision)}</em>
                    </span>
                  </Link>
                )}
                {(e.led_to || []).map(t => (
                  <Link className="turn fwd" href={`/entry/${t.id}`} key={t.id}>
                    <span className="tl">led to</span>
                    <span className="tx">
                      {t.text.length > 150 ? `${t.text.slice(0, 148)}…` : t.text}
                      <em>{stampFor(t.happened_at, t.date_precision)}</em>
                    </span>
                  </Link>
                ))}
                {/* Both neighbours are here; the whole route is one click on.
                    `walk.html`: "A page is a pile... A thread is a path." */}
                <Link className="turn all" href={`/walk/${e.id}`}>
                  <span className="tl">the route</span>
                  <span className="tx">
                    Follow it back to where it started, and forward to
                    everything that came out of it.
                  </span>
                </Link>
              </div>
            )}

            {/* Both versions kept, dated, marked revised by you. A record
                that quietly replaces what it used to say is not a record. */}
            {e.revisions && e.revisions.length > 0 && (
              <div className="revs">
                <div className="who">What this used to say</div>
                {e.revisions.map((r, i) => {
                  // ⚠️ "revised by you" was hard-coded here, and the log makes
                  // some of these: it rebuilds an entry from the transcript
                  // after he fixes a misheard word in its span. Signing the
                  // log's change with his name is the one thing this product
                  // does not do.
                  const by = asCorrectedBy(r.by_whom)
                  return (
                    <div className="rev" key={i}>
                      <span className="rt">{shortDate(r.created_at)}</span>
                      <span className="rb">
                        <b>{describeCorrection(r.field, by).line}</b>
                        {r.old_value && <span className="was">{r.old_value}</span>}
                        <em>{by === 'operator' ? 'revised by you' : 'changed by the log'}</em>
                      </span>
                    </div>
                  )
                })}
              </div>
            )}

            {/* The words are the ground truth; everything else indexes them. */}
            {e.transcript && segments.length > 0 ? (
              <div className="transcript">
                <div className="who">
                  Transcribed on arrival
                  {e.duration_seconds ? ` · ${clockDuration(e.duration_seconds)}` : ''}
                  {' '}· click a line to play from there
                </div>
                {/* Timed lines rather than one blob. "Verbatim spans are the
                    only ground truth" — and a span you cannot point at is
                    not much of a span. */}
                {segments.map((sg, i) => (
                  <button
                    className="tline"
                    key={i}
                    onClick={() => {
                      const el = document.querySelector<HTMLAudioElement>('.entry-media audio, .entry-media video')
                      if (el) { el.currentTime = sg.s; void el.play() }
                    }}
                  >
                    <span className="tt">{clockDuration(sg.s) || '0:00'}</span>
                    <span className="tw">{sg.t}</span>
                  </button>
                ))}
              </div>
            ) : e.transcript ? (
              <div className="transcript">
                <div className="who">
                  Transcribed on arrival
                  {e.duration_seconds ? ` · ${clockDuration(e.duration_seconds)}` : ''}
                  {' '}· the audio is kept, and these are the words the log reads
                </div>
                {e.transcript}
              </div>
            ) : null}

            {/* ── Who wrote what ──────────────────────────────────────────
                `entry.html`'s `.facts`. Only rows that are FACTS: who wrote
                the line, and how the log came to have it. The design's other
                row — "What came of it", a sentence about what the entry led
                to — is the log reading his life, and it is not built. */}
            <div className="facts">
              <div className="row">
                <div className="k">Who wrote what</div>
                <div className="v">
                  {e.author === 'operator'
                    ? 'Yours. Nothing here was drafted.'
                    : 'The log wrote this line, from what the file carried.'}
                  {e.transcript ? ' Transcribed on arrival; nothing added.' : ''}
                </div>
              </div>
              <div className="row">
                <div className="k">How it is dated</div>
                <div className="v">
                  {e.date_precision === 'exact'
                    ? 'By its own clock, to the minute.'
                    : `Approximate — placed to the ${e.date_precision}, and marked as a guess.`}
                </div>
              </div>
              {e.revisions && e.revisions.length > 0 && (
                <div className="row">
                  <div className="k">Corrections</div>
                  <div className="v">
                    {e.revisions.length} kept, dated, with what each replaced.
                    {' '}
                    <Link href="/corrections">every correction on the log</Link>
                  </div>
                </div>
              )}
            </div>

            {/* ── The entry either side ──────────────────────────────────
                `entry.html`'s `.ends`. The log in order, one step at a time.
                Both come from the API and always have; nothing rendered
                them. An end with nothing past it is a blank, not a dead
                link — a row with no destination is not clickable (SPEC
                §11). */}
            <div className="ends">
              {e.earlier
                ? (
                  <Link href={`/entry/${e.earlier.id}`}>
                    <span>earlier</span>← {shorten(e.earlier.text)}
                  </Link>
                )
                : <span />}
              <Link className="home" href="/">back to the log</Link>
              {e.later
                ? (
                  <Link className="nx" href={`/entry/${e.later.id}`}>
                    <span>later</span>{shorten(e.later.text)} →
                  </Link>
                )
                : <span />}
            </div>
          </main>

          {/* ── The corrections ─────────────────────────────────────────── */}
          <aside className="rail">
            <div className="rc">
              <div className="h">Fix it</div>

              <div className="i">
                <b>Wrong date?</b>
                <em>A year on its own is a complete answer.</em>
                {fixingDate ? (
                  <>
                    <div className="fixrow">
                      {(['exact', 'month', 'year'] as DatePrecision[]).map(p => (
                        <button
                          key={p}
                          className={newPrecision === p ? 'p' : ''}
                          onClick={() => setNewPrecision(p)}
                        >{p === 'exact' ? 'that day' : p === 'month' ? 'that month' : 'that year'}</button>
                      ))}
                    </div>
                    {/* A year on its own is a complete answer, so the control
                        has to be able to take one. `input type=date` cannot —
                        it demands a day, and demanding a day is how the log
                        ends up storing one it was never told. */}
                    {newPrecision === 'year' ? (
                      <input
                        type="number"
                        placeholder="2008"
                        min={1900}
                        max={new Date().getUTCFullYear()}
                        value={newYear}
                        onChange={ev => setNewYear(ev.target.value)}
                      />
                    ) : newPrecision === 'month' ? (
                      <input
                        type="month"
                        value={newDate.slice(0, 7)}
                        max={new Date().toISOString().slice(0, 7)}
                        onChange={ev => setNewDate(`${ev.target.value}-15`)}
                      />
                    ) : (
                      <input
                        type="date"
                        value={newDate}
                        max={new Date().toISOString().slice(0, 10)}
                        onChange={ev => setNewDate(ev.target.value)}
                      />
                    )}
                    <div className="fixrow">
                      <button
                        className="p"
                        disabled={newPrecision === 'year' ? !newYear : !newDate}
                        onClick={async () => {
                          // A year-only answer is stored mid-year so that
                          // ordering works, and the precision is what says
                          // not to believe the month or the day.
                          const iso = newPrecision === 'year'
                            ? new Date(`${newYear}-07-01T12:00:00Z`).toISOString()
                            : new Date(`${newDate}T12:00:00Z`).toISOString()
                          await patch({ happened_at: iso, date_precision: newPrecision })
                          setFixingDate(false)
                        }}
                      >Set it</button>
                      <button onClick={() => setFixingDate(false)}>Cancel</button>
                    </div>
                  </>
                ) : (
                  <div className="fixrow">
                    <button onClick={() => {
                      setNewDate(e.happened_at.slice(0, 10))
                      setNewYear(e.happened_at.slice(0, 4))
                      setNewPrecision(
                        e.date_precision === 'approx' || e.date_precision === 'day'
                          ? 'exact'
                          : e.date_precision,
                      )
                      setFixingDate(true)
                    }}>Change the date</button>
                  </div>
                )}
              </div>

              {/* A pasted document or conversation lands as the log's line,
                  because the log cannot know who wrote it. This is where he
                  says. It only moves one way — the log never takes
                  authorship back off him. */}
              {e.author === 'log' && (e.source_kind === 'document' || e.source_kind === 'chat') && (
                <div className="i">
                  <b>Did you write this?</b>
                  <em>
                    The log kept it without claiming it either way, because it
                    cannot know. If the words are yours, say so.
                  </em>
                  <div className="fixrow">
                    <button onClick={() => void patch({ author: 'operator' })}>
                      These are my words
                    </button>
                  </div>
                </div>
              )}

              <div className="i">
                <b>Wrong words?</b>
                <em>Your line, rewritten by you. Nothing else changes.</em>
                <div className="fixrow">
                  <button onClick={() => { setDraft(e.text); setEditing(true) }}>Edit the line</button>
                </div>
              </div>

              <div className="i">
                <b>Who can see it</b>
                {/* `entry.html` says the state in one coloured word and then
                    what it means in plain words — teal for public, because
                    steel is the log's one signal colour and a state is not a
                    signal. */}
                <em>
                  <span
                    className="state"
                    style={{
                      color: e.visibility === 'public' ? 'var(--t-teal)'
                        : e.visibility === 'held' ? 'var(--t-ochre)'
                        : 'var(--fg-3)',
                    }}
                  >{e.visibility}</span>
                  {' — '}
                  {e.visibility === 'public' ? 'a stranger can load this page.'
                    : e.visibility === 'private' ? 'only you, and that is your call.'
                    : 'the log is holding it back until you say otherwise.'}
                </em>
                <div className="acts fixrow">
                  {e.visibility !== 'public' && (
                    <button className="p" onClick={() => setSheet(true)}>
                      {e.visibility === 'held' ? 'Publish it anyway' : 'Make it public'}
                    </button>
                  )}
                  {e.visibility !== 'private' && (
                    <button onClick={() => void patch({ visibility: 'private' })}>Keep it private</button>
                  )}
                </div>
              </div>

              {/* There is no delete. Bury keeps the file, the attachments and
                  the relationships; digging up is itself an event. */}
              <div className="i">
                <b>{e.buried_at ? 'Buried' : 'Bury it'}</b>
                <em>
                  {e.buried_at
                    ? 'Out of the feed, search and counts. The file and everything attached is kept.'
                    : 'It leaves the feed, search and the counts. Nothing is deleted.'}
                </em>
                <div className="fixrow">
                  {e.buried_at ? (
                    <button className="p" onClick={() => void patch({ buried: false })}>Dig it up</button>
                  ) : (
                    <button onClick={async () => { await patch({ buried: true }); router.push('/') }}>
                      Bury it
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="rc">
              <div className="h">The thread</div>
              <div className="i">
                <b>Where did this go?</b>
                <em>
                  A thread is one thing: each turn points at the turn it came
                  out of. Nothing is created, named or closed.
                </em>
                <div className="fixrow">
                  <Link href={`/?led_from=${e.id}`}>
                    <button className="p">Write what this led to</button>
                  </Link>
                </div>
              </div>
              {/* The log split a take into parts it thought were separate.
                  This is where he says two of them were one thing —
                  "wrong split → merge, thread intact" (wrong.html). Only
                  offered on a part, because only a part can be a bad seam. */}
              {e.came_from && (
                <div className="i">
                  <b>One thing, not two?</b>
                  <em>
                    The log split the take it came from. If this belongs with
                    what came before it, join them — nothing is lost either way.
                  </em>
                  <div className="fixrow">
                    <button
                      onClick={async () => {
                        await patch({ merge_into: e.came_from!.id })
                        router.push(`/entry/${e.came_from!.id}`)
                      }}
                    >Join it to that one</button>
                  </div>
                </div>
              )}

              {/* The other direction, and the one the read path actually
                  fails at. A missed seam leaves two thoughts in one entry:
                  the splitter can pass over a subject change, and the pause
                  fallback is coarser still, because he changes subject
                  without breathing. Nothing is rewritten — the cut is made
                  in his own words, and in the recording's own timings when
                  the entry is still exactly what they say. */}
              {e.text.trim().split(/\s+/).filter(Boolean).length > 1 && !editing && (
                <div className="i">
                  <b>Two things, not one?</b>
                  <em>
                    If the log ran two thoughts together, point at the word
                    the second one starts on. Both halves keep your words and
                    the old wording is kept, dated.
                  </em>
                  <div className="fixrow">
                    <button
                      className={splitting ? 'p' : undefined}
                      onClick={() => { setSplitSaid(null); setSplitting(v => !v) }}
                    >{splitting ? 'Pick the word above' : 'Cut it in two'}</button>
                  </div>
                </div>
              )}

              <div className="i">
                <b>Thought about it again?</b>
                <em>
                  A later thought about this attaches to it. It never becomes
                  a second event — the thing happened once.
                </em>
                <div className="fixrow">
                  <Link href={`/?led_from=${e.id}&relation=reflects`}>
                    <button>Add a later thought</button>
                  </Link>
                </div>
              </div>
            </div>

            <div className="rc">
              <div className="h">The record of origin</div>
              <div className="i">
                <b>Prove you thought it.</b>
                <em>
                  A finished piece no longer proves anyone thought it — anyone
                  can produce one. The road to it does: this entry, the turns
                  either side, every wording it has had, each dated.
                </em>
                <div className="fixrow">
                  <a href={`/api/v2/export?entry_id=${e.id}&format=md`} download>
                    <button>Take the road out</button>
                  </a>
                </div>
              </div>
            </div>

            <div className="rc">
              <div className="h">Where it came from</div>
              <div className="i">
                {sourceLine(e)}
                <em>{AUTHOR_LINE[e.author]}</em>
                {e.vlog_id && (
                  <div className="fixrow">
                    {/* Open the recording at the second this was said, not
                        at the top of a 22-minute file. */}
                    <Link
                      href={e.span_start != null
                        ? `/vlog/${e.vlog_id}?t=${Math.floor(e.span_start)}`
                        : `/vlog/${e.vlog_id}`}
                    >
                      <button>
                        {e.span_start != null
                          ? `Open the recording at ${clockDuration(e.span_start)}`
                          : 'Open the recording'}
                      </button>
                    </Link>
                  </div>
                )}
              </div>
              {/* A relogged line came out of a recording that already
                  existed. Saying so is the difference between a quote and
                  an assertion. */}
              {e.source_ref?.startsWith('thread:') && (
                <div className="i">
                  <b>This was said out loud.</b>
                  <em>
                    Taken from a recording already on the log, placed at the
                    moment it was said. The video is the ground truth; this
                    line is the part of it that stands on its own.
                  </em>
                  {/* Whether the line is his words or the log's is not a
                      matter of opinion here — it was checked against the
                      transcript, and this says which. */}
                  {e.grounded === 1 && (
                    <em>
                      Checked word for word against the recording&rsquo;s own
                      transcript. These are his words.
                    </em>
                  )}
                  {e.grounded === 0 && (
                    <em>
                      No part of this appeared word for word in the
                      transcript, so it is kept as the log&rsquo;s summary
                      rather than as a quote.
                    </em>
                  )}
                </div>
              )}
            </div>
          </aside>
        </div>
        {/* publish.html: "Left: what you have. Right: what a stranger would
            see. Nothing on the right that isn't on the left." No queue, no
            drafts folder, no schedule — one entry, one decision. */}
        {sheet && (
          <div className="sheetwrap" onClick={ev => { if (ev.target === ev.currentTarget) setSheet(false) }}>
            <div className="sheet">
              <div className="sh-head">
                <b>Make this entry public?</b>
                <span>
                  {stampFor(e.happened_at, e.date_precision)} · one entry · nothing else changes
                </span>
              </div>
              <div className="sh-cols">
                <div className="sh-col">
                  <div className="sh-k">What you have — stays private</div>
                  <div className="sh-body">{e.text}</div>
                  {e.detail && <div className="sh-sub">{e.detail}</div>}
                  {/* The private context behind it, named rather than
                      silently carried across. */}
                  {(e.came_from || (e.led_to && e.led_to.length > 0) || e.transcript || e.media_url) && (
                    <div className="sh-sub">
                      Behind it:{' '}
                      {[
                        e.transcript ? 'the recording and its transcript' : null,
                        e.media_url && !e.transcript ? 'the file' : null,
                        e.came_from ? 'the entry this came out of' : null,
                        (e.led_to?.length || 0) > 0
                          ? `${e.led_to!.length} later ${e.led_to!.length === 1 ? 'turn' : 'turns'}`
                          : null,
                      ].filter(Boolean).join(', ')}. None of it goes with this.
                    </div>
                  )}
                </div>
                <div className="sh-col">
                  <div className="sh-k">What a stranger would see</div>
                  <div className="sh-body">{e.text}</div>
                  <div className="sh-sub">
                    {stampFor(e.happened_at, e.date_precision)}
                    {isFuzzy(e.date_precision) ? ' · from memory' : ' · written down at the time'}
                    {e.author === 'log' ? ' · written by the log' : ''}
                  </div>
                </div>
              </div>
              <div className="sh-note">
                Nothing on the right that isn&rsquo;t on the left. It appears on
                the public log, which still needs signing in until you open it.
              </div>
              <div className="sh-act">
                <button
                  className="p"
                  onClick={async () => { await patch({ visibility: 'public' }); setSheet(false) }}
                >Make it public</button>
                <button onClick={() => setSheet(false)}>Not now</button>
              </div>
            </div>
          </div>
        )}

        {/* Readable as data, in this page's own source rather than as a
            second feed (`footage.html`). Built from the entry already on
            screen, so it cannot claim something the page does not show. A
            private or held entry produces nothing at all. */}
        {schema && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
        )}
      </div>
    </Shell>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────

/** The seven kinds, as the word that goes on a page rather than a slug. */
const KIND_WORD: Record<string, string> = {
  happened:  'something that happened',
  said:      'something you said',
  seen:      'something you saw',
  made:      'something you made',
  read:      'something that arrived',
  paperwork: 'paperwork',
  ideas:     'an idea',
}

function trim(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > 64 ? `${t.slice(0, 62)}…` : t
}


function shortDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fullDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

function daysBetween(a: string, b: string): number | null {
  const x = new Date(a).getTime()
  const y = new Date(b).getTime()
  if (isNaN(x) || isNaN(y)) return null
  return Math.round(Math.abs(y - x) / 86400000)
}

/** What the log knows about where this came from — and nothing more. */
function sourceLine(e: Entry): string {
  switch (e.source_kind) {
    case 'voice': return 'Talked into the box.'
    case 'file':  return e.original_filename ? `A file: ${e.original_filename}` : 'A file dropped in.'
    case 'link':  return 'A link, pasted.'
    case 'batch': return 'One act of putting things in.'
    case 'vlog':  return 'Said out loud, in a recording.'
    default:      return 'Typed into the box.'
  }
}
