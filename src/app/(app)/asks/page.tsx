'use client'

/**
 * The questions — what he asked, and what he later answered.
 *
 * `asks.html` is a page of written answers with sub-questions fanned out
 * beneath each. That version is below the drafting fence: a model writing an
 * answer in his voice, on a surface that presents itself as a record, is
 * what §0 rule 3 forbids. `/search` is where a written answer lives, and it
 * checks every sentence's citations before it shows one.
 *
 * What is built is the half that is entirely his. A question is an entry he
 * wrote that ends in a question mark. An answer is an entry that `led_from`
 * it — the same thread column every other continuation uses. Both dated,
 * both in his words, nothing in between.
 *
 * The open ones are kept, and kept visible. `asks.html` gives them a section
 * of their own — "these are open on purpose" — because a question he has not
 * answered is a fact about him too, and hiding it would make the page a
 * better advertisement and a worse record.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import Stamp from '@/components/Stamp'
import OwnerStrip from '@/components/OwnerStrip'

interface Ask {
  id: string
  question: string
  asked_at: string
  answers: { id: string; text: string; at: string; author: string }[]
  href: string
}

const day = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Asks() {
  const [answered, setAnswered] = useState<Ask[]>([])
  const [open, setOpen] = useState<Ask[]>([])
  const [changed, setChanged] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/public/asks', { cache: 'no-store' })
      if (res.ok) {
        const j = await res.json() as { answered: Ask[]; open: Ask[]; last_changed: string | null }
        setAnswered(j.answered || [])
        setOpen(j.open || [])
        setChanged(j.last_changed)
      }
    } catch { /* the page says nothing yet */ }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  // FAQPage carries only the answered ones — an open question has no answer
  // to put in the schema, and inventing an empty one would be a claim.
  const jsonLd = useMemo(() => JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: answered.map(a => ({
      '@type': 'Question',
      name: a.question,
      dateCreated: a.asked_at,
      acceptedAnswer: {
        '@type': 'Answer',
        text: a.answers.map(x => x.text).join('\n\n'),
        dateCreated: a.answers[0]?.at,
      },
    })),
  }), [answered])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <Link href="/everything">everything</Link>
        </div>

        <div className="pghead"><h1>Questions</h1></div>
        <OwnerStrip signedIn={!loading} />
        <Stamp at={changed} unlisted />

        <p className="none" style={{ paddingBottom: 0 }}>
          Questions on the log, with what was said next. The question is his,
          the answer is his, and nothing was written to join them — an answer
          here is an entry that came from the question. For an answer written
          out of the whole log, with a citation on every sentence,
          use <Link href="/search">search</Link>.
        </p>

        {loading && <div className="none">Reading the log.</div>}

        {!loading && !answered.length && !open.length && (
          <div className="none">
            No questions on the log yet. A question is an entry that ends in a
            question mark; what you say next about it becomes the answer.
          </div>
        )}

        {answered.length > 0 && (
          <>
            <div className="lsec">
              <span>answered</span>
              <b>{answered.length}</b>
            </div>
            {answered.map(a => (
              <div className="item" key={a.id}>
                <div className="x"><Link href={a.href}>{a.question}</Link></div>
                <div className="m"><time dateTime={a.asked_at}>asked {day(a.asked_at)}</time></div>
                {a.answers.map(x => (
                  <div className="said" key={x.id}>
                    {x.text}
                    <em>
                      {x.author === 'operator' ? 'you said this' : 'written by the log'} ·{' '}
                      <Link href={`/entry/${x.id}`}>{day(x.at)}</Link>
                    </em>
                  </div>
                ))}
              </div>
            ))}
          </>
        )}

        {open.length > 0 && (
          <>
            <div className="lsec">
              <span>open</span>
              <b>{open.length}</b>
            </div>
            <p className="none" style={{ padding: '18px 0 0' }}>
              These are open on purpose. They stay on the list until something
              said later comes from them.
            </p>
            {open.map(a => (
              <div className="item" key={a.id}>
                <div className="x"><Link href={a.href}>{a.question}</Link></div>
                <div className="m"><time dateTime={a.asked_at}>asked {day(a.asked_at)}</time></div>
              </div>
            ))}
          </>
        )}

        {answered.length > 0 && (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
        )}
      </div>
    </Shell>
  )
}
