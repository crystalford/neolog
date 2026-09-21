'use client'

/**
 * Say what each recording is about.
 *
 * A recording's line on the feed has always been the log's — "Recorded 22
 * minutes of video." — composed from the file's own duration because that
 * was the only fact the log had. Once it has been transcribed there is a
 * better one, and the operator asked for it in those words: *"a nice solid
 * headline describing what the video is about."*
 *
 * ⚠️ `src/lib/headline.ts` carries the argument for why a model writing
 * this one line is not the auto-split deleted on 20 Sep. Read it before
 * changing anything here. The short version: it replaces a line the log
 * already wrote, in the same slot, still signed by the log, and not one
 * word of his is touched.
 *
 * It works in small batches and says the count, for the reason the
 * transcribe panel beside it does: four hundred recordings will not fit in
 * one request, and a button that says nothing for twenty minutes is
 * indistinguishable from a broken one. New recordings get a line on their
 * own from a home-page visit; this is for a backlog.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

interface Counts {
  recordings: number
  with_words: number
  written: number
  nothing_to_say: number
  left: number
  lines: { id: string; headline: string }[]
}

/** One request at a time, and each one is a handful of model calls. */
const BATCH = 5

export function Headlines() {
  const [c, setC] = useState<Counts | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  // ⚠️ A long loop reads a REF, not state. The closure it started with keeps
  // whatever `stop` was when it began, which is how the old read action's
  // Stop button set the state, re-rendered, and changed nothing.
  const stop = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/admin/headlines?sample=4', { cache: 'no-store' })
      if (res.ok) setC(await res.json() as Counts)
    } catch { /* the panel just shows nothing */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const run = useCallback(async () => {
    setBusy(true); setNote(null); stop.current = false
    let done = 0
    try {
      for (;;) {
        if (stop.current) { setNote(`Stopped. ${done} written.`); break }
        const res = await fetch('/api/v2/admin/headlines', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ limit: BATCH }),
        })
        if (!res.ok) { setNote('that did not go through'); break }
        const j = await res.json() as { written: number; nothing: number; left: number }
        done += j.written
        if (j.written === 0 && j.nothing === 0) {
          setNote(done ? `${done} written. Nothing left to do.` : 'Every transcribed recording already has a line.')
          break
        }
        setNote(`${done} written · ${j.left} to go…`)
        if (j.left === 0) { setNote(`${done} written. Nothing left to do.`); break }
      }
      await load()
    } catch { setNote('that did not go through') }
    finally { setBusy(false) }
  }, [load])

  return (
    <div className="paste">
      {c && (
        <p className="none" style={{ padding: '0 0 12px' }}>
          {c.with_words} transcribed · {c.written} with a line · {c.left} to go
          {c.nothing_to_say > 0 && <> · {c.nothing_to_say} the log had nothing to say about</>}
        </p>
      )}
      <div className="bar">
        <button className="p" onClick={() => void run()} disabled={busy}>
          {busy ? 'Reading' : 'Say what each recording is about'}
        </button>
        {busy && (
          <button onClick={() => { stop.current = true }}>Stop</button>
        )}
        {note && <span className="say">{note}</span>}
      </div>
      {/* The lines themselves. A count cannot be checked; a sentence can. */}
      {c && c.lines?.length > 0 && (
        <ul className="none" style={{ padding: '10px 0 0', listStyle: 'none', margin: 0 }}>
          {c.lines.map(l => (
            <li key={l.id} style={{ padding: '3px 0' }}>{l.headline}</li>
          ))}
        </ul>
      )}
      <p className="say" style={{ marginTop: 8 }}>
        Written from what you said in it, and marked as the log&rsquo;s. Your
        words are never changed.
      </p>
    </div>
  )
}
