'use client'

/**
 * One recording, whole.
 *
 * `vlog.html`: "the whole video (kept untouched), the word-timestamped
 * transcript with used lines marked and linked to what they became,
 * provenance (date from the MP4 `mvhd`, Whisper transcription)."
 *
 * ── What this page used to be ────────────────────────────────────────────
 *
 * A thousand lines of extraction dashboard: a session digest, an anchor
 * take, threads and clips and entities in tabs, a tier picker, cost
 * estimates, re-extract and mark-as-broll buttons, a podcast toggle. The
 * operator's verdict on all of it: *"i didn't trust its output anyway."*
 *
 * What is left is the recording and the evidence. The video, played from R2
 * untouched. The words with the second each was said. The provenance —
 * which of the four tiers dated it, who transcribed it — in words rather
 * than as column values. And the entries the log read out of it, each one a
 * contiguous run of the transcript above, linked to the second it starts at.
 *
 * The one action is **read it onto the log**, and it calls a path with no
 * model in it.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import Shell from '@/components/Shell'

interface Vlog {
  id: string; title: string | null; original_filename: string | null
  play_url: string | null; poster_url: string | null
  duration_seconds: number | null; file_size_bytes: number | null
  mime_type: string | null
  recorded_at: string | null; created_at: string
  date_from: string; transcribed_by: string | null
  transcript_completed_at: string | null
  pipeline_status: string | null
  read_at: string | null
  word_count: number
  vision_description: string | null; frame_note: string | null
}
interface Word { word: string; start_time: number; end_time: number; word_index: number }
interface Entry { id: string; text: string; happened_at: string; span_start: number | null; span_end: number | null }
interface Result {
  vlog: Vlog; words: Word[]; entries: Entry[]
  navigation: { prev_id: string | null; next_id: string | null }
}

const clock = (s: number | null) => {
  if (s == null || s < 0) return ''
  const m = Math.floor(s / 60)
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}
const day = (s: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}
const mb = (b: number | null) => (b ? `${(b / 1048576).toFixed(0)} MB` : '')

export default function Recording() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const [r, setR] = useState<Result | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [at, setAt] = useState(0)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/vlogs/${params.id}`, { cache: 'no-store' })
      if (res.ok) setR(await res.json() as Result)
    } catch { setR(null) }
    finally { setLoading(false) }
  }, [params.id])
  useEffect(() => { void load() }, [load])

  const read = useCallback(async () => {
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/v2/log/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_id: params.id }),
      })
      const j = await res.json() as { entries_written: number; passages: number; no_words: boolean }
      if (j.no_words) setMsg('No word timings on this one yet, so nothing was placed. Nothing is dated by guess.')
      else setMsg(`${j.entries_written} of ${j.passages} on the log. Each is a run of the words below, at the second you said it.`)
      await load()
    } catch { setMsg('that did not run') }
    finally { setBusy(false) }
  }, [params.id, load])

  const v = r?.vlog
  // The word under the playhead, so the transcript follows the video.
  const activeIndex = useMemo(() => {
    if (!r?.words.length) return -1
    let lo = 0, hi = r.words.length - 1, best = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (r.words[mid].start_time <= at) { best = mid; lo = mid + 1 } else hi = mid - 1
    }
    return best
  }, [r, at])

  return (
    <Shell>
      <div className="logpage">
        <div className="crumb">
          <Link href="/">the log</Link>
          <Link href="/vlogs">recordings</Link>
          {r?.navigation.prev_id && <Link href={`/vlog/${r.navigation.prev_id}`}>earlier</Link>}
          {r?.navigation.next_id && <Link href={`/vlog/${r.navigation.next_id}`}>later</Link>}
        </div>

        {loading && <div className="none">Getting it.</div>}
        {!loading && !v && <div className="none">No such recording.</div>}

        {v && r && (
          <>
            <div className="pghead">
              <h1>{v.title || v.original_filename || 'A recording'}</h1>
            </div>
            <div className="stamp">
              <time dateTime={v.recorded_at || v.created_at}>{day(v.recorded_at || v.created_at)}</time>
              {v.duration_seconds && <span>{clock(v.duration_seconds)}</span>}
              {v.file_size_bytes && <span>{mb(v.file_size_bytes)}</span>}
              {v.word_count > 0 && <span>{v.word_count.toLocaleString('en-GB')} words</span>}
            </div>

            {v.play_url ? (
              <video
                className="rec"
                src={v.play_url}
                poster={v.poster_url || undefined}
                controls
                playsInline
                onTimeUpdate={e => setAt((e.target as HTMLVideoElement).currentTime)}
              />
            ) : (
              <div className="none">
                The file is in R2 and this page could not sign a link for it
                just now. Nothing is lost; reload.
              </div>
            )}

            {/* Provenance, in words. Two facts, and the log says how it knows
                each — a recording that cannot be checked is not evidence. */}
            <div className="lsec"><span>where this came from</span></div>
            <div className="doors">
              <span className="d">
                <span className="n">the date</span>
                <span className="w">{v.date_from}</span>
                <span className="c">{day(v.recorded_at || v.created_at)}</span>
              </span>
              <span className="d">
                <span className="n">the words</span>
                <span className="w">
                  {v.transcribed_by
                    ? `Transcribed by ${v.transcribed_by}. Every word carries the second it was said.`
                    : 'Not transcribed yet. Until it is, nothing can be placed from it.'}
                </span>
                <span className="c">{v.transcript_completed_at ? day(v.transcript_completed_at) : ''}</span>
              </span>
              <span className="d">
                <span className="n">the file</span>
                <span className="w">Cloudflare R2, untouched. Nothing on this page changes it.</span>
                <span className="c">{v.mime_type || ''}</span>
              </span>
            </div>

            <div className="lsec">
              <span>what the log read out of it</span>
              <b>{r.entries.length}</b>
            </div>
            <div className="paste" style={{ marginTop: 14 }}>
              <div className="bar">
                <button className="p" onClick={() => void read()} disabled={busy || v.word_count === 0}>
                  {busy ? 'Reading it' : r.entries.length ? 'Read it again' : 'Read it onto the log'}
                </button>
                {msg && <span className="say">{msg}</span>}
                {!msg && (
                  <span className="say">
                    Your sentences, cut where you paused, at the second you
                    said them. No model touches this.
                  </span>
                )}
              </div>
            </div>

            {r.entries.map(e => (
              <div className="item" key={e.id}>
                <div className="x"><Link href={`/entry/${e.id}`}>{e.text}</Link></div>
                <div className="m">
                  {e.span_start != null && <time>{clock(e.span_start)}</time>}
                  <span>on the log</span>
                </div>
              </div>
            ))}

            {r.words.length > 0 && (
              <>
                <div className="lsec">
                  <span>the transcript</span>
                  <b>as it was heard</b>
                </div>
                <p className="tw">
                  {r.words.map((w, i) => (
                    <span
                      key={w.word_index}
                      className={i === activeIndex ? 'on' : undefined}
                      title={clock(w.start_time)}
                    >{w.word} </span>
                  ))}
                </p>
              </>
            )}

            <div className="lsec"><span>do something</span></div>
            <div className="paste" style={{ marginTop: 14 }}>
              <div className="bar">
                <button
                  onClick={async () => {
                    if (!confirm('Bury this recording? The file stays in R2 — nothing is deleted.')) return
                    const res = await fetch(`/api/v2/vlogs/${params.id}`, { method: 'DELETE' })
                    if (res.ok) router.push('/vlogs')
                  }}
                >Bury it</button>
                <span className="say">
                  It comes off the feed and out of the counts. The file stays.
                </span>
              </div>
            </div>
          </>
        )}
      </div>
    </Shell>
  )
}
