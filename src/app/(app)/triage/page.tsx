'use client'

/**
 * Going through what arrived.
 *
 * `triage.html`: "Fifty things arrived on their own. Go through them at ten
 * seconds each — or don't; they're already filed... This is optional: one
 * thing at a time, four keys, no wrong answers. **Skipping the whole pile
 * costs nothing** — it's still on the log, still searchable. Going through
 * it adds your words."
 *
 * So this page is careful about what it is NOT: not an inbox, not a queue,
 * not a number to bring to zero. Nothing is blocked on it and nothing is
 * worse for never being opened. The four keys are four equally valid
 * outcomes, and "keep as filed" — doing nothing to it — is first.
 *
 * Keys: → keep as filed · ↓ bury · P make public · typing adds your words.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { Rail } from '@/components/Rail'
import { stampFor, type DatePrecision } from '@/lib/log-entry'

interface Item {
  id: string
  text: string
  detail: string | null
  happened_at: string
  date_precision: DatePrecision
  visibility: string
  held_reason: string | null
  mime: string | null
  original_filename: string | null
  source_kind: string
  media_url: string | null
}

export default function TriagePage() {
  const [items, setItems] = useState<Item[]>([])
  const [total, setTotal] = useState(0)
  const [at, setAt] = useState(0)
  const [done, setDone] = useState(0)
  const [words, setWords] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/triage', { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json() as { items: Item[]; total: number }
        setItems(d.items || [])
        setTotal(d.total || 0)
      }
    } catch { setItems([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const current = items[at]

  const decide = useCallback(async (action: string, text?: string) => {
    if (!current) return
    setDone(d => d + 1)
    setWords('')
    setAt(i => i + 1)
    // Fire and forget: the next card should not wait on the last decision,
    // and nothing here is destructive enough to need a confirmation.
    void fetch('/api/v2/triage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, action, text }),
    })
  }, [current])

  // Four keys. Typing goes to the box, so the shortcuts only fire when it is
  // empty — a key that eats a keystroke mid-sentence is worse than no key.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inBox = (e.target as HTMLElement)?.tagName === 'TEXTAREA'
      if (inBox) {
        if (e.key === 'Enter' && !e.shiftKey && words.trim()) {
          e.preventDefault(); void decide('words', words)
        }
        return
      }
      if (e.key === 'ArrowRight') { e.preventDefault(); void decide('keep') }
      else if (e.key === 'ArrowDown') { e.preventDefault(); void decide('bury') }
      else if (e.key.toLowerCase() === 'p') { e.preventDefault(); void decide('public') }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [decide, words])

  return (
    <Shell>
      <div className="logpage pg-triage">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/screenshots">screenshots</Link>
        </div>

        <section className="top">
          <h1>Going through what arrived.</h1>
          <p>
              Everything here is already filed by date. This is optional —
              skipping the whole pile costs nothing. Going through it adds
              your words.
          </p>
        </section>

        <div className="grid">
          <main>

        {current ? (
          <>
            <div className="top2">
              {done + 1} of {total} · {stampFor(current.happened_at, current.date_precision)}
              {current.original_filename ? ` · ${current.original_filename}` : ''}
            </div>

            <div className="card">
              {current.media_url && (current.mime || '').startsWith('image/') && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={current.media_url}
                  alt=""
                  className={current.visibility === 'held' ? 'blur' : undefined}
                />
              )}
              {current.media_url && (current.mime || '').startsWith('audio/') && (
                <audio src={current.media_url} controls preload="none" />
              )}

              <div className="what">{current.text}</div>
              {current.detail && <div className="med">{current.detail}</div>}
              <div className="cap">
                the log&rsquo;s line, from the file · filed on{' '}
                {stampFor(current.happened_at, current.date_precision)}
              </div>

              <textarea
                value={words}
                onChange={e => setWords(e.target.value)}
                placeholder="or say what it actually was — your words replace the log's"
              />

              <div className="acts">
                <button onClick={() => void decide('keep')}>
                  Keep as filed <kbd>→</kbd>
                </button>
                <button onClick={() => void decide('bury')}>
                  Bury <kbd>↓</kbd>
                </button>
                <button onClick={() => void decide('public')}>
                  Public <kbd>P</kbd>
                </button>
                <button
                  className="p"
                  disabled={!words.trim()}
                  onClick={() => void decide('words', words)}
                >
                  Use my words <kbd>↵</kbd>
                </button>
              </div>
            </div>

            {/* `triage.html`'s progress bar. It says how much is left and,
                in the same breath, that stopping costs nothing — a count
                that only counted would make this an inbox. */}
            <div className="bar">
              <div className="prog">
                <b>{done} done</b>
                <span>{Math.max(0, total - done)} left</span>
              </div>
              <span>stop here — the rest stay filed</span>
            </div>
          </>
        ) : !loading && (
          <div className="none">
            {done > 0
              ? `Nothing else waiting. ${done} gone through, and everything else was already filed.`
              : 'Nothing arrived that you haven’t seen.'}
          </div>
        )}

        {/* Not an inbox: nothing is blocked on this, there is no badge, and
            skipping the pile costs nothing. The design says so on the page
            rather than leaving it to be inferred from the absence of a
            counter. */}
        <div className="rules">
          <b>Already filed before you start.</b> Triage adds your words and
          your marks. It never decides whether something is on the log — it
          already is, placed by its own date, whether you open this or not.
        </div>
          </main>

          <Rail goesTo={[
            { href: '/', label: 'the log' },
            { href: '/screenshots', label: 'screenshots' },
            { href: '/clear', label: 'safe to clear' },
          ]} />
        </div>
      </div>
    </Shell>
  )
}
