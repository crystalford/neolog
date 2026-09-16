'use client'

/**
 * The log of its own mistakes — `wrong.html` §2.
 *
 * ── What this page is for ────────────────────────────────────────────────
 *
 * `wrong.html` §1 is the argument: the log guesses about twenty times a day,
 * it cannot be built on being right, so it is built on being cheap to
 * correct. §2 is what makes that argument checkable rather than a promise —
 *
 *   "Every correction is itself an entry. So the log keeps a dated record of
 *    its own mistakes. This is the part no other tool does… You do not have
 *    to trust it."
 *
 * `entry_revisions` has held every correction since the first one shipped,
 * and nothing read them across the whole log: an entry's own page shows its
 * own history, so a mistake could only be read by someone who already knew
 * where it was.
 *
 * ── What is deliberately not on it ───────────────────────────────────────
 *
 * §1's five worked cases and §3's hard case are `.case` articles carrying
 * invented dates, invented entries and live-looking buttons. They are the
 * design page teaching the mechanic; rendering them here would put fabricated
 * records on a surface whose entire purpose is that its records are real.
 *
 * The design's `.rate` block also carries "↓ 2.1× wrong attaches, compared
 * with the first week". A trend is the log telling him whether it is getting
 * better, which is a reading and not a count — §0 rule 2. The three figures
 * kept are counts, each with the rule it was counted by, the way `/numbers`
 * does it.
 *
 * ⚠️ Every line describing a correction is composed by the log out of the
 * field and the two values, so it is marked as the log's — the `.o` column
 * says `me` or `the log` on every row, which is the design's own marking.
 * The words underneath are his: what was replaced, and what replaced it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import type { Correction, CorrectionCounts } from '@/lib/corrections'

const PAGE = 40

function when(iso: string): string {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).replace(',', '')
}

function short(s: string | null, n = 120): string | null {
  if (!s) return null
  const t = s.trim().replace(/\s+/g, ' ')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export default function Corrections() {
  const [rows, setRows] = useState<Correction[]>([])
  const [counts, setCounts] = useState<CorrectionCounts | null>(null)
  const [before, setBefore] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async (cursor: string | null) => {
    cursor ? setMore(true) : setLoading(true)
    try {
      const q = new URLSearchParams({ limit: String(PAGE) })
      if (cursor) q.set('before', cursor)
      const res = await fetch(`/api/v2/log/corrections?${q}`, { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json() as {
          corrections: Correction[]; next_before: string | null; counts: CorrectionCounts
        }
        setRows(prev => (cursor ? [...prev, ...(j.corrections || [])] : (j.corrections || [])))
        setBefore(j.next_before)
        setCounts(j.counts)
      }
    } catch { /* the page says nothing rather than guessing */ }
    finally { setLoading(false); setMore(false) }
  }, [])

  useEffect(() => { void load(null) }, [load])

  return (
    <Shell>
      <div className="logpage pg-wrong">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/everything">everything</Link>
        </div>

        <div className="grid">
          <main>
            <section className="top">
              <h1>
                Every correction is itself an entry.{' '}
                <b>So the log keeps a dated record of its own mistakes.</b>
              </h1>
              <p>
                The log guesses about twenty times a day and it will be wrong.
                A system that guesses that often cannot be built on being
                right — it is built on being cheap to correct, and on keeping
                the record of its own mistakes so you can read them.{' '}
                <b>You do not have to trust it.</b>
              </p>
            </section>

            <div className="rec">
              <div className="hd">
                <b>Corrections, newest first</b>
                <span>each one dated · each one keeps what it replaced</span>
              </div>
              {loading && <div className="r"><span className="w">Reading.</span></div>}
              {!loading && rows.length === 0 && (
                <div className="r">
                  <span className="w">
                    Nothing has been corrected yet. This page fills itself as
                    the log gets things wrong.
                  </span>
                </div>
              )}
              {rows.map(c => (
                <div className="r" key={c.id}>
                  <span className="d">{when(c.at)}</span>
                  <span className="w">
                    {c.line}
                    {c.entry_text && (
                      <>
                        {' '}
                        <Link href={`/entry/${c.entry_id}`}>{short(c.entry_text, 72)}</Link>
                      </>
                    )}
                    {/* Both wordings, kept. The old value is the whole point
                        of the record — a correction with nothing behind it
                        is an assertion that something changed. */}
                    {open === c.id && (
                      <em style={{
                        display: 'block', fontStyle: 'normal', marginTop: 7,
                        fontSize: 12.5, color: 'var(--fg-4)', lineHeight: 1.5,
                      }}>
                        <s>{short(c.old_value) || 'nothing there before'}</s>
                        {' → '}
                        {short(c.new_value) || 'nothing there now'}
                      </em>
                    )}
                    {(c.old_value || c.new_value) && (
                      <button
                        onClick={() => setOpen(v => (v === c.id ? null : c.id))}
                        style={{
                          display: 'block', marginTop: 5, fontSize: 11.5,
                          color: 'var(--fg-4)', background: 'none', border: 0,
                          padding: 0, cursor: 'pointer',
                        }}
                      >{open === c.id ? 'hide both wordings' : 'both wordings'}</button>
                    )}
                  </span>
                  <span className="k">{c.kind}{c.entry_buried ? ' · buried' : ''}</span>
                  <span className={`o ${c.by === 'operator' ? 'me' : 'it'}`}>
                    {c.by === 'operator' ? 'me' : 'the log'}
                  </span>
                </div>
              ))}
            </div>

            {before && (
              <div className="fixrow" style={{ marginTop: 12 }}>
                <button onClick={() => void load(before)} disabled={more}>
                  {more ? 'Reading…' : 'Older corrections'}
                </button>
              </div>
            )}

            {/* Counts, each with the rule it was counted by. No trend: whether
                the log is getting better is a reading of these numbers, and
                the log does not read its own numbers out loud (§0 rule 2). */}
            {counts && (
              <div className="rate">
                <div>
                  <b>{counts.corrections.toLocaleString('en-GB')}</b>
                  <span>corrections, ever — every row above</span>
                </div>
                <div>
                  <b>{counts.by_him.toLocaleString('en-GB')}</b>
                  <span>of them yours; the rest the log made after you fixed something</span>
                </div>
                <div>
                  <b>{counts.guesses.toLocaleString('en-GB')}</b>
                  <span>
                    guesses to correct — an entry the log had to date by
                    inference, a line it wrote, a picture it held back, or a
                    passage it cut out of a recording
                  </span>
                </div>
                <div>
                  <b>{counts.lost.toLocaleString('en-GB')}</b>
                  <span>corrections that lost anything — counted, not promised: every one keeps its old value</span>
                </div>
              </div>
            )}

            <div className="rules">
              <div>
                <b>The fix lives where the mistake is.</b>
                <p>
                  Every one of these was one tap on the thing that was wrong.
                  No settings screen, no review queue, no confirmation dialog.
                </p>
              </div>
              <div>
                <b>Nothing here deleted anything.</b>
                <p>
                  A correction changes what things mean, never what was said.
                  Both wordings are kept and dated, and burying keeps the file.
                </p>
              </div>
              <div>
                <b>Four things the log never guesses.</b>
                <p>
                  What a recording meant, why you did something, whether it
                  was good, and who someone is to you. Those are not mistakes
                  to correct — they are the tool putting words in your mouth.
                </p>
              </div>
            </div>
          </main>

          <Rail goesTo={[
            { href: '/settings', label: 'the two maintenance jobs' },
            { href: '/numbers', label: 'numbers from the log' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}
