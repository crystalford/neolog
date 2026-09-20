'use client'

/**
 * Transcribe the recordings again.
 *
 * After **Start again** the recordings have no transcript, so nothing can
 * be read from them on the vlog's own page — a recording with no word
 * timings is deliberately left alone rather than dated by guess. This is
 * what refills them.
 *
 * ⚠️ 20 Sep — this panel used to also have a "Read them onto the log"
 * action, walking every transcribed recording and cutting it into several
 * standalone "said" entries automatically. That was removed: the operator
 * never asked the log to carve his own speech into separate posts on his
 * behalf (SPEC §0 rule 3, rule 7). Recording a vlog is one logged act, and
 * it already produced its one entry at intake. Transcribing is still
 * useful on its own — it's what populates the word-by-word transcript on
 * the vlog's own page for him to read, scrub and fix.
 *
 * It dispatches in small batches and reports the running count, because 400
 * recordings will not fit in one request and a bar that says nothing for
 * twenty minutes is indistinguishable from a broken one. The work itself
 * happens in the pipeline, not here; this only kicks it and then says how
 * far the log has got.
 */

import { useCallback, useEffect, useState } from 'react'

interface Status { recordings: number; transcribed: number }

export function Retranscribe() {
  const [s, setS] = useState<Status | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/log/read', { cache: 'no-store' })
      if (res.ok) setS(await res.json() as Status)
    } catch { /* the panel just shows nothing */ }
  }, [])
  useEffect(() => { void load() }, [load])

  const transcribe = useCallback(async () => {
    setBusy(true); setNote(null)
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
    finally { setBusy(false) }
  }, [load])

  return (
    <div className="paste">
      {s && (
        <p className="none" style={{ padding: '0 0 12px' }}>
          {s.recordings} recordings · {s.transcribed} transcribed.
        </p>
      )}
      <div className="bar">
        <button className="p" onClick={() => void transcribe()} disabled={busy}>
          {busy ? 'Sending' : 'Transcribe the untranscribed'}
        </button>
        {note && <span className="say">{note}</span>}
      </div>
    </div>
  )
}
