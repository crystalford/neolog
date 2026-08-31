'use client'

/**
 * Clip editor — extend or trim a clip by selecting words, not scrubbing
 * video. Most extractor-flagged candidates are one-liner fragments; this
 * is where the operator fixes that: read the surrounding transcript,
 * click a word to set the clip's start, shift-click a word to set its
 * end. The highlighted range IS the clip.
 *
 * Save (PATCH /api/v2/clip-candidates/[id]) recomputes the verbatim quote
 * from the new span and clears the clip-quality judge's score so the new
 * content gets its own verdict on the next backlog sweep. Cut ships
 * immediately via the existing ship-as-short endpoint.
 */

export const runtime = 'edge'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'

interface Word { word: string; start_time: number; end_time: number }
interface WindowData {
  clip_id: string; vlog_id: string; vlog_title: string | null
  headline: string; quote: string | null
  current_start_time: number; current_end_time: number
  window_start_time: number; window_end_time: number
  words: Word[]
}

export default function ClipEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [data, setData] = useState<WindowData | null>(null)
  const [selStart, setSelStart] = useState<number | null>(null)
  const [selEnd, setSelEnd] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [cutting, setCutting] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/v2/clip-candidates/${id}/transcript-window`, { credentials: 'include' })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setData(d)
      // Initialize selection from the clip's current boundaries.
      const words: Word[] = d.words || []
      let startIdx = words.findIndex(w => w.start_time >= d.current_start_time)
      if (startIdx < 0) startIdx = 0
      let endIdx = words.length - 1
      for (let i = words.length - 1; i >= 0; i--) {
        if (words[i].end_time <= d.current_end_time) { endIdx = i; break }
      }
      if (endIdx < startIdx) endIdx = startIdx
      setSelStart(startIdx)
      setSelEnd(endIdx)
    } catch (e: any) {
      setNote(`Failed to load: ${e?.message || e}`)
    }
  }, [id])
  useEffect(() => { load() }, [load])

  const onWordClick = (idx: number, shiftKey: boolean) => {
    if (shiftKey) {
      if (selStart != null && idx < selStart) { setSelStart(idx); return }
      setSelEnd(idx)
    } else {
      if (selEnd != null && idx > selEnd) { setSelEnd(idx); return }
      setSelStart(idx)
    }
  }

  const selection = useMemo(() => {
    if (!data || selStart == null || selEnd == null) return null
    const words = data.words.slice(selStart, selEnd + 1)
    const text = words.map(w => w.word).join(' ').replace(/\s+([,.!?;:])/g, '$1').trim()
    const start = data.words[selStart]?.start_time ?? 0
    const end = data.words[selEnd]?.end_time ?? 0
    return { text, start, end, duration: Math.max(0, end - start) }
  }, [data, selStart, selEnd])

  const save = async () => {
    if (!selection) return
    setSaving(true); setNote(null)
    try {
      const r = await fetch(`/api/v2/clip-candidates/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: selection.start, end_time: selection.end, quote: selection.text }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setNote('Saved. This will get a fresh quality score on the next pass.')
      load()
    } catch (e: any) {
      setNote(`Save failed: ${e?.message || e}`)
    } finally { setSaving(false) }
  }

  const saveAndCut = async () => {
    if (!selection) return
    setCutting(true); setNote(null)
    try {
      const saveR = await fetch(`/api/v2/clip-candidates/${id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start_time: selection.start, end_time: selection.end, quote: selection.text }),
      })
      if (!saveR.ok) { const d: any = await saveR.json(); throw new Error(d?.error || `HTTP ${saveR.status}`) }
      const cutR = await fetch(`/api/v2/clip-candidates/${id}/ship-as-short`, {
        method: 'POST', credentials: 'include',
      })
      const cutD: any = await cutR.json()
      if (!cutR.ok || !cutD?.production_id) throw new Error(cutD?.error || `HTTP ${cutR.status}`)
      router.push(`/production/${cutD.production_id}`)
    } catch (e: any) {
      setNote(`Failed: ${e?.message || e}`)
      setCutting(false)
    }
  }

  if (!data) {
    return (
      <Shell>
        <div style={{ maxWidth: 820, margin: '0 auto', padding: '60px 4px' }}>
          {note ? <div style={{ color: 'var(--t-terra)' }}>{note}</div> : <div className="neolog-skeleton" style={{ height: 300 }}/>}
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ padding: '24px 0 8px', fontSize: 12, color: 'var(--fg-3)' }}>
          <Link href="/drafts?tab=clips" style={{ color: 'inherit', textDecoration: 'none' }}>← Clips</Link>
        </div>
        <section style={{ paddingBottom: 20 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>
            Edit clip · click a word to set start, shift-click for end
          </div>
          <h1 style={{
            fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: 300, letterSpacing: '-1.2px',
            lineHeight: 1.1, color: 'var(--fg)', margin: '0 0 8px',
          }}>
            {data.headline}
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-4)' }}>
            {data.vlog_title ? `from ${data.vlog_title}` : ''}
          </div>
        </section>

        {selection && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 5,
            padding: '14px 18px', marginBottom: 20,
            background: 'var(--bg-1)', border: '1px solid var(--line-1)',
            borderLeft: '3px solid var(--sig)', borderRadius: 10,
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 1.4,
              textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 8,
              display: 'flex', gap: 12,
            }}>
              <span>{selection.duration.toFixed(1)}s selected</span>
            </div>
            <div style={{ fontSize: 15, fontStyle: 'italic', color: 'var(--fg)', lineHeight: 1.4, marginBottom: 12 }}>
              &ldquo;{selection.text}&rdquo;
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={save} disabled={saving || cutting} className="canon-btn" style={{ fontSize: 12.5, padding: '6px 14px' }}>
                {saving ? 'Saving…' : 'Save boundaries'}
              </button>
              <button onClick={saveAndCut} disabled={saving || cutting} className="canon-btn primary" style={{ fontSize: 12.5, padding: '6px 14px' }}>
                {cutting ? 'Cutting…' : 'Save & cut clip →'}
              </button>
              {note && <span style={{ fontSize: 12, color: 'var(--fg-2)' }}>{note}</span>}
            </div>
          </div>
        )}

        <div style={{
          padding: '24px 26px', borderRadius: 12,
          background: 'var(--bg-1)', border: '1px solid var(--line-1)',
          fontSize: 17, lineHeight: 2, color: 'var(--fg-2)',
          userSelect: 'none',
        }}>
          {data.words.map((w, i) => {
            const inSel = selStart != null && selEnd != null && i >= selStart && i <= selEnd
            return (
              <span
                key={i}
                onClick={e => onWordClick(i, e.shiftKey)}
                style={{
                  cursor: 'pointer',
                  padding: '2px 1px',
                  borderRadius: 3,
                  background: inSel ? 'color-mix(in srgb, var(--sig) 22%, transparent)' : 'transparent',
                  color: inSel ? 'var(--fg)' : 'var(--fg-2)',
                  fontWeight: inSel ? 500 : 400,
                }}
              >
                {w.word}{' '}
              </span>
            )
          })}
        </div>

        <div style={{ padding: '20px 0 60px', fontSize: 12, color: 'var(--fg-4)' }}>
          Click a word to move the start. Shift-click a word to move the end.
        </div>
      </div>
    </Shell>
  )
}
