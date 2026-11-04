'use client'

/**
 * Putting recordings in.
 *
 * ⚠️ 4 Nov. The operator: *"I hate the new upload via timeline / post thing…
 * when we pivoted back to the more social media feed style, we broke or
 * buried the simple bulk uploader… this should be more like youtube than X…
 * the post version is just annoying because I have to drag them all and then
 * post or whatever instead of just uploading them like any normal site would
 * have."*
 *
 * So the rule this page is built on: **choosing a file starts it.** There is
 * no post step, no compose box, no "and now press the button". He opens
 * this, drops thirty recordings, and walks away. That is what every normal
 * site does and what the composer's drop-then-post flow could not do.
 *
 * ── What is deliberately not here ───────────────────────────────────────
 *
 * No caption field, no title field, no date picker. §0 rule 6: never ask a
 * question at the moment of input. A recording is placed by its own clock
 * (`recorded-at.ts`) and says what it is about once it has been transcribed
 * (`headline.ts`). Both of those are the log's job, not a form's.
 *
 * ── The engine is `src/lib/bulk-upload.ts` ──────────────────────────────
 *
 * Read its header before changing anything here. Multipart with lazily
 * presigned parts, per-part retry, and a ledger in `localStorage` so a file
 * that stops resumes where it left off rather than from zero.
 *
 * ⚠️ This replaces `CapturePanel`, which was the only other uploader and was
 * reachable only from a button on `/vlogs`. Two uploaders is how he ended up
 * on the one that did a single PUT — CLAUDE.md has the same lesson about
 * `transcribe.ts` and `whisper.ts`: *two implementations of one call is the
 * bug, and the fix is deleting the second one.*
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import {
  uploadOne, alreadyIn, sweepLedgers, unfinished,
  humanBytes, humanLeft, FILE_CONCURRENCY,
  type UploadJob,
} from '@/lib/bulk-upload'

/**
 * How many times a stopped file picks itself back up before it waits for him.
 *
 * ⚠️ The point of the whole page. A blip at 3am that stops one file out of
 * thirty should not mean he comes back to a stalled queue — the parts
 * already accepted are kept, so a retry costs almost nothing and resumes
 * from where it was. After this many it stops trying and says so, because a
 * file failing the same way four times is not weather.
 */
const AUTO_RETRIES = 3
const AUTO_RETRY_DELAY_MS = 8000

let seq = 0

