'use client'

/**
 * Screenshots — pictures that are really text, in three piles.
 *
 * `screenshots.html`: "Forty-one screenshots this month. The log reads them
 * — and knows most are junk."
 *
 * The one rule this page exists to honour: **junk is offered, not decided.**
 * The third pile is grouped and a single button buries all of it, and every
 * row in it says, in words he can check against the picture, why the log put
 * it there. Nothing is buried by the log on its own, and burying is
 * reversible.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import { PILE_WORDS, type Pile } from '@/lib/screenshots'
import { stampFor, isFuzzy, type DatePrecision } from '@/lib/log-entry'

interface Shot {
  id: string; text: string; detail: string | null; reads: string | null
  happened_at: string; date_precision: string; entry_kind_now: string
  url: string | null; pile: Pile; kind: string; why: string
  facts: { what?: string; who?: string; when?: string; amount?: string }
}

/** A paperwork row: what · who · when · how much · the original kept. */
interface Paper {
  id: string; text: string; detail: string | null
  happened_at: string; date_precision: string
  what: string; who: string | null; amount: string | null
  mime: string | null
}

/** Day and time, the way the design's `.k` meta line reads it. */
const stamp = (s: string) => {
  const d = new Date(s)
  if (isNaN(d.getTime())) return ''
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

/**
 * What the picture really is, in the words the design uses. It is the sort's
 * own answer restated — never a new claim about the picture.
 */
const REALLY: Record<string, string> = {
  receipt: 'really a receipt',
  message: 'a message from someone',
  directions: "a moment's convenience",
  code: 'a code, for a second',
  unknown: 'not recognised',
}

const ORDER: Pile[] = ['something', 'keep', 'convenience']

export default function Screenshots() {
  const [piles, setPiles] = useState<Record<Pile, Shot[]> | null>(null)
  const [paperwork, setPaperwork] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [keeping, setKeeping] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/screenshots', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json() as { piles: Record<Pile, Shot[]>; paperwork?: Paper[] }
        setPiles(j.piles)
        setPaperwork(j.paperwork || [])
      }
    } catch { setPiles(null) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const buryRest = useCallback(async () => {
    if (!piles || busy) return
    const ids = piles.convenience.map(s => s.id).filter(id => !keeping.has(id))
    if (!ids.length) return
    setBusy(true)
    try {
      const res = await fetch('/api/v2/log/screenshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (res.ok) {
        const j = await res.json() as { buried: number }
        setMsg(`${j.buried} buried. They are off the feed and still there — nothing was deleted.`)
        setKeeping(new Set())
        await load()
      } else setMsg('that did not go through')
    } catch { setMsg('that did not go through') }
    finally { setBusy(false) }
  }, [piles, keeping, busy, load])

  const toggleKeep = (id: string) => setKeeping(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  const total = piles ? ORDER.reduce((n, p) => n + piles[p].length, 0) : 0

  return (
    <Shell>
      <div className="logpage pg-screenshots">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/triage">what arrived</Link>
        </div>

        <div className="grid">
          <main>

        <section className="top">
          <h1>
            {total > 0 ? `${total} screenshots.` : 'Screenshots.'}{' '}
            <b>The log reads them — and knows most are junk.</b>
          </h1>
          <p>
            A screenshot isn&rsquo;t a photo. It&rsquo;s text you wanted to
            keep for a second — a message, a receipt, a map, a thing to buy.
            So the log <b>reads the text</b>, dates it, and sorts it into
            three piles. It never buries anything on its own; the last pile
            is an offer.
          </p>
        </section>

        {loading && <div className="none">Reading them.</div>}
        {!loading && total === 0 && (
          <div className="none">
            Nothing with words in it yet. Drop a screenshot into the composer
            and the log will read it.
          </div>
        )}

        {piles && ORDER.map(p => piles[p].length > 0 && (
          <div key={p}>
            <div className="sh">
              <span>{PILE_WORDS[p].name}</span>
              <b>{piles[p].length}</b>
            </div>
            <p className="none" style={{ padding: '14px 0 0' }}>{PILE_WORDS[p].what}</p>

            {p === 'convenience' && (
              <div className="paste" style={{ margin: '16px 0 4px' }}>
                <div className="bar">
                  <button className="p" onClick={() => void buryRest()} disabled={busy}>
                    {busy
                      ? 'Burying'
                      : `Bury the ${piles.convenience.length - keeping.size}`}
                  </button>
                  {keeping.size > 0 && (
                    <span className="say">{keeping.size} kept back.</span>
                  )}
                  {msg && <span className="say">{msg}</span>}
                </div>
              </div>
            )}

            {/* `screenshots.html`'s card: the picture, then what the log READ
                out of it as a quote, then why it is in this pile, in words
                that can be checked against the picture. `.junk` is the third
                pile's modifier — it dims the card, and it is a mark on an
                OFFER, not on a decision. */}
            <div className="body">
              {piles[p].map(s => (
                <div
                  className={`shot${p === 'convenience' && !keeping.has(s.id) ? ' junk' : ''}`}
                  key={s.id}
                >
                  {s.url
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img className="im" src={s.url} alt="" loading="lazy" />
                    : <div className="im" />}
                  <div className="txt">
                    <div className="k">
                      <span>{stamp(s.happened_at)} · a screenshot</span>
                      <b>{REALLY[s.kind] || REALLY.unknown}</b>
                    </div>
                    {/* What the vision pass read, verbatim. It is the reason
                        the row is where it is, so it is shown rather than
                        described. */}
                    {s.reads && <q>{s.reads.length > 240 ? `${s.reads.slice(0, 240)}…` : s.reads}</q>}
                    <div className="v">
                      {s.why}{' '}
                      {s.kind === 'message' && (
                        <>
                          Another person&rsquo;s words, so they get{' '}
                          <Link href="/messages">the message rule</Link> —
                          kept, attached to them, private by default.{' '}
                        </>
                      )}
                      On the log as <b>{s.entry_kind_now}</b>. The picture is
                      kept either way.
                    </div>
                    <div className="go">
                      <Link className="p" href={`/entry/${s.id}`}>the entry</Link>
                      {p === 'convenience' && (
                        <button onClick={() => toggleKeep(s.id)}>
                          {keeping.has(s.id) ? 'in the pile again' : 'keep this one'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* §2: "Receipts, contracts, statements, the letter from the clinic.
            The boring half of a life record, and it's a kind." Read off
            `kind = 'paperwork'`, so a PDF of a contract sits beside a photo
            of a receipt — the kind is the thing they share, not the mime.
            A date the log had to guess renders `.d fz`, the same distinction
            /search draws: "Mar 2005" from a scan and "2 Sep 2026" from a
            screenshot are not the same kind of fact. */}
        {paperwork.length > 0 && (
          <div className="body">
            <div className="sh">
              <span>Paperwork on the log</span>
              <b>what · who · when · how much · the original kept</b>
            </div>
            {paperwork.map(r => (
              <Link className="paper" key={r.id} href={`/entry/${r.id}`}>
                <span className="k">{r.what}</span>
                <span className="x">
                  {r.text}
                  <i>
                    {[r.amount, r.who, r.detail].filter(Boolean).join(' · ') || 'the original kept'}
                  </i>
                </span>
                <span className={`d${isFuzzy(r.date_precision as DatePrecision) ? ' fz' : ''}`}>
                  {stampFor(r.happened_at, r.date_precision as DatePrecision)}
                </span>
              </Link>
            ))}
          </div>
        )}
        {/* `screenshots.html` closes on these two, and both are the design
            rather than reassurance about it. */}
        <div className="rules">
          <div>
            <b>Read the text; keep the picture.</b> A screenshot&rsquo;s
            meaning is its words. The log reads them and files by what they
            say — the image is the original and stays.
          </div>
          <div>
            <b>Junk is offered, not decided.</b> Directions, a one-time code,
            a thing you wanted for a second — grouped and offered in one go.
            Buried is reversible; nothing is ever deleted.
          </div>
        </div>
          </main>

          <Rail goesTo={[
            { href: '/triage', label: 'what arrived' },
            { href: '/messages', label: 'the message rule' },
            { href: '/clear', label: 'safe to clear' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}
