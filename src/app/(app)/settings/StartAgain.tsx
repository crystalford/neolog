'use client'

/**
 * Start again — throw away everything the old system wrote, keep the files.
 *
 * The operator has no terminal. This session is his runtime, and the reset
 * is irreversible for D1, so it cannot be a migration that runs itself on
 * the next deploy: it has to be an act, with the consequence stated before
 * he does it and the result reported after.
 *
 * Three things it says out loud, because each is the difference between a
 * button he can trust and one he cannot:
 *
 *   what survives   the recordings in R2, untouched. The route contains no
 *                   R2 delete and never may.
 *   what goes       every table the extraction engine wrote into, every
 *                   entry that came out of a recording, and the derived
 *                   columns on the recordings themselves.
 *   what he types   the confirmation phrase is "keep the recordings" — the
 *                   thing being promised, not the thing being destroyed, so
 *                   typing it is reading the promise.
 */

import { useCallback, useState } from 'react'

interface Result {
  kept: { r2: string; recordings: number }
  removed: {
    tables: string[]
    transcript_words: number
    entries_from_recordings: number
  }
}

const PHRASE = 'keep the recordings'

export function StartAgain() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (typed.trim() !== PHRASE || busy) return
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch('/api/v2/admin/reset-to-recordings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: PHRASE }),
      })
      const j = await res.json() as Result & { error?: string }
      if (!res.ok) { setErr(j.error || 'that did not run'); return }
      setResult(j)
      setTyped('')
      setOpen(false)
    } catch { setErr('that did not run') }
    finally { setBusy(false) }
  }, [typed, busy])

  if (result) {
    return (
      <div className="paste">
        <p className="none" style={{ padding: 0 }}>
          Done. {result.removed.tables.length} tables dropped,{' '}
          {result.removed.transcript_words.toLocaleString('en-GB')} transcript
          words and {result.removed.entries_from_recordings.toLocaleString('en-GB')}{' '}
          entries removed.{' '}
          <b>{result.kept.recordings} recordings kept — the files were not touched.</b>
        </p>
        <p className="none" style={{ paddingTop: 10 }}>
          Next: transcribe them again, then read them onto the log.
        </p>
      </div>
    )
  }

  return (
    <div className="paste">
      {!open ? (
        <div className="bar">
          <button onClick={() => setOpen(true)}>Throw away everything but the recordings</button>
          <span className="say">
            Irreversible for the log. The files in R2 are not touched either way.
          </span>
        </div>
      ) : (
        <>
          <p className="none" style={{ padding: '0 0 12px' }}>
            This drops every table the old system wrote into — the extractions,
            the subjects, the productions, the chat — and removes every entry
            that came out of a recording, plus the transcripts. What you typed
            by hand stays. <b>The recordings in R2 are not touched.</b>
          </p>
          <input
            className="ti"
            style={{ borderRadius: 9, borderBottom: '1px solid var(--line-1)', fontSize: 14 }}
            value={typed}
            onChange={e => setTyped(e.target.value)}
            placeholder={`type “${PHRASE}” to go ahead`}
          />
          <div className="bar">
            <button
              className="p"
              onClick={() => void run()}
              disabled={busy || typed.trim() !== PHRASE}
            >{busy ? 'Doing it' : 'Do it'}</button>
            <button onClick={() => { setOpen(false); setTyped('') }}>Not now</button>
            {err && <span className="say">{err}</span>}
          </div>
        </>
      )}
    </div>
  )
}