export default function UploadPage() {
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [over, setOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // ⚠️ The running set is a REF, not state. A long loop reads the closure it
  // started with, so a Set in state would be the one that existed when the
  // first file began — the same bug CLAUDE.md records for the old read
  // action's Stop button, which set the state and changed nothing.
  const running = useRef(new Set<string>())
  const aborts = useRef(new Map<string, AbortController>())
  const tries = useRef(new Map<string, number>())
  /**
   * ⚠️ A REF, not state. `patch()` queues a React update; `pump()` reads
   * `jobsRef` which is only assigned during a render. So between marking a
   * file as already-in and starting the queue, `pump` would still see it as
   * queued and upload a recording the log already holds. The ref is true the
   * instant it is set, which is the only thing `pump` can rely on.
   */
  const skippedIds = useRef(new Set<string>())
  const jobsRef = useRef<UploadJob[]>([])
  jobsRef.current = jobs

  // Ledgers R2 has already forgotten, and the ones it has not.
  const [waiting, setWaiting] = useState<{ name: string; parts: number }[]>([])
  useEffect(() => {
    sweepLedgers()
    setWaiting(unfinished().map(u => ({ name: u.name, parts: u.parts })))
  }, [])

  const patch = useCallback((id: string, p: Partial<UploadJob>) => {
    setJobs(prev => prev.map(j => (j.id === id ? { ...j, ...p } : j)))
  }, [])

  /** Start whatever is queued, up to the file cap. */
  const pump = useCallback(() => {
    const queued = jobsRef.current.filter(
      j => j.status === 'queued'
        && !running.current.has(j.id)
        && !skippedIds.current.has(j.id),
    )
    for (const job of queued) {
      if (running.current.size >= FILE_CONCURRENCY) return
      running.current.add(job.id)
      const ctrl = new AbortController()
      aborts.current.set(job.id, ctrl)

      void (async () => {
        try {
          const { vlogId } = await uploadOne(job.file, {
            onChange: p => patch(job.id, p),
            signal: ctrl.signal,
          })
          patch(job.id, { status: 'done', sent: job.size, vlogId, error: null })
        } catch (err: any) {
          const msg = err?.message || String(err)
          if (msg === 'paused') {
            patch(job.id, { status: 'paused', error: null })
          } else {
            // ⚠️ It tries again by itself before it asks him. See
            // `AUTO_RETRIES` — everything already accepted is in the ledger,
            // so a retry resumes rather than restarting.
            const n = (tries.current.get(job.id) || 0) + 1
            tries.current.set(job.id, n)
            if (n <= AUTO_RETRIES) {
              patch(job.id, {
                status: 'queued',
                error: `${msg} — trying again (${n} of ${AUTO_RETRIES})`,
              })
              setTimeout(() => pump(), AUTO_RETRY_DELAY_MS)
            } else {
              patch(job.id, { status: 'failed', error: msg })
            }
          }
        } finally {
          running.current.delete(job.id)
          aborts.current.delete(job.id)
          // Keep the queue moving without waiting for a render.
          setTimeout(() => pump(), 0)
        }
      })()
    }
  }, [patch])

  const add = useCallback((files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.size > 0)
    if (!list.length) return
    const fresh: UploadJob[] = list.map(file => ({
      id: `u${++seq}`,
      file,
      name: file.name,
      size: file.size,
      status: 'queued',
      sent: 0,
      rate: null,
      error: null,
      resumed: false,
      skipped: false,
      vlogId: null,
      key: null,
    }))
    setJobs(prev => [...prev, ...fresh])

    // ⚠️ Which of these the log already holds, asked ONCE for the whole
    // drop and before anything moves. Re-dragging a folder because some of
    // it failed is the real workflow, and the files already in should say
    // so immediately rather than waiting their turn in a queue.
    // ⚠️ Awaited, then pumped — not pumped in parallel. Starting the queue
    // first would upload the first two files of a re-dropped folder before
    // being told the log already has them. `alreadyIn` carries its own five
    // second ceiling so this can never hold the drop at the gate.
    void (async () => {
      const known = await alreadyIn(list)
      known.forEach((hit, i) => {
        if (!hit) return
        skippedIds.current.add(fresh[i].id)
        patch(fresh[i].id, {
          status: 'done',
          sent: fresh[i].size,
          vlogId: hit.id,
          skipped: true,
        })
      })
      pump()
    })()
  }, [pump, patch])

  const retry = useCallback((id: string) => {
    tries.current.set(id, 0)
    patch(id, { status: 'queued', error: null, rate: null })
    setTimeout(() => pump(), 0)
  }, [patch, pump])

  const pause = useCallback((id: string) => {
    aborts.current.get(id)?.abort()
  }, [])

  const retryAll = useCallback(() => {
    for (const j of jobsRef.current) {
      if (j.status === 'failed') {
        tries.current.set(j.id, 0)
        patch(j.id, { status: 'queued', error: null })
      }
    }
    setTimeout(() => pump(), 0)
  }, [patch, pump])

  // ⚠️ Leaving mid-upload loses the parts in flight, not the parts already
  // accepted — those are in the ledger and resume on the next attempt. The
  // warning is so he knows closing the tab is a pause rather than a cancel.
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (running.current.size > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [])

  const done = jobs.filter(j => j.status === 'done').length
  const skipped = jobs.filter(j => j.skipped).length
  const failed = jobs.filter(j => j.status === 'failed').length
  const active = jobs.filter(j => j.status !== 'done' && j.status !== 'failed')
  // ⚠️ A skipped file is not progress. Counting its bytes as "sent" would
  // put the overall bar at ninety percent for a folder where almost nothing
  // moved, which is a number that reads as a lie the moment he looks at it.
  const moving = jobs.filter(j => !j.skipped)
  const totalBytes = moving.reduce((n, j) => n + j.size, 0)
  const sentBytes = moving.reduce((n, j) => n + j.sent, 0)
  const overallRate = jobs
    .filter(j => j.status === 'uploading' && j.rate)
    .reduce((n, j) => n + (j.rate || 0), 0)

  return (
    <Shell>
      <div className="logpage pg-upload">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/vlogs">recordings</Link>
        </div>

        <div className="pghead">
          <h1>Put recordings in</h1>
          <p className="lede">
            Choose them and they start. There is nothing to press afterwards,
            and nothing to type — each one is placed by its own clock and says
            what it is about once it has been read.
          </p>
        </div>

        {/* ⚠️ What was part-way through last time. The browser cannot hold a
            `File` across a reload, so this cannot pick them up by itself —
            it can only say they are there. That is the difference between
            "it failed" and "add it again and it carries on", and it is the
            whole reason the ledger is worth keeping. */}
        {waiting.length > 0 && jobs.length === 0 && (
          <div className="resume">
            <b>
              {waiting.length} {waiting.length === 1 ? 'recording was' : 'recordings were'} part-way
              through.
            </b>
            <span>
              Add {waiting.length === 1 ? 'it' : 'them'} again and only the
              missing pieces go — nothing already sent is uploaded twice.
            </span>
            <em>{waiting.slice(0, 6).map(w => w.name).join(' · ')}
              {waiting.length > 6 && ` · and ${waiting.length - 6} more`}</em>
          </div>
        )}

        {/* The drop zone. Clicking it opens the picker, which is how a
            phone gets files in — there is nothing to drag there. */}
        <div
          className={`drop${over ? ' over' : ''}`}
          onDragOver={e => { e.preventDefault(); setOver(true) }}
          onDragLeave={() => setOver(false)}
          onDrop={e => {
            e.preventDefault(); setOver(false)
            if (e.dataTransfer?.files?.length) add(e.dataTransfer.files)
          }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
        >
          <b>Drop recordings here</b>
          <span>or choose them — as many as you like, video or audio</span>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="video/*,audio/*"
            style={{ display: 'none' }}
            onChange={e => {
              if (e.target.files?.length) add(e.target.files)
              e.target.value = ''
            }}
          />
        </div>

        {jobs.length > 0 && (
          <>
            <div className="sh">
              <span>
                {done} of {jobs.length} in
                {skipped > 0 && <> · {skipped} already there</>}
                {failed > 0 && <> · {failed} stopped</>}
              </span>
              <b>
                {humanBytes(sentBytes)} of {humanBytes(totalBytes)}
                {overallRate > 0 && <> · {humanBytes(overallRate)}/s</>}
              </b>
            </div>

            {/* One overall bar, because thirty rows of their own is not a
                sense of how far along the whole drop is. */}
            {active.length > 0 && (
              <div className="allbar">
                <i style={{ width: `${totalBytes ? (sentBytes / totalBytes) * 100 : 0}%` }} />
              </div>
            )}

            {failed > 0 && (
              <div className="bar">
                <button className="p" onClick={retryAll}>
                  Try the {failed} that stopped again
                </button>
                <span className="say">
                  Whatever was already accepted is kept — they pick up where
                  they left off rather than starting over.
                </span>
              </div>
            )}

            <div className="ups">
              {jobs.map(j => {
                const pct = j.size ? Math.min(100, (j.sent / j.size) * 100) : 0
                const left = humanLeft(j.size - j.sent, j.rate)
                return (
                  <div className={`up s-${j.status}`} key={j.id}>
                    <span className="nm">
                      {j.vlogId
                        ? <Link href={`/vlog/${j.vlogId}`}>{j.name}</Link>
                        : j.name}
                      <em>
                        {humanBytes(j.size)}
                        {j.skipped && <> · the log already had this one, nothing was sent</>}
                        {j.resumed && j.status !== 'done' && <> · picked up where it stopped</>}
                        {j.status === 'uploading' && left && <> · {left}</>}
                      </em>
                    </span>

                    <span className="pr">
                      <i style={{ width: `${pct}%` }} />
                    </span>

                    <span className="st">
                      {j.status === 'queued' && 'waiting'}
                      {j.status === 'preparing' && 'starting'}
                      {j.status === 'uploading' && `${Math.floor(pct)}%`}
                      {j.status === 'finishing' && 'finishing'}
                      {j.status === 'done' && (j.skipped ? 'already in' : 'in')}
                      {j.status === 'paused' && 'paused'}
                      {j.status === 'failed' && 'stopped'}
                    </span>

                    <span className="ac">
                      {(j.status === 'uploading' || j.status === 'preparing') && (
                        <button onClick={() => pause(j.id)}>pause</button>
                      )}
                      {(j.status === 'failed' || j.status === 'paused') && (
                        <button onClick={() => retry(j.id)}>
                          {j.status === 'paused' ? 'resume' : 'try again'}
                        </button>
                      )}
                    </span>

                    {/* ⚠️ The reason, in words, on the row. "upload failed"
                        with nothing after it is what he had before, and it
                        is why he could not tell a dead connection from a
                        file the log refused. */}
                    {j.error && <span className="er">{j.error}</span>}
                  </div>
                )
              })}
            </div>

            <p className="say" style={{ marginTop: 18 }}>
              Each one goes in as it finishes — you do not have to wait for the
              rest. They are transcribed a few at a time afterwards, on their
              own, so nothing fails for being in a hurry.
            </p>
          </>
        )}

        <footer className="ft">
          <span>neolog · putting recordings in</span>
          <span className="r">
            <Link href="/vlogs">every recording</Link>
            <Link href="/">the log</Link>
          </span>
        </footer>
      </div>
    </Shell>
  )
}
