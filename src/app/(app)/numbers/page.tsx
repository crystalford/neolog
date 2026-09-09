'use client'

/**
 * The numbers — what the log counts to.
 *
 * `numbers.html`. Every figure here is a COUNT or a MIN/MAX over dated rows,
 * and each carries the rule it was counted by, so the page can be checked
 * instead of believed.
 *
 * What is deliberately not built: `numbers.html` puts a written reading
 * under each number — what it means, what it shows. A count is a fact; a
 * sentence about what a count means is a comment on the log, and the log
 * does not comment (§0 rule 2). The rule it was counted by takes that slot
 * instead, which is the useful half anyway.
 *
 * A zero is shown as a zero. Dropping the empty ones would make the page
 * flatter and would also mean the set of numbers changed shape depending on
 * the answer, which is the thing a Dataset must not do.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import Stamp from '@/components/Stamp'
import OwnerStrip from '@/components/OwnerStrip'

interface LogNumber {
  key: string; value: number; label: string; counted: string; unit?: string
}

export default function Numbers() {
  const [numbers, setNumbers] = useState<LogNumber[]>([])
  const [span, setSpan] = useState<{ first: string | null; last: string | null }>({ first: null, last: null })
  const [changed, setChanged] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/public/numbers', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json() as {
          numbers: LogNumber[]; first_at: string | null; last_at: string | null; last_changed: string | null
        }
        setNumbers(j.numbers || [])
        setSpan({ first: j.first_at, last: j.last_at })
        setChanged(j.last_changed)
      }
    } catch { /* the page says nothing yet */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const jsonLd = useMemo(() => JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: 'Numbers from the log',
    description: 'Counts over the entries on the log. Each carries the rule it was counted by.',
    ...(span.first && span.last ? { temporalCoverage: `${span.first}/${span.last}` } : {}),
    variableMeasured: numbers.map(n => ({
      '@type': 'PropertyValue',
      name: n.label,
      value: n.value,
      ...(n.unit ? { unitText: n.unit } : {}),
      description: n.counted,
    })),
  }), [numbers, span])

  return (
    <Shell>
      <div className="logpage pg-numbers">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/everything">everything</Link>
        </div>

        <div className="grid">
          <main>

        <section className="top">
              <h1>Numbers counted from the log.</h1>
              <p>
                This page isn&rsquo;t in the menu. It&rsquo;s here for anyone
                — or anything — that wants a figure with the rule it was
                counted by attached.
              </p>
            </section>
            {/* `numbers.html` puts a freshness pill under the opener. Its
                own says "recounts nightly"; these are counted on read, which
                is a stronger claim and a different one, so it says that. */}
            {!loading && (
              <div className="fresh">
                <i />
                counted just now, on this request · <time>every load</time>
              </div>
            )}
        <OwnerStrip signedIn={!loading} />
        <Stamp at={changed} unlisted />



        {loading && <div className="none">Counting.</div>}

        {/* ⚠️ `.n` is the ROW — a two-column grid, 200px for the figure and
            the rest for what it was counted by. It was on the figure itself,
            under a `.num` wrapper no stylesheet defines, so the row had no
            grid and the number carried the row's padding. `.big` is the
            figure, which is where the mono 44px lives. */}
        {numbers.map(n => (
          <div className={`n${n.value === 0 ? ' soon' : ''}`} key={n.key} id={n.key}>
            <div className="big">
              {n.value.toLocaleString('en-GB')}
              {n.unit && <small>{n.unit}</small>}
            </div>
            <div>
              <div className="x">{n.label}</div>
              <div className="how">{n.counted}</div>
              <div className="meta">
                <span className="mn">counted on read</span>
                {/* `numbers.html`'s "quote with source". It puts the figure,
                    the rule it was counted by and the address on the
                    clipboard — the whole point of this page is that a number
                    never travels without the rule, and copying just the
                    number is how that gets lost. Nothing is written: every
                    part of the line is already on screen. */}
                <button
                  className="q"
                  onClick={() => {
                    const line = `${n.value.toLocaleString('en-GB')}${n.unit ? ` ${n.unit}` : ''} — ${n.label} ${n.counted} (neolog, /numbers#${n.key})`
                    void navigator.clipboard?.writeText(line).then(
                      () => setCopied(n.key),
                      () => setCopied(null),
                    )
                  }}
                >
                  {copied === n.key ? 'copied, with the rule' : 'quote with source'}
                </button>
              </div>
            </div>
          </div>
        ))}

        <div className="why">
          <b>Why this page exists.</b> Counting is the one thing a log can do
          that nothing else can, because it is the only thing here that
          isn&rsquo;t a judgement. Every figure carries the rule it was
          counted by, so it can be checked rather than believed — and nothing
          on this page says what a number means.
        </div>

        {numbers.length > 0 && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        )}
                </main>

          <Rail goesTo={[{ href: '/public', label: 'the log' }, { href: '/facts', label: 'the facts' }]} />
        </div>
      </div>
    </Shell>
  )
}
