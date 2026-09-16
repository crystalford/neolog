'use client'

/**
 * Now — the intake with nothing else on the screen.
 *
 * Translated from `now.html` + `intake.css`. A bundle of long waves sweeping
 * diagonally behind the slab and out past its edges; the slab itself; and
 * one line of hint that appears only if you sit in an empty field for a few
 * seconds. No nav, no feed, no counts.
 *
 * SPEC §0 rule 6: never ask at input. This page is the strongest statement
 * of that — there is nothing on it to answer. It takes what you give it,
 * settles, says one word, and clears itself for the next thing.
 */

export const runtime = 'edge'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useIntake } from '@/components/useIntake'

const MicIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="6" y="1.8" width="4" height="7.6" rx="2" />
    <path d="M3.6 8.4a4.4 4.4 0 0 0 8.8 0M8 13v1.4" />
  </svg>
)
const FileIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M9.5 2.2H4.6a1.4 1.4 0 0 0-1.4 1.4v8.8a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.5Z" />
    <path d="M9.5 2.2v3.3h3.3" />
  </svg>
)
const PhotoIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1.8" y="3.4" width="12.4" height="9.4" rx="1.6" />
    <circle cx="8" cy="8.1" r="2.4" />
  </svg>
)
const LinkIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6.6 9.4 9.4 6.6M5.2 10.8l-1 1a2.5 2.5 0 0 1-3.5-3.5l2-2a2.5 2.5 0 0 1 3.5 0M10.8 5.2l1-1a2.5 2.5 0 0 1 3.5 3.5l-2 2a2.5 2.5 0 0 1-3.5 0" />
  </svg>
)
const SendIcon = () => (
  <svg className="ico" viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 13.5v-11M3.5 7 8 2.5 12.5 7" />
  </svg>
)

