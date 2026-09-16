'use client'

/**
 * Footage — the record as material.
 *
 * `footage.html` / SPEC §2: every clip findable by what is in the frame, his
 * usable marks, where each has been used, and a hand-off an editor can work
 * from. It closes the "organization app" gap: the same recordings the log
 * quotes from, seen as a bin instead of as a record.
 *
 * ── The fence, drawn on the page ─────────────────────────────────────────
 *
 * "The log never chooses or assembles b-roll." So there is no suggested
 * shot list here, no relevance ranking, no "clips that would work for this".
 * Results are in date order, always — a relevance score would be the log
 * having an opinion about which of his footage is good.
 *
 * What the page does do is say WHICH index found a clip. "Found because you
 * said it" and "found because it was in shot" are different facts, and a
 * filmmaker looking for a shot needs to know which one he got.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Shell from '@/components/Shell'

interface Clip {
  id: string; title: string | null; original_filename: string | null
  poster: string | null; duration_seconds: number | null; recorded_at: string
  in_frame: string | null; frame_note: string | null; tags: string[]
  has_speech: boolean; usable: number | null; usable_note: string | null
  used_in: number; matched: string[]
}

const day = (s: string) => {
  const d = new Date(s)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const mins = (s: number | null) => {
  if (!s || s <= 0) return ''
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`
}

const MARKS: { k: string; label: string }[] = [
  { k: '', label: 'everything' },
  { k: 'usable', label: 'usable' },
  { k: 'unmarked', label: 'not marked yet' },
  { k: 'no', label: 'no' },
]

export default function Footage() {
  const [clips, setClips] = useState<Clip[]>([])
  const [q, setQ] = useState('')
  const [mark, setMark] = useState('')
  const [silent, setSilent] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [noteText, setNoteText] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (q.trim()) p.set('q', q.trim())
      if (mark) p.set('mark', mark)
      if (silent) p.set('silent', '1')
      const res = await fetch(`/api/v2/footage?${p}`, { cache: 'no-store' })
      if (res.ok) setClips(((await res.json()) as { clips: Clip[] }).clips || [])
    } catch { setClips([]) }
    finally { setLoading(false) }
  }, [q, mark, silent])
  useEffect(() => { void load() }, [mark, silent]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback(async (payload: Record<string, unknown>) => {
    try {
      await fetch('/api/v2/footage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      await load()
    } catch { /* the row just doesn't change */ }
  }, [load])

  return (
    <Shell>
      <div className="logpage pg-footage">
        <div className="back">
          <Link href="/">the log</Link>
          <Link href="/vlogs">recordings</Link>
        </div>

        <div className="pghead"><h1>Footage</h1></div>
        <div className="stamp">
          <span>the same recordings, as material</span>
          {clips.length > 0 && <span>{clips.length} shown</span>}
        </div>

        <p className="none" style={{ paddingBottom: 12 }}>
          Findable by what is in the frame as well as by what you said. The
          log never picks a shot or assembles anything — it finds, you mark.
        </p>

        <div className="paste" style={{ marginBottom: 8 }}>
          <input
            className="ti"
            style={{ borderRadius: 12, borderBottom: '1px solid var(--line-1)', fontSize: 15 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void load() }}
            placeholder="a car at night · the kitchen · Ancaster"
          />
          <div className="who">
            {MARKS.map(m => (
              <button key={m.k} className={mark === m.k ? 'on' : ''} onClick={() => setMark(m.k)}>
                {m.label}
              </button>
            ))}
            <button className={silent ? 'on' : ''} onClick={() => setSilent(v => !v)}>
              no speech in it
            </button>
          </div>
          <div className="bar">
            <button className="p" onClick={() => void load()}>Find it</button>
            <a href={`/api/v2/footage/sheet${mark === 'usable' ? '?mark=usable' : ''}`}>
              Hand off {mark === 'usable' ? 'what you marked usable' : 'everything'}
            </a>
            <span className="say">
              A sheet an editor can work from. The originals stay where they are.
            </span>
          </div>
        </div>

        {loading && <div className="none">Looking.</div>}
        {!loading && !clips.length && (
          <div className="none">
            {q
              ? 'Nothing with that in the frame or in what you said.'
              : 'No recordings here yet.'}
          </div>
        )}

        <div className="shots">
          {clips.map(c => (
            <div className="shot" key={c.id}>
              {c.poster
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.poster} alt="" loading="lazy" />
                : <div style={{ width: 108, height: 108, borderRadius: 8, background: 'var(--bg-2)' }} />}
              <div className="body">
                <Link className="x" href={`/vlog/${c.id}`}>
                  {c.original_filename || 'a recording'}
                </Link>
                <div className="m">
                  <time dateTime={c.recorded_at}>{day(c.recorded_at)}</time>
                  {c.duration_seconds && <span>{mins(c.duration_seconds)}</span>}
                  {!c.has_speech && <span>no speech</span>}
                  {c.used_in > 0 && <span>{c.used_in} on the log from it</span>}
                  {c.matched.map(m => <span key={m}>found {m}</span>)}
                </div>

                {/* What the log saw, and his correction, kept apart and both
                    shown — never one quietly replacing the other. */}
                {c.frame_note && <div className="why"><b>{c.frame_note}</b></div>}
                {c.in_frame && (
                  <div className="why">
                    {c.in_frame}
                    {c.frame_note && <em style={{ fontStyle: 'normal', color: 'var(--fg-4)' }}> — the log&rsquo;s</em>}
                  </div>
                )}
                {c.tags.length > 0 && (
                  <div className="m">{c.tags.slice(0, 8).map(t => <span key={t}>{t}</span>)}</div>
                )}

                {editing === c.id ? (
                  <div className="paste" style={{ margin: '10px 0 0' }}>
                    <input
                      className="ti"
                      style={{ borderRadius: 9, borderBottom: '1px solid var(--line-1)', fontSize: 14 }}
                      value={noteText}
                      onChange={e => setNoteText(e.target.value)}
                      placeholder="What is actually in it."
                    />
                    <div className="bar">
                      <button className="p" onClick={() => { void patch({ id: c.id, frame_note: noteText }); setEditing(null) }}>
                        Keep
                      </button>
                      <button onClick={() => setEditing(null)}>Not now</button>
                    </div>
                  </div>
                ) : (
                  <div className="who" style={{ marginTop: 10 }}>
                    <button
                      className={c.usable === 1 ? 'on' : ''}
                      onClick={() => void patch({ id: c.id, usable: c.usable === 1 ? null : true })}
                    >usable</button>
                    <button
                      className={c.usable === 0 ? 'on' : ''}
                      onClick={() => void patch({ id: c.id, usable: c.usable === 0 ? null : false })}
                    >no</button>
                    <button onClick={() => { setNoteText(c.frame_note || ''); setEditing(c.id) }}>
                      fix what&rsquo;s in it
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Shell>
  )
}
