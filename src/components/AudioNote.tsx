'use client'

/**
 * A voice note in the feed, played where it sits.
 *
 * `log.html`'s `.aud`: a round play button, a track that fills as it plays
 * and seeks when you click it, and the duration in mono beside it. Replaces
 * the browser's default `<audio controls>`, which is 300px of Chrome-shaped
 * furniture in the middle of a design that has none.
 *
 * ⚠️ **There are no waveform bars, and that is on purpose.**
 *
 * The design draws `.wv` as twenty-odd `<i>` bars at hand-picked heights —
 * `style="height:34%"`, `52%`, `70%` — because it is a mock-up and someone
 * chose a shape that looked like speech. We have no amplitude data for these
 * files: nothing in the pipeline measures one, and `vlogs` carries no column
 * for it. Bars drawn without measuring are a picture of a recording the log
 * never looked at, presented beside the real duration as though both were
 * facts. That is §0 rule 3 — nothing is inferred or filled in.
 *
 * So `.wv` is the design's track, flat, with `.prog` filling it. Every other
 * measurement in the chrome is real: the position, the duration, the seek.
 * If a waveform is wanted, FFmpeg can measure one on ingest and then it can
 * be drawn, because it will be true.
 */

import { useCallback, useRef, useState } from 'react'

function clock(s: number): string {
  if (!isFinite(s) || s < 0) return '0:00'
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
}

export function AudioNote({ src, duration }: { src: string; duration?: number | null }) {
  const el = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [at, setAt] = useState(0)
  const [len, setLen] = useState(duration ?? 0)

  const toggle = useCallback(() => {
    const a = el.current
    if (!a) return
    if (a.paused) { void a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }, [])

  const seek = useCallback((ev: React.MouseEvent<HTMLSpanElement>) => {
    const a = el.current
    if (!a || !len) return
    const box = ev.currentTarget.getBoundingClientRect()
    const to = ((ev.clientX - box.left) / box.width) * len
    a.currentTime = Math.max(0, Math.min(len, to))
    setAt(a.currentTime)
  }, [len])

  const pct = len > 0 ? Math.min(100, (at / len) * 100) : 0

  return (
    // The row links to the entry, so every gesture in here stops before it
    // reaches the link — pressing play must not navigate away.
    <span className="aud" onClick={ev => { ev.preventDefault(); ev.stopPropagation() }}>
      <button
        className="pb"
        onClick={toggle}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {playing ? <span className="pause" /> : <span className="tri" />}
      </button>

      {/* The track. `.prog` is what has been played — it is a position, and
          the log measured it. */}
      <span className="wv" onClick={seek} role="presentation">
        <i />
        <span className="prog" style={{ width: `${pct}%` }} />
      </span>

      <span className="tm">{len ? `${clock(at)} / ${clock(len)}` : clock(at)}</span>

      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio
        ref={el}
        src={src}
        /* ⚠️ `none`, not `metadata`. This renders once per voice note in the
           FEED, and `metadata` makes the browser open every one of them on
           page load — up to a couple of hundred range requests against R2
           for presigned URLs nobody has pressed play on. The duration is
           already in the API, so there is nothing to fetch until he plays
           it; `onLoadedMetadata` still fires then, and covers a row whose
           duration the log does not know. */
        preload="none"
        onLoadedMetadata={e => {
          const d = (e.target as HTMLAudioElement).duration
          if (isFinite(d) && d > 0) setLen(d)
        }}
        onTimeUpdate={e => setAt((e.target as HTMLAudioElement).currentTime)}
        onEnded={() => { setPlaying(false); setAt(0) }}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        style={{ display: 'none' }}
      />
    </span>
  )
}
