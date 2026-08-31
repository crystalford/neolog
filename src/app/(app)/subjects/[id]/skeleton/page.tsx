'use client'

/**
 * Skeleton-first script flow (Phase 4).
 *
 * Operator hits "Build the script" on a subject. We generate a BEAT
 * SKELETON first — titles, kinds, one-line directives, anchored on chosen
 * moments. Operator reviews, reorders, drops, regenerates individual beats
 * — never authors prose, only the SHAPE of the argument. Then "Lock & write"
 * runs the prose generator against the locked skeleton, opens the resulting
 * production for recording.
 *
 * This is canopticon Part 9.6 applied to neolog: lock the reasoning, not
 * the voice. Same locked skeleton can be reused to fan out to other
 * deliverables later (article, X thread).
 */

export const runtime = 'edge'

import { use, useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'

interface Moment {
  index: number
  topic: string
  recorded_at: string | null
  kind: string | null
  verbatim_preview: string
}
interface Beat {
  index: number
  title: string
  kind: string
  moment_index: number
  one_line: string
}

const BEAT_KINDS = ['open','claim','story','turn','tension','land','open_question']

export default function SkeletonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [moments, setMoments] = useState<Moment[]>([])
  const [beats, setBeats] = useState<Beat[]>([])
  const [model, setModel] = useState<string | null>(null)
  const [proposing, setProposing] = useState(false)
  const [locking, setLocking] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  const propose = useCallback(async () => {
    setProposing(true)
    setNote('Reading the subject\'s moments and proposing the structure (~15s)…')
    try {
      const r = await fetch(`/api/v2/subjects/${id}/skeleton`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setMoments(d.moments ?? [])
      setBeats(d.beats ?? [])
      setModel(d.model ?? null)
      setNote(`Proposed ${d.beats?.length ?? 0} beats. Re-order or regenerate as needed; then write the script.`)
    } catch (e: any) {
      setNote(`Proposing structure failed: ${e?.message || e}`)
    } finally { setProposing(false) }
  }, [id])

  useEffect(() => { propose() }, [propose])

  const move = (from: number, to: number) => {
    if (to < 0 || to >= beats.length) return
    const next = beats.slice()
    const [b] = next.splice(from, 1)
    next.splice(to, 0, b)
    setBeats(next.map((x, i) => ({ ...x, index: i })))
  }
  const drop = (i: number) => setBeats(beats.filter((_, ix) => ix !== i).map((x, i) => ({ ...x, index: i })))
  const setBeatField = (i: number, patch: Partial<Beat>) =>
    setBeats(beats.map((b, ix) => ix === i ? { ...b, ...patch } : b))

  const lock = async () => {
    setLocking(true)
    setNote('Structure locked. Writing the full prose script from the locked beats (~45s)…')
    try {
      const r = await fetch(`/api/v2/subjects/${id}/skeleton`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lock: true, beats }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      router.push(`/production/${d.production_id}`)
    } catch (e: any) {
      setNote(`Lock failed: ${e?.message || e}`)
      setLocking(false)
    }
  }

  return (
    <Shell>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 4px' }}>
        <div style={{ padding: '24px 0 8px', fontSize: 12, color: 'var(--fg-3)' }}>
          <a href={`/subjects/${id}`} style={{ color: 'inherit', textDecoration: 'none' }}>← Subject</a>
        </div>
        <section style={{ paddingBottom: 28 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: 3.2,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 14,
          }}>Plan the structure</div>
          <h1 style={{
            fontSize: 'clamp(32px, 4vw, 48px)', fontWeight: 300, letterSpacing: '-1.5px',
            lineHeight: 1.05, color: 'var(--fg)', margin: 0,
          }}>
            Lock the argument.<br/>Then write the prose.
          </h1>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', marginTop: 12 }}>
            {note}{model ? ` · ${model}` : ''}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button onClick={propose} disabled={proposing || locking} className="canon-btn ghost" style={{ fontSize: 12.5 }}>
              {proposing ? 'Re-proposing…' : 'Re-propose'}
            </button>
            <button onClick={lock} disabled={locking || proposing || beats.length === 0} className="canon-btn primary" style={{ fontSize: 12.5 }}>
              {locking ? 'Writing…' : 'Write the script'}
            </button>
          </div>
        </section>

        {beats.length === 0 ? (
          <div style={{
            padding: '40px 24px', textAlign: 'center', border: '1px dashed var(--line-2)',
            borderRadius: 14, color: 'var(--fg-3)', fontSize: 14,
          }}>
            {proposing ? 'Working…' : 'No structure yet. Hit "Re-propose".'}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 60 }}>
            {beats.map((b, i) => {
              const m = moments[b.moment_index]
              return (
                <div key={i} style={{
                  border: '1px solid var(--line-1)', borderRadius: 12, padding: '14px 16px',
                  background: 'var(--bg-1)', display: 'grid',
                  gridTemplateColumns: 'auto 1fr auto', gap: 14, alignItems: 'flex-start',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <button onClick={() => move(i, i - 1)} disabled={i === 0} className="canon-btn ghost" style={{ fontSize: 11, padding: '2px 6px' }}>↑</button>
                    <button onClick={() => move(i, i + 1)} disabled={i === beats.length - 1} className="canon-btn ghost" style={{ fontSize: 11, padding: '2px 6px' }}>↓</button>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)', letterSpacing: 1.2,
                      }}>BEAT {i + 1}</span>
                      <select
                        value={b.kind}
                        onChange={e => setBeatField(i, { kind: e.target.value })}
                        style={{
                          fontFamily: 'var(--font-mono)', fontSize: 11, padding: '2px 6px',
                          background: 'var(--bg-2)', color: 'var(--fg-2)',
                          border: '1px solid var(--line-2)', borderRadius: 4,
                        }}
                      >
                        {BEAT_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
                      </select>
                      <input
                        type="text"
                        value={b.title}
                        onChange={e => setBeatField(i, { title: e.target.value })}
                        style={{
                          flex: 1, fontSize: 15, padding: '4px 6px', background: 'transparent',
                          border: 'none', borderBottom: '1px solid var(--line-2)', color: 'var(--fg)',
                        }}
                      />
                    </div>
                    <textarea
                      value={b.one_line}
                      onChange={e => setBeatField(i, { one_line: e.target.value })}
                      rows={2}
                      style={{
                        width: '100%', marginTop: 8, fontSize: 12.5, lineHeight: 1.4,
                        padding: '6px 8px', background: 'var(--bg-2)', color: 'var(--fg-2)',
                        border: '1px solid var(--line-2)', borderRadius: 6, resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                      placeholder="One-line directive (what this beat does)"
                    />
                    {m && (
                      <div style={{ marginTop: 10, fontSize: 12, color: 'var(--fg-3)' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1 }}>
                          ANCHOR · {m.recorded_at ?? '?'} · {m.kind ?? 'observation'}
                        </span>
                        <div style={{
                          fontStyle: 'italic', marginTop: 4, color: 'var(--fg-2)',
                          maxHeight: 60, overflow: 'hidden',
                        }}>
                          “{m.verbatim_preview || m.topic}”
                        </div>
                        <select
                          value={b.moment_index}
                          onChange={e => setBeatField(i, { moment_index: parseInt(e.target.value, 10) })}
                          style={{
                            marginTop: 6, fontSize: 11, padding: '2px 6px', background: 'var(--bg-2)',
                            color: 'var(--fg-2)', border: '1px solid var(--line-2)', borderRadius: 4,
                          }}
                        >
                          {moments.map(mm => (
                            <option key={mm.index} value={mm.index}>
                              {`#${mm.index} · ${mm.topic.slice(0, 60)}`}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => drop(i)}
                    className="canon-btn ghost"
                    style={{ fontSize: 11, color: 'var(--t-terra)' }}
                  >Drop</button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Shell>
  )
}