export default function NowPage() {
  const intake = useIntake()
  const {
    text, setText, pending, attach, removePending,
    recording, toggleMic, canSend, wordCount, submit,
  } = intake

  const [sent, setSent] = useState(false)
  const [ack, setAck] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const [dragging, setDragging] = useState(false)
  const taRef = useRef<HTMLTextAreaElement | null>(null)
  const slabRef = useRef<HTMLDivElement | null>(null)
  const dragDepth = useRef(0)

  // One box at any length.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => { taRef.current?.focus() }, [])

  // A hint, once, only if you sit in an empty field for a few seconds.
  useEffect(() => {
    setHint(false)
    if (text || pending.length) return
    const t = setTimeout(() => setHint(true), 3500)
    return () => clearTimeout(t)
  }, [text, pending.length])

  // Drop anywhere on the page.
  useEffect(() => {
    const enter = (e: DragEvent) => { e.preventDefault(); dragDepth.current++; setDragging(true) }
    const leave = (e: DragEvent) => {
      e.preventDefault()
      if (--dragDepth.current <= 0) { dragDepth.current = 0; setDragging(false) }
    }
    const over = (e: DragEvent) => e.preventDefault()
    const drop = (e: DragEvent) => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (e.dataTransfer?.files.length) void attach(e.dataTransfer.files)
    }
    addEventListener('dragenter', enter)
    addEventListener('dragleave', leave)
    addEventListener('dragover', over)
    addEventListener('drop', drop)
    return () => {
      removeEventListener('dragenter', enter)
      removeEventListener('dragleave', leave)
      removeEventListener('dragover', over)
      removeEventListener('drop', drop)
    }
  }, [attach])

  // The light inside the slab follows the pointer.
  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = slabRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
  }, [])

  const put = useCallback(async () => {
    const words = wordCount
    const files = pending.filter(p => p.r2_key && !p.error).length
    const r = await submit()
    if (!r) return
    setSent(true)
    setTimeout(() => {
      setSent(false)
      taRef.current?.focus()
      setAck('in'
        + (words ? ` · ${words} words` : '')
        + (files ? ` · ${files} ${files === 1 ? 'file' : 'files'}` : ''))
      setTimeout(() => setAck(null), 1400)
    }, 560)
  }, [submit, wordCount, pending])

  // The signal field: 24 long waves on a diagonal spine, fanned at the ends
  // and tight at the centre, so they pass behind the slab and emerge past
  // its edges. Seeded so it is the same field every time.
  const waves = useMemo(() => buildWaves(), [])

  const cls = ['nowpage']
  if (text.length > 0) cls.push('hot')
  if (recording) cls.push('rec')
  if (dragging) cls.push('drag')

  return (
    <div className={cls.join(' ')}>
      <div className="atm" />
      <svg className="waves" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <linearGradient id="wg" x1="0" x2="1">
            <stop offset="0" stopColor="#4ea1d5" stopOpacity="0" />
            <stop offset=".35" stopColor="#4ea1d5" stopOpacity=".9" />
            <stop offset=".65" stopColor="#34c1a8" stopOpacity=".9" />
            <stop offset="1" stopColor="#34c1a8" stopOpacity="0" />
          </linearGradient>
          <filter id="soft" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
          <filter id="softer" x="-10%" y="-50%" width="120%" height="200%">
            <feGaussianBlur stdDeviation="14" />
          </filter>
          <radialGradient id="fade" cx=".5" cy=".5" r=".62">
            <stop offset=".5" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </radialGradient>
          <mask id="m"><rect width="1600" height="900" fill="url(#fade)" /></mask>
        </defs>
        <g mask="url(#m)">
          <g filter="url(#softer)" opacity=".55">
            {waves.filter((_, i) => i % 4 === 0).map((w, i) => (
              <path key={i} d={w.d} fill="none" stroke="url(#wg)" strokeWidth="10" opacity=".6" />
            ))}
          </g>
          <g filter="url(#soft)">
            {waves.map((w, i) => (
              <path key={i} d={w.d} fill="none" stroke="url(#wg)" strokeWidth={w.w} opacity={w.o} strokeLinecap="round" />
            ))}
          </g>
        </g>
      </svg>
      <div className="grain" />
      <div className="vig" />

      <div className="top">
        <Link className="lock" href="/">
          <span className="mk">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M 3 16 Q 9 4, 16 16 T 29 16" stroke="currentColor" strokeWidth="1.9" fill="none" strokeLinecap="round" />
              <circle cx="3" cy="16" r="2.4" fill="currentColor" />
              <circle cx="29" cy="16" r="2.4" fill="currentColor" />
            </svg>
          </span>
          <span className="wm">neolog</span>
        </Link>
        <Link className="tolog" href="/">the log</Link>
      </div>

      <section className="stage">
        <div className={`hint${hint ? ' show' : ''}`}>
          Talk, type, or drop something in. <kbd>↵</kbd> puts it in.
        </div>
        <div
          className={`slab${sent ? ' sent' : ''}`}
          ref={slabRef}
          onPointerMove={onPointerMove}
        >
          {/* `now.html`'s `.pulse` — a teal line that crosses the slab once
              when a note goes in. `.slab.sent .pulse` runs it; nothing here
              decides when. It is the receipt at its quietest: §0 rule 6 is
              one line saying what happened and then silence, and on the
              screen with no feed to show the new row, this is that line. */}
          <i className="pulse" />
          <span className={`ack${ack ? ' show' : ''}`}>{ack || 'in'}</span>
          <div className="in">
            {pending.length > 0 && (
              <div className="att">
                {pending.map(p => (
                  <span className="chip" key={p.key}>
                    {p.file.type.startsWith('image/') ? <PhotoIcon />
                      : p.file.type.startsWith('audio/') ? <MicIcon />
                      : <FileIcon />}
                    <span>{p.file.name}</span>
                    <em>{p.error ? p.error : p.uploading ? 'going up' : fmtBytes(p.file.size)}</em>
                    <button onClick={() => removePending(p.key)} aria-label="Remove">×</button>
                  </span>
                ))}
              </div>
            )}
            <span className="cnt">{wordCount ? `${wordCount} ${wordCount === 1 ? 'word' : 'words'}` : ''}</span>
            <textarea
              ref={taRef}
              rows={2}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void put() }
              }}
              onPaste={e => {
                const files = e.clipboardData?.files
                if (files && files.length) { e.preventDefault(); void attach(files) }
              }}
            />
            <div className="bar">
              <button
                className={`way mic${recording ? ' on' : ''}`}
                data-n="talk"
                onClick={() => void toggleMic()}
              ><MicIcon /></button>
              <span className="sep" />
              <label className="way" data-n="files">
                <FileIcon />
                <input type="file" multiple onChange={e => {
                  if (e.target.files) void attach(e.target.files)
                  e.target.value = ''
                }} />
              </label>
              <label className="way" data-n="photos">
                <PhotoIcon />
                <input type="file" accept="image/*,video/*" multiple onChange={e => {
                  if (e.target.files) void attach(e.target.files)
                  e.target.value = ''
                }} />
              </label>
              <button
                className="way"
                data-n="link"
                onClick={() => {
                  const u = window.prompt('Paste the link')
                  if (u) setText(t => (t ? `${t}\n${u}` : u))
                }}
              ><LinkIcon /></button>
              <button className="send" title="Put it in · Enter" disabled={!canSend} onClick={() => void put()}>
                <SendIcon />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

// ── The signal field ──────────────────────────────────────────────────────

function buildWaves(): { d: string; w: string; o: string }[] {
  const N = 24
  const W = 1600
  let s = 7
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff }
  const out: { d: string; w: string; o: string }[] = []
  for (let i = 0; i < N; i++) {
    const spread = (i - (N - 1) / 2) / ((N - 1) / 2)   // -1..1
    const amp = 30 + rnd() * 60
    const f = 0.7 + rnd() * 0.9
    const ph = rnd() * Math.PI * 2
    let d = ''
    for (let x = -60; x <= W + 60; x += 20) {
      const t = x / W
      // The spine enters low-left and exits high-right, crossing the slab's
      // lower edge on the way.
      const spine = 720 - 540 * t
      const fan = spread * (70 + 190 * Math.abs(t - 0.5) * 2)
      const y = spine + fan + Math.sin(t * Math.PI * 2 * f + ph) * amp
      d += `${x === -60 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)} `
    }
    out.push({ d, w: (0.7 + rnd() * 1.3).toFixed(2), o: (0.35 + rnd() * 0.55).toFixed(2) })
  }
  return out
}

function fmtBytes(b: number): string {
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`
  return `${Math.round(b / 1e3)} KB`
}
