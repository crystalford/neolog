'use client'

/**
 * The recordings.
 *
 * A dated list of the files, and what the log has read out of each — nothing
 * more. It is reached from the avatar dropdown, not the nav, because the
 * recordings are not a destination: what was SAID in them is on the log, and
 * the log is where you read it. This page is for the files themselves.
 *
 * What it replaces was 460 lines of the old design language — a 68px hero, a
 * seven-tab filter strip, cards carrying thread and clip counts from tables
 * that no longer exist. Two of those tabs filtered on extraction state.
 *
 * The one number on a row is **how many entries the log read out of it**,
 * which is the only thing about a recording the log knows and did not guess.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'
import { CapturePanel } from '@/components/CapturePanel'

interface VlogRow {
  id: string
  title: string | null
  original_filename: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  recorded_at: string | null
  uploaded_at: string
  pipeline_status: string
  has_transcript?: 0 | 1 | boolean
  entry_count?: number
}

const day = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const clock = (s: number | null) => {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} min` : `${Math.round(s)}s`
}
const mb = (b: number | null) => (b ? `${(b / 1048576).toFixed(0)} MB` : '')

export default function Recordings() {
  const [vlogs, setVlogs] = useState<VlogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/v2/vlogs?limit=500', { cache: 'no-store' })
      if (res.ok) {
        const d = await res.json() as { vlogs?: VlogRow[] }
        setVlogs(d.vlogs || [])
      }
    } catch { setVlogs([]) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { void load() }, [load])

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase()
    if (!n) return vlogs
    // ⚠️ `v.title` was matched here too. Nothing has written that column
    // since 8 Sep — the pass that did was the extraction engine's — so a
    // recording surfacing on a search of a deleted model's title is the log
    // deciding relevance out of words he never said.
    return vlogs.filter(v =>
      (v.original_filename || '').toLowerCase().includes(n))
  }, [vlogs, q])

  // Said out loud rather than shown as a tab: a recording with no transcript
  // cannot be read onto the log at all, and that is worth knowing at a
  // glance rather than after clicking into one.
  const untranscribed = vlogs.filter(v => !v.has_transcript).length

  // ⚠️ The queue, watched while it drains.
  //
  // A bulk drop registers its recordings without dispatching them — fifty at
  // the pipeline together is what wedged the September corpus run — so they
  // wait and go through a few at a time. That is invisible unless something
  // says so, and "nothing appears to be happening" is exactly how the last
  // bulk run looked while it was quietly broken.
  //
  // This GET also DRAINS (see the route), so polling it is what keeps the
  // queue moving while he is on this page.
  const [queue, setQueue] = useState<{ waiting: number; in_flight: number } | null>(null)
  useEffect(() => {
    let live = true
    const tick = async () => {
      try {
        const res = await fetch('/api/v2/vlogs/queue', { cache: 'no-store' })
        if (res.ok && live) {
          const q = await res.json() as { waiting: number; in_flight: number }
          setQueue(q)
          // The list only changes as recordings finish, so reload it with
          // the queue rather than on its own timer.
          if (q.in_flight > 0 || q.waiting > 0) void load()
        }
      } catch { /* the line just doesn't show */ }
    }
    void tick()
    const t = setInterval(tick, 15000)
    return () => { live = false; clearInterval(t) }
  }, [load])

  return (
    <Shell>
      <div className="logpage">
        <div className="back"><Link href="/">the log</Link></div>

        <div className="pghead"><h1>Recordings</h1></div>
        <div className="stamp">
          <span>{vlogs.length} {vlogs.length === 1 ? 'file' : 'files'}</span>
          <span>kept in R2, untouched</span>
          {untranscribed > 0 && <span>{untranscribed} not transcribed yet</span>}
        </div>

        {/* What the queue is doing, in words, and only when it is doing
            something. A count with no state line is how four hundred
            recordings sat at "complete" having read nothing. */}
        {queue && (queue.waiting > 0 || queue.in_flight > 0) && (
          <div className="say" style={{ padding: '0 0 10px' }}>
            {queue.in_flight > 0 && (
              <>{queue.in_flight} being read now. </>
            )}
            {queue.waiting > 0 && (
              <>{queue.waiting} waiting their turn — a few at a time, so none of
              them fail. They go through on their own while you are here.</>
            )}
          </div>
        )}

        <div className="paste">
          <div className="bar">
            {/* ⚠️ 20 Sep — "Add a recording" read as one file at a time, so
                the operator went looking for a bulk uploader that had been
                sitting behind this button all along. It takes as many as you
                drop, with progress on each. The label says so now. */}
            <button className="p" onClick={() => setOpen(v => !v)}>
              {open ? 'Not now' : 'Put recordings in'}
            </button>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="find one by name"
              style={{
                flex: 1, minWidth: 180, background: '#0a0a0b', color: 'var(--fg-1)',
                border: '1px solid var(--line-1)', borderRadius: 8,
                padding: '7px 12px', font: 'inherit', fontSize: 14, outline: 'none',
              }}
            />
          </div>
          {open && <div style={{ marginTop: 14 }}><CapturePanel onUploaded={() => { void load() }} /></div>}
        </div>

        {loading && <div className="none">Reading the log.</div>}
        {!loading && shown.length === 0 && (
          <div className="none">
            {q ? 'No recording by that name.' : 'Nothing here yet. Drop a recording in and the log will read it.'}
          </div>
        )}

        <div className="doors" style={{ marginTop: 22 }}>
          {shown.map(v => (
            <Link className="d" key={v.id} href={`/vlog/${v.id}`}>
              <span className="n">{day(v.recorded_at || v.uploaded_at)}</span>
              <span className="w">
                {v.original_filename || 'a recording'}
                <em style={{
                  display: 'block', fontStyle: 'normal', marginTop: 5,
                  fontSize: 12.5, color: 'var(--fg-4)',
                }}>
                  {[clock(v.duration_seconds), mb(v.file_size_bytes)].filter(Boolean).join(' · ')}
                  {!v.has_transcript && ' · not transcribed'}
                </em>
              </span>
              {/* ⚠️ 21 Sep — this said "not read yet" on every transcribed
                  recording, and it was a state that could never change.
                  "Read" meant the auto-split step that cut a transcript into
                  separate entries; that step is a no-op since 20 Sep and the
                  entries it had written were deleted, so `entry_count` is
                  zero everywhere and always will be. The column was
                  promising work that nothing was ever going to do.

                  The operator: "they all say not read yet but aren't all
                  these read? like these are all the old ones."

                  What a recording's state actually IS now is whether its
                  words are down — that is what fills the transcript on its
                  own page and what `/search` can reach. So the column says
                  that, and says nothing at all when the answer is the
                  ordinary one. */}
              <span className={`c${v.entry_count ? '' : ' none'}`}>
                {v.entry_count ? `${v.entry_count} on the log` : ''}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </Shell>
  )
}
