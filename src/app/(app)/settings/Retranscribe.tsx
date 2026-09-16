'use client'

/**
 * Transcribe the recordings again, then read them onto the log.
 *
 * After **Start again** the recordings have no transcript, so nothing can
 * be read from them — a recording with no word timings is deliberately
 * skipped rather than dated by guess. This is what refills them.
 *
 * It dispatches in small batches and reports the running count, because 400
 * recordings will not fit in one request and a bar that says nothing for
 * twenty minutes is indistinguishable from a broken one. The work itself
 * happens in the pipeline, not here; this only kicks it and then says how
 * far the log has got.
 */

import { useCallback, useEffect, useState, useRef } from 'react'

interface Status { recordings: number; transcribed: number; read: number; entries: number }

export function Retranscribe() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState<'transcribe' | 'read' | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [stop, setStop] = useState(false)
  /**
   * ⚠️ A REF as well as state, and the loop reads the ref.
   *
   * `read` walks four hundred recordings a page at a time, and it checked
   * `stop` from the closure it STARTED with — which is `false` for the whole
   * run, because `useCallback` making a new function does not reach into the
   * one already looping. Pressing Stop set the state, re-rendered the button,
   * and changed nothing. On the one job long enough to want stopping, the
   * stop did nothing.
   *
   * The state is what the button renders from — it says "stopping after this
   * page…" so the press is visibly heard — and the ref is what the loop
   * reads. They are set together.
   */
  const stopRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/read', { cache: 'no-store' })
      if (res.ok) setS(await res.json() as Status)
    } catch { /* the panel just shows nothing */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const transcribe = useCallback(async () => {
    setBusy('transcribe'); setNote(null)
    try {
      // Two steps, because that is the endpoint's shape: resolve the list
      // with a dry run, then dispatch it in chunks so 400 recordings do not
      // arrive at the pipeline as one burst.
      const dry = await fetch('/api/v2/admin/reprocess-vlogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dry_run: true, scope: 'incomplete' }),
      })
      if (!dry.ok) { setNote('could not work out which need it'); return }
      const { ids = [] } = await dry.json() as { ids?: string[] }
      if (!ids.length) { setNote('Every recording already has a transcript.'); return }

      let sent = 0
      for (let i = 0; i < ids.length; i += 10) {
        const res = await fetch('/api/v2/admin/reprocess-vlogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vlog_ids: ids.slice(i, i + 10) }),
        })
        if (!res.ok) break
        const j = await res.json() as { dispatched?: number }
        sent += j.dispatched ?? 0
        setNote(`${sent} of ${ids.length} sent…`)
      }
      setNote(`${sent} sent to the pipeline. It runs in the background — come back for the count.`)
      await load()
    } catch { setNote('that did not go through') }
    finally { setBusy(null) }
  }, [load])

  const read = useCallback(async () => {
    setBusy('read'); setNote(null); setStop(false); stopRef.current = false
    let cursor: string | null = null
    let written = 0
    let skipped = 0
    try {
      for (;;) {
        if (stopRef.current) break
        const res: Response = await fetch('/api/v2/log/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, limit: 5 }),
        })
        if (!res.ok) break
        const r = await res.json() as {
          entries_written: number; untranscribed: number; next_cursor: string | null
        }
        written += r.entries_written
        skipped += r.untranscribed
        setNote(`${written} on the log so far…`)
        cursor = r.next_cursor
        if (!cursor) break
      }
      setNote(
        `${written} entries on the log.`
        + (skipped ? ` ${skipped} recordings had no word timings, so nothing was placed from them.` : ''),
      )
      await load()
    } catch { setNote('that stopped early — press again, it picks up where it left off') }
    finally { setBusy(null) }
  }, [load])

  return (
    <div className="paste">
      {s && (
        <p className="none" style={{ padding: '0 0 12px' }}>
          {s.recordings} recordings · {s.transcribed} transcribed ·{' '}
          {s.read} read · {s.entries.toLocaleString('en-GB')} entries on the log from them.
        </p>
      )}
      <div className="bar">
        <button onClick={() => void transcribe()} disabled={busy !== null}>
          {busy === 'transcribe' ? 'Sending' : 'Transcribe the untranscribed'}
        </button>
        <button className="p" onClick={() => void read()} disabled={busy !== null}>
          {busy === 'read' ? 'Reading' : 'Read them onto the log'}
        </button>
        {busy === 'read' && (
          <button
            onClick={() => { stopRef.current = true; setStop(true) }}
            disabled={stop}
          >{stop ? 'stopping after this page…' : 'Stop'}</button>
        )}
        {note && <span className="say">{note}</span>}
      </div>
      <p className="none" style={{ padding: '10px 0 0', fontSize: 13 }}>
        Reading is idempotent — running it twice writes nothing the second
        time, so stopping halfway and starting again loses nothing.
      </p>
    </div>
  )
}
