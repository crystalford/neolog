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

        <div className="pghead"><h1>Numbers</h1></div>
        <OwnerStrip signedIn={!loading} />
        <Stamp at={changed} unlisted />

        <p className="none" style={{ paddingBottom: 0 }}>
          Counted from the log, not stated about it. Under each number is the
          rule it was counted by, so you can check it rather than take it.
          Nothing here says what a number means.
        </p>

        {loading && <div className="none">Counting.</div>}

        {numbers.map(n => (
          <div className="num" key={n.key}>
            <div className={`big${n.value === 0 ? ' zero' : ''}`}>
              {n.value.toLocaleString('en-GB')}
              {n.unit && <small>{n.unit}</small>}
            </div>
            <div>
              <div className="x">{n.label}</div>
              <div className="how">{n.counted}</div>
            </div>
          </div>
        ))}

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
