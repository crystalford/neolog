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

interface Shot {
  id: string; text: string; detail: string | null; reads: string | null
  happened_at: string; entry_kind_now: string
  url: string | null; pile: Pile; kind: string; why: string
  facts: { what?: string; who?: string; when?: string; amount?: string }
}

const day = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const ORDER: Pile[] = ['something', 'keep', 'convenience']

export default function Screenshots() {
  const [piles, setPiles] = useState<Record<Pile, Shot[]> | null>(null)
  const [loading, setLoading] = useState(true)
  const [keeping, setKeeping] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/screenshots', { cache: 'no-store' })
      if (res.ok) setPiles(((await res.json()) as { piles: Record<Pile, Shot[]> }).piles)
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

        <div className="pghead"><h1>Screenshots</h1></div>
        <div className="stamp">
          <span>pictures that are really text</span>
          {total > 0 && <span>{total} the log has read</span>}
        </div>

        <p className="none" style={{ paddingBottom: 0 }}>
          A screenshot is text you wanted for a second. The log reads the
          words and sorts by what they say. It never buries anything on its
          own — the last pile is an offer.
        </p>

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

            <div className="shots">
              {piles[p].map(s => (
                <div className={`shot${keeping.has(s.id) ? ' kept' : ''}`} key={s.id}>
                  {s.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.url} alt="" loading="lazy" />
                  )}
                  <div className="body">
                    <Link className="x" href={`/entry/${s.id}`}>{s.text}</Link>
                    <div className="m">
                      <time dateTime={s.happened_at}>{day(s.happened_at)}</time>
                      {s.facts.amount && <span>{s.facts.amount}</span>}
                      {s.facts.who && <span>{s.facts.who}</span>}
                      <span>on the log as {s.entry_kind_now}</span>
                    </div>
                    <div className="why">{s.why}</div>
                    {s.kind === 'message' && (
                      <div className="why">
                        Someone else&rsquo;s words, so they get{' '}
                        <Link href="/messages">the message rule</Link> — kept,
                        attached to them, private by default.
                      </div>
                    )}
                    {p === 'convenience' && (
                      <button className="keep" onClick={() => toggleKeep(s.id)}>
                        {keeping.has(s.id) ? 'in the pile again' : 'keep this one'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
                </main>

          <Rail goesTo={[{ href: '/triage', label: 'what arrived' }, { href: '/messages', label: 'the message rule' }, { href: '/clear', label: 'safe to clear' }]} />
        </div>
      </div>
    </Shell>
  )
}
