'use client'

/**
 * Open questions — the rail card.
 *
 * The first card in `log.html`'s rail, and the only place in the product
 * where the log is allowed to ask the operator anything.
 *
 * Every rule it has to keep is a rule about restraint:
 *
 *   - It never asks at the moment of input. This lives beside the log, not
 *     in the way of putting something in.
 *   - It asks straight — "When did this happen?" — and never
 *     "you've mentioned this eleven times."
 *   - **"don't remember" is a complete answer**, offered as plainly as the
 *     others, and it closes the question for good. The log never asks again
 *     about a part he has said he doesn't know.
 *   - The answer is given here, not somewhere else. No page to visit, no
 *     form, no queue.
 *   - It says what the answer will become before he gives it, because a
 *     record that quietly turns an answer into something else is not one he
 *     can trust.
 */

import { useCallback, useEffect, useState } from 'react'

interface Question {
  id: string
  kind: 'entry_date' | 'thin_year' | 'page_name' | 'photo_date'
  question: string
  because: string | null
  target_kind: string | null
  target_id: string | null
}

export function OpenQuestions({ onAnswered }: { onAnswered?: () => void }) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/recall', { cache: 'no-store' })
      if (res.ok) setQuestions(((await res.json()) as { questions: Question[] }).questions || [])
    } catch { /* the card just doesn't show */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const answer = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(true)
    try {
      await fetch('/api/v2/recall', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...body }),
      })
      setText('')
      await load()
      onAnswered?.()
    } finally { setBusy(false) }
  }, [load, onAnswered])

  if (!questions.length) return null

  // The first one is answerable in place; the rest are listed, so the card
  // is one question rather than a queue of them.
  const [first, ...rest] = questions

  return (
    <div className="rc">
      <div className="h">Open questions <span>{questions.length}</span></div>

      <div className="i ask">
        <b>{first.question}</b>
        {first.because && <em>{first.because}</em>}

        <div className="ans">
          {first.kind === 'entry_date' || first.kind === 'thin_year' || first.kind === 'photo_date' ? (
            <YearChoice
              busy={busy}
              onPick={y => void answer(first.id, { year: y })}
              onDontRemember={() => void answer(first.id, { dont_remember: true })}
            />
          ) : (
            <>
              <div className="or">
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder="or say it, or type it — rough is fine"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && text.trim()) void answer(first.id, { text: text.trim() })
                  }}
                />
              </div>
              <div className="opts">
                <span
                  className="p"
                  onClick={() => { if (text.trim()) void answer(first.id, { text: text.trim() }) }}
                >Name it</span>
                <span className="d" onClick={() => void answer(first.id, { dont_remember: true })}>
                  don&rsquo;t remember
                </span>
                <span className="d" onClick={() => void answer(first.id, { dismiss: true })}>
                  leave it
                </span>
              </div>
            </>
          )}

          {/* What the answer becomes, said before it is given. */}
          <em>
            answered here, not somewhere else ·{' '}
            {first.kind === 'photo_date'
              ? 'the picture moves to the year you pick, marked from memory'
              : first.kind === 'entry_date'
              ? 'the entry gets the year you pick, marked from memory'
              : first.kind === 'thin_year'
                ? 'the answer becomes an entry dated to that year, marked from memory'
                : 'the name becomes yours, and everything under it follows'}
          </em>
        </div>
      </div>

      {rest.map(q => (
        <div className="i" key={q.id}>
          <b>{q.question}</b>
          {q.because && <em>{q.because}</em>}
        </div>
      ))}
    </div>
  )
}

/**
 * A year, picked or typed. The design offers a short row of likely years and
 * a place to type any other — because "2008" is faster to tap than to type,
 * and a year outside the row must still be answerable.
 */
function YearChoice({ busy, onPick, onDontRemember }: {
  busy: boolean
  onPick: (y: number) => void
  onDontRemember: () => void
}) {
  const [typed, setTyped] = useState('')
  const thisYear = new Date().getUTCFullYear()
  const recent = [thisYear, thisYear - 1, thisYear - 2, thisYear - 3]

  return (
    <>
      <div className="opts">
        {recent.map(y => (
          <span key={y} onClick={() => { if (!busy) onPick(y) }}>{y}</span>
        ))}
        <span className="d" onClick={() => { if (!busy) onDontRemember() }}>
          don&rsquo;t remember
        </span>
      </div>
      <div className="or">
        <input
          type="number"
          min={1900}
          max={thisYear}
          value={typed}
          placeholder="or any other year"
          onChange={e => setTyped(e.target.value)}
          onKeyDown={e => {
            const y = parseInt(typed, 10)
            if (e.key === 'Enter' && y >= 1900 && y <= thisYear && !busy) onPick(y)
          }}
        />
      </div>
    </>
  )
}
