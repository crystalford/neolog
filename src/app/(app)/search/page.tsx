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
import { stampFor, isFuzzy, type DatePrecision } from '@/lib/log-entry'

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
  unsearchable: number
}

const EXAMPLES = [
  'what did I say about the job',
  'every time I mentioned the deck',
  'what have I said about neolog',
]

export default function SearchPage() {
  const [q, setQ] = useState('')
  const [result, setResult] = useState<Result | null>(null)

  /**
   * The years the returned passages are dated in, oldest first. Built from
   * the results and nothing else — a second query would be a second claim,
   * and this bar answers "where are THESE hits", not "where is the log".
   * A year with no hit is not a bar; the gaps are the point of the picture.
   */
  const hitYears = (() => {
    const by = new Map<number, number>()
    for (const p of result?.passages ?? []) {
      const y = new Date(p.happened_at).getUTCFullYear()
      if (!isNaN(y)) by.set(y, (by.get(y) ?? 0) + 1)
    }
    return [...by.entries()].map(([y, n]) => ({ y, n })).sort((a, b) => a.y - b.y)
  })()
  const hitMax = Math.max(1, ...hitYears.map(y => y.n))
  const [asking, setAsking] = useState(false)
  /**
   * Narrow the passages to the ones he SAID out loud, rather than everything
   * the log holds. A fact about the passage, not a judgement of it.
   */
  const [onlySaid, setOnlySaid] = useState(false)
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

        <section className="q">
          <h1>Ask the log a question.</h1>
        </section>

        <div className="box">
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void ask(q) }}
            placeholder="ask"
            aria-label="Ask the log a question"
            autoFocus
          />
          {/* `.go` is `search.html`'s ask button — `<span class="go">ask<kbd>↵</kbd></span>`.
              It had been borrowed for the link under a hit, where the design
              uses `.more`, so the one control on the page was styled as a
              navigation affordance and the affordance as a control. */}
          <button className="go" onClick={() => void ask(q)}>
            {asking ? 'reading…' : <>ask<kbd>↵</kbd></>}
          </button>
        </div>

        {!result && !asking && (
          <div className="try">
            {EXAMPLES.map(e => (
              <button key={e} onClick={() => { setQ(e); void ask(e) }}>{e}</button>
            ))}
          </div>
        )}

        {result && (
          <>
            <div className="ans">
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
                <p className="a">{result.answer.map((s, i) => <Sentence key={i} s={s} onJump={jump} />)}</p>
              ) : (
                <p style={{ color: 'var(--fg-3)' }}>
                  {result.passages.length === 0
                    ? 'Nothing in the log matches those words.'
                    : 'Nothing could be said about this that points at a passage. The passages are below; they are the part that cannot be wrong.'}
                </p>
              )}

              {result.not_answered && (
                <div className="abst">
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

            {/* `search.html`: the passages the answer is written from,
                numbered, so every citation above lands on one. */}
            <div className="hits">
              <div className="sh"><span>The passages</span><b>{result.passages.length}</b></div>
              {/* ⚠️ `search.html` offers three tabs: by date · by relevance ·
                  said only. TWO are built. A relevance order is the log
                  having an opinion about which of his own words matter most,
                  which is the fence `/footage` draws in the same words — "no
                  relevance ranking… a relevance score is the log having an
                  opinion about which of his footage is good". Date is a
                  fact; whose words they are is a fact. */}
              {result.passages.length > 1 && (
                <div className="tabs">
                  <button className={onlySaid ? '' : 'on'} onClick={() => setOnlySaid(false)}>
                    everything
                  </button>
                  <button className={onlySaid ? 'on' : ''} onClick={() => setOnlySaid(true)}>
                    said only
                  </button>
                </div>
              )}
              {/* ⚠️ `search.html` builds a hit as `.h > .t > (.d .w .n)` and
                  then the quote. This had `.pt` as the OUTER wrapper with
                  the meta inside it — the design's shape inverted, so the
                  date, the provenance and the passage number all took the
                  styling of quoted text.

                  `.d fz` is the one that matters. A date the log had to
                  guess renders differently from one it knows, on the surface
                  whose whole discipline is pointing at things: "2008" from a
                  recall session and "19 Aug 2026" from a recording are not
                  the same kind of fact and must not look alike. */}
              {result.passages.filter(p => !onlySaid || p.kind === 'recording').map(p => (
                <div className={`h${lit === p.n ? ' lit' : ''}`} id={`p-${p.n}`} key={p.n}>
                  <div className="t">
                    <span className={`d${isFuzzy(p.date_precision) ? ' fz' : ''}`}>
                      {stampFor(p.happened_at, p.date_precision)}
                    </span>
                    <span className="w">{p.source}</span>
                    <span className="n">{p.n}</span>
                  </div>
                  <div>
                    <div className="pt"><q>{p.quote}</q><em>{p.whose}</em></div>
                    <div className="ps">
                      {p.kind === 'recording'
                        ? 'from the transcript — the whole recording is kept'
                        : 'the entry, whole'}
                    </div>
                    <Link className="more" href={p.href}>
                      {p.kind === 'recording' ? 'the whole recording' : 'the whole passage'}
                    </Link>
                  </div>
                </div>
              ))}
              {result.passages.length === 0 && (
                <div className="none">
                  Nothing matched. That is a gap in what you have written down,
                  or in the words used — not proof it never happened.
                </div>
              )}

              {/* ⚠️ `search.html`'s `.h thin` row is a NAMED untranscribed
                  file, listed under the query as one that "might be
                  relevant — the batch page guessed it could mention it".
                  To name one the log would have to decide which unread
                  recording bears on this question, and it cannot: it has
                  not read any of them. That is the fence `/footage` draws
                  in the same words — "no relevance ranking… a relevance
                  score is the log having an opinion about which of his
                  footage is good".

                  The half of that row that IS a fact is kept, as a count.
                  Retrieval reads entries and transcripts, so a recording
                  with no words was never looked at — that is not "no
                  match", and a search silently missing most of the corpus
                  reads as an answer about the whole log. */}
              {result.unsearchable > 0 && (
                <div className="none">
                  {result.unsearchable}{' '}
                  {result.unsearchable === 1 ? 'recording has' : 'recordings have'}{' '}
                  not been transcribed, so this search did not look inside{' '}
                  {result.unsearchable === 1 ? 'it' : 'them'}. Which of them bear
                  on this is not something the log can know before it has read
                  them.{' '}
                  <Link className="more" href="/settings">transcribe them</Link>
                </div>
              )}
            </div>
          </>
        )}
                </main>

          <Rail
            /* `search.html`: "Where the hits are." Built from the passages
               this search returned and nothing else, so it says where THESE
               matches are dated rather than making a second claim about the
               log. The design also puts a sentence under it — "eighteen
               years in between with nothing, not because nothing was said,
               because nothing was kept" — and that is the log reading his
               life, so the bar carries the years and stops. */
            lead={hitYears.length > 1 ? (
              <div className="rc">
                <div className="hd">
                  Where the hits are{' '}
                  <span>{hitYears[0].y} – {hitYears[hitYears.length - 1].y}</span>
                </div>
                <div className="yrs">
                  {hitYears.map(y => (
                    <i
                      key={y.y}
                      style={{ height: `${Math.max(8, Math.round((y.n / hitMax) * 100))}%`, background: 'var(--t-steel)' }}
                      title={`${y.y} — ${y.n} ${y.n === 1 ? 'match' : 'matches'}`}
                    />
                  ))}
                </div>
                <div className="yl">
                  <span>{hitYears[0].y}</span>
                  <span>{hitYears[hitYears.length - 1].y}</span>
                </div>
              </div>
            ) : null}
            goesTo={[{ href: '/', label: 'the log' }, { href: '/pages', label: 'the index' }, { href: '/asks', label: 'the questions' }]}
          />
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
