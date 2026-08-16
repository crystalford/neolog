'use client'

/**
 * VlogTranscriptEditor — whole-vlog click-to-cut editor, mounted on
 * /vlog/[id] right after the player. Same interaction as the single-clip
 * editor (/clips/[id]/edit): click a word to set a selection start,
 * shift-click to extend it. The difference here is the mental model —
 * this isn't picking one span to keep, it's cutting bad spans OUT of the
 * whole transcript. Everything is kept by default; a "Cut" action removes
 * the current selection; clicking an already-cut (struck-through) word
 * restores it.
 *
 * Cuts persist as a draft (word-index ranges) on the vlog row via PATCH
 * .../cut-ranges — explicit "Save draft" action, no autosave, matching
 * the clip editor's convention. "Render edit →" saves then asks the
 * FFmpeg worker to actually cut + stitch the kept spans into one MP4/MP3
 * and opens the resulting production.
 *
 * "Play edited" is a zero-cost preview: while it's on, playback jumps
 * over any cut range live, using the vlog page's own currentT/seek
 * plumbing — no FFmpeg call needed to get a feel for the edit.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

interface Word { word: string; start_time: number; end_time: number }
interface CutRange { start_word_index: number; end_word_index: number }
interface TranscriptData {
  vlog_id: string
  vlog_title: string | null
  duration_seconds: number | null
  words: Word[]
  cut_ranges: CutRange[]
  cut_ranges_updated_at: string | null
}

function mergeRanges(ranges: CutRange[]): CutRange[] {
  const sorted = [...ranges].sort((a, b) => a.start_word_index - b.start_word_index)
  const out: CutRange[] = []
  for (const r of sorted) {
    const last = out[out.length - 1]
    if (last && r.start_word_index <= last.end_word_index + 1) {
      last.end_word_index = Math.max(last.end_word_index, r.end_word_index)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

export default function VlogTranscriptEditor({
  vlogId, hasWordTimestamps, fallbackText, currentT, seek,
}: {
  vlogId: string
  hasWordTimestamps: boolean
  fallbackText: string | null
  currentT: number
  seek: (t: number) => void
}) {
  const [data, setData] = useState<TranscriptData | null>(null)
  const [cutRanges, setCutRanges] = useState<CutRange[]>([])
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [playEdited, setPlayEdited] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadedRef = useRef(false)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v2/vlogs/${vlogId}/transcript-words`, { credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setData(d)
      setCutRanges(Array.isArray(d.cut_ranges) ? d.cut_ranges : [])
      setSelStart(null); setSelEnd(null)
    } catch (e: any) {
      setError(e?.message || String(e))
    }
  }, [vlogId])

  useEffect(() => {
    if (!hasWordTimestamps || loadedRef.current) return
    loadedRef.current = true
    load()
  }, [hasWordTimestamps, load])

  const onWordClick = (idx: number, shiftKey: boolean) => {
    const hitRange = cutRanges.find(r => idx >= r.start_word_index && idx <= r.end_word_index)
    if (hitRange) {
      // Click a struck-through word to bring it back.
      setCutRanges(prev => prev.filter(r => r !== hitRange))
      return
    }
    if (shiftKey) {
      if (selStart != null && idx < selStart) { setSelStart(idx); return }
      setSelEnd(idx)
    } else {
      if (selEnd != null && idx > selEnd) { setSelEnd(idx); return }
      setSelStart(idx); setSelEnd(null)
    }
  }

  const selection = useMemo(() => {
    if (!data || selStart == null || selEnd == null) return null
    const words = data.words.slice(selStart, selEnd + 1)
    const text = words.map(w => w.word).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
    return { text, startIdx: selStart, endIdx: selEnd }
  }, [data, selStart, selEnd])

  const cutSelection = () => {
    if (!selection) return
    setCutRanges(prev => mergeRanges([...prev, { start_word_index: selection.startIdx, end_word_index: selection.endIdx }]))
    setSelStart(null); setSelEnd(null)
  }

  const saveDraft = async () => {
    setSaving(true); setNote(null)
    try {
      const r = await fetch(`/api/v2/vlogs/${vlogId}/cut-ranges`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cut_ranges: cutRanges }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setNote('Draft saved.')
      load()
    } catch (e: any) {
      setNote(`Save failed: ${e?.message || e}`)
    } finally { setSaving(false) }
  }

  const renderEdit = async () => {
    setRendering(true); setNote(null)
    try {
      const saveR = await fetch(`/api/v2/vlogs/${vlogId}/cut-ranges`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cut_ranges: cutRanges }),
      })
      if (!saveR.ok) { const d: any = await saveR.json(); throw new Error(d?.error || `HTTP ${saveR.status}`) }
      const r = await fetch(`/api/v2/vlogs/${vlogId}/render-edit`, { method: 'POST', credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok || !d?.production_id) throw new Error(d?.error || `HTTP ${r.status}`)
      window.location.href = `/production/${d.production_id}`
    } catch (e: any) {
      setNote(`Render failed: ${e?.message || e}`)
      setRendering(false)
    }
  }

  // Cut ranges in seconds, for the "Play edited" live-skip preview.
  const cutTimeRanges = useMemo(() => {
    if (!data) return []
    return cutRanges
      .map(r => ({
        start: data.words[r.start_word_index]?.start_time,
        end: data.words[r.end_word_index]?.end_time,
      }))
      .filter((r): r is { start: number; end: number } => r.start != null && r.end != null)
      .sort((a, b) => a.start - b.start)
  }, [data, cutRanges])

  useEffect(() => {
    if (!playEdited) return
    const hit = cutTimeRanges.find(r => currentT >= r.start && currentT < r.end - 0.05)
    if (hit) seek(hit.end)
  }, [playEdited, currentT, cutTimeRanges, seek])

  if (!hasWordTimestamps) {
    return (
      <section className="canon-section">
        <div className="canon-section-head">
          <h2>Transcript</h2>
          <div className="meta">read-only · no word-level timestamps for this vlog</div>
        </div>
        <div className="canon-transcript-flow" style={{ ['--topic' as any]: 'var(--fg-3)' } as React.CSSProperties}>
          {fallbackText}
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="canon-section">
        <div className="canon-section-head"><h2>Transcript editor</h2></div>
        <div style={{ color: 'var(--t-terra)', fontSize: 13 }}>{error}</div>
      </section>
    )
  }

  if (!data) {
    return (
      <section className="canon-section">
        <div className="canon-section-head"><h2>Transcript editor</h2></div>
        <div className="neolog-skeleton" style={{ height: 200 }}/>
      </section>
    )
  }

  const totalCutSec = cutTimeRanges.reduce((s, r) => s + (r.end - r.start), 0)

  return (
    <section className="canon-section">
      <div className="canon-section-head">
        <h2>Transcript editor <span className="meta">· {data.words.length.toLocaleString()} words</span></h2>
        <div className="meta">click a word to set start, shift-click for end, cut what doesn't belong</div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
        {selection ? (
          <button onClick={cutSelection} className="canon-btn" style={{ fontSize: 12.5, padding: '6px 14px', color: 'var(--t-terra)' }}>
            Cut selection ({selection.text.split(/\s+/).length}w)
          </button>
        ) : null}
        <button
          onClick={() => setPlayEdited(v => !v)}
          className={playEdited ? 'canon-btn primary' : 'canon-btn ghost'}
          style={{ fontSize: 12.5, padding: '6px 14px' }}
        >
          {playEdited ? 'Playing edited ✓' : 'Play edited'}
        </button>
        <button onClick={saveDraft} disabled={saving || rendering} className="canon-btn ghost" style={{ fontSize: 12.5, padding: '6px 14px' }}>
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        <button onClick={renderEdit} disabled={saving || rendering} className="canon-btn primary" style={{ fontSize: 12.5, padding: '6px 14px' }}>
          {rendering ? 'Rendering…' : 'Render edit →'}
        </button>
        {cutRanges.length > 0 && (
          <span style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>
            {cutRanges.length} cut{cutRanges.length === 1 ? '' : 's'} · {totalCutSec.toFixed(0)}s removed
          </span>
        )}
        {note && <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{note}</span>}
      </div>

      <div style={{
        padding: '20px 24px', borderRadius: 12,
        background: 'var(--bg-1)', border: '1px solid var(--line-1)',
        fontSize: 15.5, lineHeight: 1.9, color: 'var(--fg-2)',
        userSelect: 'none',
      }}>
        {data.words.map((w, i) => {
          const isCut = cutRanges.some(r => i >= r.start_word_index && i <= r.end_word_index)
          const inSel = selStart != null && selEnd != null && i >= selStart && i <= selEnd
          const isAnchor = selStart != null && selEnd == null && i === selStart
          return (
            <span
              key={i}
              onClick={e => onWordClick(i, e.shiftKey)}
              style={{
                cursor: 'pointer',
                padding: '2px 1px',
                borderRadius: 3,
                textDecoration: isCut ? 'line-through' : 'none',
                opacity: isCut ? 0.45 : 1,
                background: inSel ? 'color-mix(in srgb, var(--sig) 22%, transparent)'
                  : isAnchor ? 'color-mix(in srgb, var(--sig) 12%, transparent)' : 'transparent',
                color: inSel ? 'var(--fg)' : 'var(--fg-2)',
                fontWeight: inSel ? 500 : 400,
                borderLeft: isAnchor ? '2px solid var(--sig)' : 'none',
              }}
            >
              {w.word}{' '}
            </span>
          )
        })}
      </div>
    </section>
  )
}
