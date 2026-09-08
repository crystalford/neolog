'use client'

/**
 * Search — asking the log a question.
 *
 * `search.html`: "The answer is written only from passages it can point at —
 * a number on every sentence. Each number is a passage below."
 *
 * The trust in this page comes from two things being visible at once: the
 * answer, and the actual words it was built from. Clicking a number moves to
 * the passage rather than opening anything, because checking a claim should
 * not cost a navigation.
 *
 * What is deliberately shown rather than hidden:
 *   - how many passages the answer stands on, and what kind they are
 *   - what the log could NOT answer, in its own words
 *   - that retrieval is by word, so it finds what was said in those words
 *     and misses what was said in others
 */

export const runtime = 'edge'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import { stampFor, type DatePrecision } from '@/lib/log-entry'

interface Passage {
  n: number
  entry_id: string | null
  vlog_id: string | null
  kind: 'entry' | 'recording'
  quote: string
  happened_at: string
  date_precision: DatePrecision
  whose: string
  source: string
  span_start: number | null
  href: string
}

interface Result {
  question: string
  answer: string[]
  not_answered: string | null
  passages: Passage[]
  counts: { said: number; recalled: number; from_file: number }
  dropped: number
}

const EXAMPLES = [
  'what did I say about the job',
  'every time I mentioned the deck',
  'what have I said about neolog',
]

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<Result | null>(null)
  const [asking, setAsking] = useState(false)
  const [lit, setLit] = useState<number | null>(null)

  const ask = useCallback(async (question: string) => {
    const text = question.trim()
    if (!text) return
    setAsking(true)
    setResult(null)
    try {
      const res = await fetch(`/api/v2/search?q=${encodeURIComponent(text)}`, { cache: 'no-store' })
      if (!res.ok) { setResult(null); return }
      setResult(await res.json() as Result)
    } catch { setResult(null) }
    finally { setAsking(false) }
  }, [])

  const jump = useCallback((n: number) => {
    setLit(n)
    document.getElementById(`p-${n}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => setLit(null), 2000)
  }, [])

  return (
    <Shell active="search">
      <div className="logpage pg-search">
        <div className="back"><Link href="/">the log</Link></div>

        <div className="grid">
          <main>

        <div className="pghead">
          <h1>Ask the log a question.</h1>
        </div>

        <div className="askbox">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void ask(q) }}
            placeholder="ask"
            aria-label="Ask the log a question"
            autoFocus
          />
          <button onClick={() => void ask(q)}>{asking ? 'reading…' : 'ask ↵'}</button>
        </div>

        {!result && !asking && (
          <div className="egs">
            {EXAMPLES.map(e => (
              <button key={e} onClick={() => { setQ(e); void ask(e) }}>{e}</button>
            ))}
          </div>
        )}

        {result && (
          <>
            <div className="ansblock">
              <div className="k">
                <span>
                  From what&rsquo;s in the log · {result.passages.length}{' '}
                  {result.passages.length === 1 ? 'passage' : 'passages'}
                  {result.passages.length > 0 && (
                    <>
                      {' · '}
                      {[
                        result.counts.said && `${result.counts.said} said by you`,
                        result.counts.recalled && `${result.counts.recalled} recalled`,
                        result.counts.from_file && `${result.counts.from_file} written by the log`,
                      ].filter(Boolean).join(', ')}
                    </>
                  )}
                </span>
                {/* A sentence the model could not cite was dropped. Saying
                    how many is the difference between a filter and a
                    silent edit. */}
                {result.dropped > 0 && (
                  <span>
                    {result.dropped} {result.dropped === 1 ? 'sentence' : 'sentences'} dropped —
                    nothing to point at
                  </span>
                )}
              </div>

              {result.answer.length > 0 ? (
                <p>{result.answer.map((s, i) => <Sentence key={i} s={s} onJump={jump} />)}</p>
              ) : (
                <p style={{ color: 'var(--fg-3)' }}>
                  {result.passages.length === 0
                    ? 'Nothing in the log matches those words.'
                    : 'Nothing could be said about this that points at a passage. The passages are below; they are the part that cannot be wrong.'}
                </p>
              )}

              {result.not_answered && (
                <div className="nota">
                  <b>Not answered:</b> {result.not_answered}
                </div>
              )}

              {result.answer.length > 0 && (
                <div className="k" style={{ marginTop: 16 }}>
                  <span>
                    Each number is a passage below. Retrieval is by word, so this
                    finds what you said in these words and misses what you said in
                    others.
                  </span>
                </div>
              )}
            </div>

            <div style={{ marginTop: 30 }}>
              <div className="idxband"><b>The passages</b>{result.passages.length}</div>
              {result.passages.map(p => (
                <div className={`psg${lit === p.n ? ' lit' : ''}`} id={`p-${p.n}`} key={p.n}>
                  <span className="n">{p.n}</span>
                  <div>
                    <div className="meta">
                      <span>{stampFor(p.happened_at, p.date_precision)}</span>
                      <span>{p.source}</span>
                      <span>{p.whose}</span>
                    </div>
                    <q>{p.quote}</q>
                    <div className="go">
                      <Link href={p.href}>
                        {p.kind === 'recording' ? 'the whole recording' : 'the entry'}
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
              {result.passages.length === 0 && (
                <div className="none">
                  Nothing matched. That is a gap in what you have written down,
                  or in the words used — not proof it never happened.
                </div>
              )}
            </div>
          </>
        )}
                </main>

          <Rail goesTo={[{ href: '/', label: 'the log' }, { href: '/pages', label: 'the index' }, { href: '/asks', label: 'the questions' }]} />
        </div>
      </div>
    </Shell>
  )
}

/** One sentence, with its citations turned into buttons. */
function Sentence({ s, onJump }: { s: string; onJump: (n: number) => void }) {
  const parts = s.split(/(\[\d+\])/g)
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/)
        if (!m) return <span key={i}>{part}</span>
        const n = parseInt(m[1], 10)
        return (
          <button className="cite" key={i} onClick={() => onJump(n)} title={`Passage ${n}`}>
            {n}
          </button>
        )
      })}{' '}
    </>
  )
}
