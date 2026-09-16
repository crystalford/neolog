'use client'

/**
 * The lightbox, and your place on the log.
 *
 * Both translated from `view.js`, which is the normative source for the
 * two-gesture decision (`HANDOFF.md` § Decisions already made).
 *
 * ── The lightbox ─────────────────────────────────────────────────────────
 *
 * "click a photo → a lightbox over the feed. You never leave." It is not a
 * bare overlay: it steps through every picture on the page, captions each
 * one with the sentence of the row it belongs to, and answers the keyboard.
 * A picture in a log is evidence, and evidence you can only look at one at a
 * time, with no idea what is next to it, is worse evidence.
 *
 * ── Your place ───────────────────────────────────────────────────────────
 *
 * `view.js` lines 16-17 state why this exists: "Because every look at detail
 * is now a navigation, coming back matters more: the log records which entry
 * you left from and returns you to it."
 *
 * This is what pays for the two-gesture rule. Rows expanding in place was
 * rejected because every click pushed the rest of the feed down; the price
 * of that decision is that reading an entry costs a navigation, and without
 * the return you land back at the top of a four-thousand-row feed having
 * lost your place. Without this, the gesture decision is worse than the
 * thing it replaced.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const PLACE_KEY = 'neolog:place'

/** Remember which row was left from, and how far down the page it was. */
export function rememberPlace(href: string) {
  try {
    sessionStorage.setItem(PLACE_KEY, JSON.stringify({ at: href, y: window.scrollY }))
  } catch { /* private browsing — the feed just doesn't restore */ }
}

/**
 * Put the reader back where they were. Called once the feed has rendered,
 * because the row has to exist before it can be scrolled to.
 *
 * Falls back to the raw scroll position when the row is gone — it may have
 * been buried, or the filter may have changed since.
 */
export function restorePlace() {
  const feed = document.getElementById('feed')
  if (!feed) return
  let p: { at?: string; y?: number } | null = null
  try { p = JSON.parse(sessionStorage.getItem(PLACE_KEY) || 'null') } catch { return }
  if (!p) return

  const row = p.at
    ? feed.querySelector<HTMLElement>(`.en[data-open="${CSS.escape(p.at)}"]`)
    : null

  if (row) {
    const top = row.getBoundingClientRect().top + window.scrollY
    window.scrollTo({ top: Math.max(0, top - 140), behavior: 'instant' as ScrollBehavior })
    // One quiet flash so the eye finds the row without being shouted at.
    row.classList.add('landed')
    setTimeout(() => row.classList.remove('landed'), 1600)
  } else if (typeof p.y === 'number') {
    window.scrollTo({ top: p.y, behavior: 'instant' as ScrollBehavior })
  }
}

/** Restore once the rows are on the page. */
export function useRestorePlace(ready: boolean) {
  const done = useRef(false)
  useEffect(() => {
    if (!ready || done.current) return
    done.current = true
    // Two frames: one for the rows to mount, one for layout to settle.
    requestAnimationFrame(() => requestAnimationFrame(() => restorePlace()))
  }, [ready])
}

export interface Shot {
  url: string
  /** The sentence of the row this picture belongs to. */
  said?: string | null
  alt?: string | null
}

/**
 * The lightbox itself. `shots` is every picture on the page in document
 * order; `index` is the one that was clicked, or null when it is closed.
 */
export function LogLightbox({ shots, index, onClose, onIndex }: {
  shots: Shot[]
  index: number | null
  onClose: () => void
  onIndex: (i: number) => void
}) {
  const open = index !== null && index >= 0 && index < shots.length

  const step = useCallback((d: number) => {
    if (index === null) return
    const next = index + d
    if (next >= 0 && next < shots.length) onIndex(next)
  }, [index, shots.length, onIndex])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') step(-1)
      else if (e.key === 'ArrowRight') step(1)
    }
    document.addEventListener('keydown', onKey)
    // The page behind must not scroll while a picture is open.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose, step])

  if (!open) return null
  const shot = shots[index!]

  return (
    <div className="lb on" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <button className="x" aria-label="Close" onClick={onClose}>×</button>
      <button
        className={`nav prev${index === 0 ? ' off' : ''}`}
        aria-label="Previous"
        onClick={e => { e.stopPropagation(); step(-1) }}
      >‹</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={shot.url} alt={shot.alt || ''} onClick={onClose} />
      <button
        className={`nav next${index === shots.length - 1 ? ' off' : ''}`}
        aria-label="Next"
        onClick={e => { e.stopPropagation(); step(1) }}
      >›</button>
      <div className="cap">
        {shot.said && <b>{shot.said}</b>}
        {shot.alt || ''}
      </div>
    </div>
  )
}

/** Collect every picture currently on the page, in the order they appear. */
export function useShots(deps: unknown): Shot[] {
  const [shots, setShots] = useState<Shot[]>([])
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLImageElement>('.pics img[src]'))
    setShots(els.map(el => {
      const row = el.closest('.en')
      const said = row?.querySelector('.s')?.textContent || null
      return { url: el.getAttribute('src') || '', said, alt: el.getAttribute('alt') || null }
    }))
  }, [deps])
  return shots
}
