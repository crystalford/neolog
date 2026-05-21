'use client'

/**
 * Production detail (singular /production/[id]) — the draft view.
 *
 * Distinct from /productions/[id] which serves Pack Rats-style
 * project containers from the `projects` table. This route serves
 * actual production artifacts from the `productions` table — the
 * output of the production engine.
 *
 * Sections:
 *   1. Crumbs (Timeline / Productions / draft name)
 *   2. Hero — production-type pill + state pill + topic h1 + actions
 *   3. Two-column body — script editor (left) + source rail (right)
 *   4. Provenance + footer
 *
 * Editor is a plain textarea for v1. Operator edits → PATCH saves
 * (debounced). State actions: Mark ready / Mark produced / Publish.
 */

export const runtime = 'edge'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import { truncate, formatFullDate } from '@/components/threadkit'

interface Production {
  id: string
  production_type: string
  source_kind: string
  source_id: string
  state: string
  state_changed_at: string
  script_text: string | null
  script_version: number
  visibility: string
  published_to: string | null
  produced_at: string | null
  created_at: string
  updated_at: string
  prompt_version: string | null
  output_r2_key: string | null
  output_metadata: string | null
  output_url: string | null
}
interface Beat {
  id: string
  beat_index: number
  beat_text: string
  cue: string | null
  audio_r2_key: string | null
  audio_url: string | null
  take_number: number
  recorded_at: string | null
  visual_treatment: string | null
}

interface ThreadSource {
  id: string; topic: string; take: string | null; abstracted_topic: string | null
  strength: number | null; transcript_span_start: number | null; transcript_span_end: number | null
  vlog_id: string; vlog_filename: string | null
}
interface ClusterSource {
  id: string; topic: string; abstracted_topic: string | null
  take: string | null; ripeness_score: number; state: string
  threads: { id: string; topic: string; take: string | null; strength: number | null }[]
}
type Source = ThreadSource | ClusterSource | null

const TYPE_LABELS: Record<string, string> = {
  x_post: 'X post',
  x_thread: 'X thread',
  micro_essay: 'Micro-essay',
  article: 'Article',
  clip: 'Clip',
  video_essay: 'Video essay',
  creative_work: 'Creative work',
}

export default function ProductionDraftPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [data, setData] = useState<{ production: Production; source: Source; beats?: Beat[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [script, setScript] = useState('')
  const [savedScript, setSavedScript] = useState('')
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = () => {
    fetch(`/api/v2/productions/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => {
        setData(d)
        setScript(d.production.script_text ?? '')
        setSavedScript(d.production.script_text ?? '')
      })
      .catch(e => setError(String(e?.message || e)))
  }
  useEffect(load, [params.id])

  // Debounced auto-save (1.5s after last keystroke).
  useEffect(() => {
    if (!data) return
    if (script === savedScript) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingState('idle')
    saveTimer.current = setTimeout(async () => {
      setSavingState('saving')
      try {
        const r = await fetch(`/api/v2/productions/${params.id}`, {
          method: 'PATCH', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ script_text: script }),
        })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        setSavedScript(script)
        setSavingState('saved')
        setTimeout(() => setSavingState(curr => curr === 'saved' ? 'idle' : curr), 1800)
      } catch {
        setSavingState('failed')
      }
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [script, savedScript, data, params.id])

  const setState = async (newState: string) => {
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: newState }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: any) {
      alert(`State change failed: ${e?.message || e}`)
    }
  }

  const togglePublish = async () => {
    if (!data) return
    const next = data.production.visibility === 'public' ? 'private' : 'public'
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visibility: next }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      load()
    } catch (e: any) {
      alert(`Publish toggle failed: ${e?.message || e}`)
    }
  }

  const deleteProd = async () => {
    if (!confirm('Delete this production? Soft-delete — can be restored later if needed.')) return
    try {
      const r = await fetch(`/api/v2/productions/${params.id}`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      router.push('/productions')
    } catch (e: any) {
      alert(`Delete failed: ${e?.message || e}`)
    }
  }

  if (error) return (
    <Shell>
      <Crumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, 'Error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!data) return (
    <Shell>
      <Crumbs trail={[{ label: 'Timeline', href: '/' }, { label: 'Productions', href: '/productions' }, '…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  const { production: p, source } = data
  const typeLabel = TYPE_LABELS[p.production_type] || p.production_type
  const topicName =
    p.source_kind === 'thread'
      ? ((source as ThreadSource | null)?.abstracted_topic ?? (source as ThreadSource | null)?.topic ?? 'Production')
      : ((source as ClusterSource | null)?.abstracted_topic ?? (source as ClusterSource | null)?.topic ?? 'Production')
  const color = topicColor(topicName)
  const isPublic = p.visibility === 'public'

  return (
    <Shell>
      <div style={{ ['--topic' as any]: color } as React.CSSProperties}>
        <Crumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Productions', href: '/productions' },
            { label: truncate(`${typeLabel} · ${topicName}`, 60) },
          ]}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <span className="topic-pill" style={{
                '--topic': color, '--topic-soft': `color-mix(in srgb, ${color} 12%, transparent)`,
              } as any}>
                <span className="type">{typeLabel}</span>
                <span className="sep">·</span>
                {p.source_kind === 'thread' ? 'from thread' : 'from cluster'}
              </span>
              <StatePill state={p.state}/>
              {isPublic && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '4px 11px',
                  background: 'var(--sig-soft)',
                  border: '1px solid color-mix(in srgb, var(--sig) 35%, transparent)',
                  borderRadius: 100,
                  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
                  textTransform: 'uppercase', fontWeight: 500, color: 'var(--sig)',
                }}>Public</span>
              )}
            </div>
            <h1 style={{ fontSize: 56, letterSpacing: '-1.8px' }}>{topicName}</h1>
            <div className="meta-strip">
              <span>Created <strong>{formatFullDate(p.created_at)}</strong></span>
              <span>Updated <strong>{formatFullDate(p.updated_at)}</strong></span>
              <span>v<strong>{p.script_version}</strong></span>
              {p.prompt_version && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.prompt_version}</span>}
            </div>
          </div>
          <div className="actions">
            {p.state === 'materializing' && (
              <button className="action primary" onClick={() => setState('script_ready')}>
                Mark ready
              </button>
            )}
            {p.state === 'script_ready' && (
              <button className="action primary" onClick={() => setState('produced')}>
                Mark produced
              </button>
            )}
            {p.state === 'produced' && (
              <button className="action primary" onClick={togglePublish}>
                {isPublic ? 'Unpublish' : 'Publish'}
              </button>
            )}
            {p.state === 'published' && (
              <a className="action primary" href={`/p/${p.id}`} target="_blank" rel="noreferrer">
                View public
              </a>
            )}
            <button className="action" onClick={togglePublish}>
              {isPublic ? 'Set private' : 'Set public'}
            </button>
            <button className="action" onClick={deleteProd} style={{ color: 'var(--t-terra)' }}>
              Delete
            </button>
          </div>
        </section>

        {/* Body grid */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">

            {/* CLIP — render the actual video segment, no editor */}
            {p.production_type === 'clip' && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>The clip</h2>
                  <div className="meta">
                    {(() => {
                      try { const m = JSON.parse(p.output_metadata || '{}'); return `${m.duration_sec ? m.duration_sec.toFixed(1) + 's' : ''}${m.start_sec != null ? ` · from ${Math.floor(m.start_sec/60)}:${String(Math.floor(m.start_sec%60)).padStart(2,'0')} in vlog` : ''}` }
                      catch { return '' }
                    })()}
                  </div>
                </div>
                {p.output_url ? (
                  <video
                    src={p.output_url}
                    controls
                    style={{
                      width: '100%', maxHeight: 540,
                      background: '#000',
                      border: `1px solid var(--line-1)`,
                      borderLeft: `2px solid ${color}`,
                      borderRadius: '0 12px 12px 0',
                      display: 'block',
                    }}
                  />
                ) : (
                  <div className="canon-empty-hint">
                    Clip video isn't available — R2 fetch may have failed. Try regenerating.
                  </div>
                )}
              </section>
            )}

            {/* VIDEO ESSAY — beats list with per-beat record affordance */}
            {p.production_type === 'video_essay' && (
              <>
                <section className="canon-section">
                  <div className="canon-section-head">
                    <h2>Beats <span className="meta">· {data.beats?.length ?? 0}</span></h2>
                    <div className="meta">{data.beats?.filter(b => b.audio_r2_key).length ?? 0} recorded · {Math.max(0, (data.beats?.length ?? 0) - (data.beats?.filter(b => b.audio_r2_key).length ?? 0))} pending</div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(data.beats ?? []).map(b => (
                      <BeatCard key={b.id} beat={b} color={color} productionId={p.id} onUpdated={load}/>
                    ))}
                    {(!data.beats || data.beats.length === 0) && (
                      <div className="canon-empty-hint">
                        The script didn't parse into beats — open the full script below to read it as-is.
                      </div>
                    )}
                  </div>
                </section>
                <section className="canon-section">
                  <div className="canon-section-head">
                    <h2>Full script</h2>
                    <div className="meta">{script.split(/\s+/).filter(Boolean).length} words · spoken time ≈ {Math.round(script.split(/\s+/).filter(Boolean).length / 160)} min</div>
                  </div>
                  <textarea
                    value={script}
                    onChange={e => setScript(e.target.value)}
                    spellCheck
                    style={{
                      width: '100%', minHeight: 320,
                      padding: '20px 22px',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--line-1)',
                      borderLeft: `2px solid ${color}`,
                      borderRadius: '0 12px 12px 0',
                      fontFamily: 'var(--font-body)',
                      fontSize: 16, lineHeight: 1.7,
                      color: 'var(--fg)', resize: 'vertical', outline: 'none',
                    }}
                  />
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)', marginTop: 6 }}>
                    <SaveStatus state={savingState}/> · v{p.script_version}
                  </div>
                </section>
              </>
            )}

            {/* TEXT — default editor for x_post / x_thread / micro_essay / article */}
            {p.production_type !== 'clip' && p.production_type !== 'video_essay' && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Draft</h2>
                  <div className="meta">
                    <SaveStatus state={savingState}/>
                    · v{p.script_version} · {script.split(/\s+/).filter(Boolean).length} words
                  </div>
                </div>
                <textarea
                  value={script}
                  onChange={e => setScript(e.target.value)}
                  spellCheck
                  style={{
                    width: '100%', minHeight: 420,
                    padding: '20px 22px',
                    background: 'var(--bg-1)',
                    border: '1px solid var(--line-1)',
                    borderLeft: `2px solid ${color}`,
                  borderRadius: '0 12px 12px 0',
                  fontFamily: p.production_type === 'article' || p.production_type === 'micro_essay'
                    ? 'var(--font-body)'
                    : 'var(--font-body)',
                  fontSize: p.production_type === 'article' ? 17 : 15.5,
                  lineHeight: 1.7,
                  color: 'var(--fg)',
                  resize: 'vertical',
                  outline: 'none',
                }}
              />
            </section>
            )}

            <section className="canon-section">
              <div className="canon-section-head">
                <h2>Notes</h2>
                <div className="meta">iteration log — coming soon</div>
              </div>
              <div className="canon-empty-hint">
                Iteration history and operator notes on the draft will live here. For now, edits auto-save as v++ on the draft itself.
              </div>
            </section>
          </div>

          {/* Source rail */}
          <aside className="canon-detail-rail">
            <div className="rail-card">
              <div className="rc-head">
                <h3>Source · {p.source_kind}</h3>
              </div>
              {p.source_kind === 'thread' && source && (
                <ThreadSourceCard source={source as ThreadSource} color={color}/>
              )}
              {p.source_kind === 'cluster' && source && (
                <ClusterSourceCard source={source as ClusterSource} color={color}/>
              )}
              {!source && (
                <div className="canon-empty-hint" style={{ padding: 14, fontSize: 12 }}>
                  Source couldn't be loaded (deleted? renamed?).
                </div>
              )}
            </div>

            <EngineCard production={p} onRegenerated={load}/>
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid" style={{ marginTop: 32 }}>
          <ProvCell label="Type" value={typeLabel}/>
          <ProvCell label="State" value={p.state.replace(/_/g, ' ')}/>
          <ProvCell label="Version" value={`v${p.script_version}`}/>
          <ProvCell label="Visibility" value={p.visibility}/>
          <ProvCell label="Created" value={formatFullDate(p.created_at)}/>
          <ProvCell label="Updated" value={formatFullDate(p.updated_at)}/>
          <ProvCell label="Produced" value={p.produced_at ? formatFullDate(p.produced_at) : '—'}/>
          <ProvCell label="Production id" value={truncate(p.id, 22)} mono/>
        </section>

        <footer className="canon-detail-footer">
          <span>neolog · production {truncate(p.id, 22)}</span>
          <span/>
        </footer>
      </div>
    </Shell>
  )
}

// ─── Subcomponents ──────────────────────────────────────────────────────

type CrumbItem = { label: string; href?: string } | string
function Crumbs({ trail }: { trail: CrumbItem[] }) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? <Link href={item.href}>{item.label}</Link> : <span className={isLast ? 'here' : ''}>{item.label}</span>}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
    </div>
  )
}

function StatePill({ state }: { state: string }) {
  const meta: Record<string, { color: string; label: string }> = {
    materializing: { color: 'var(--t-ochre)', label: 'Drafting' },
    script_ready:  { color: 'var(--sig)',     label: 'Script ready' },
    recording:     { color: 'var(--t-violet)',label: 'Recording' },
    producing:     { color: 'var(--t-violet)',label: 'Producing' },
    produced:      { color: 'var(--t-sage)',  label: 'Produced' },
    published:     { color: 'var(--sig)',     label: 'Published' },
    archived:      { color: 'var(--fg-3)',    label: 'Archived' },
  }
  const m = meta[state] || { color: 'var(--fg-3)', label: state }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 11px',
      background: `color-mix(in srgb, ${m.color} 10%, var(--bg-2))`,
      border: `1px solid color-mix(in srgb, ${m.color} 35%, var(--line-1))`,
      borderRadius: 100,
      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
      textTransform: 'uppercase', fontWeight: 500, color: m.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, boxShadow: `0 0 6px ${m.color}` }}/>
      {m.label}
    </span>
  )
}

function SaveStatus({ state }: { state: 'idle' | 'saving' | 'saved' | 'failed' }) {
  if (state === 'saving') return <span style={{ color: 'var(--t-ochre)' }}>saving…</span>
  if (state === 'saved')  return <span style={{ color: 'var(--t-sage)' }}>saved</span>
  if (state === 'failed') return <span style={{ color: 'var(--t-terra)' }}>save failed</span>
  return <span style={{ color: 'var(--fg-4)' }}>idle</span>
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function ThreadSourceCard({ source, color }: { source: ThreadSource; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href={`/thread/${source.id}`} className="canon-sibling" style={{ '--c': color } as any}>
        <span className="dot"/>
        <span className="name">{truncate(source.take || source.topic, 80)}</span>
        <span className="strength">
          {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (source.strength ?? 0) ? 'on' : ''}`}/>)}
        </span>
      </Link>
      {source.vlog_filename && (
        <Link href={`/vlog/${source.vlog_id}`} style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)',
          letterSpacing: 0.4, textDecoration: 'none',
        }}>
          ↗ from vlog · {truncate(source.vlog_filename, 32)}
        </Link>
      )}
    </div>
  )
}

function ClusterSourceCard({ source, color }: { source: ClusterSource; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Link href={`/studio/${source.id}`} className="canon-sibling" style={{ '--c': color } as any}>
        <span className="dot"/>
        <span className="name">{truncate(source.abstracted_topic ?? source.topic, 60)}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--sig)',
          flexShrink: 0,
        }}>{Math.round(source.ripeness_score)} ripe</span>
      </Link>
      {source.threads.length > 0 && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)',
          letterSpacing: 0.4, paddingTop: 8, borderTop: '1px solid var(--line)',
        }}>
          {source.threads.length} threads in cluster
        </div>
      )}
    </div>
  )
}

/**
 * BeatCard — one beat of a video_essay script. Shows the beat text +
 * a record control. When the operator clicks Record, asks for mic
 * permission via getUserMedia, records via MediaRecorder, then PUTs
 * the resulting blob to /api/v2/productions/[id]/beats/[beatId]/audio.
 *
 * Replays the existing take if one exists. Retake replaces it; the
 * server bumps take_number each time so we keep history.
 */
function BeatCard({ beat, color, productionId, onUpdated }: {
  beat: Beat
  color: string
  productionId: string
  onUpdated: () => void
}) {
  const [recording, setRecording] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [localBlob, setLocalBlob] = useState<Blob | null>(null)
  const [localUrl, setLocalUrl] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const wordCount = beat.beat_text.split(/\s+/).filter(Boolean).length
  const estSec = Math.round(wordCount / 2.67)  // ~160 wpm spoken

  const start = async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
        setLocalBlob(blob)
        if (localUrl) URL.revokeObjectURL(localUrl)
        setLocalUrl(URL.createObjectURL(blob))
        if (timerRef.current) clearInterval(timerRef.current)
        streamRef.current?.getTracks().forEach(t => t.stop())
      }
      rec.start()
      setRecording(true)
      setElapsedMs(0)
      const startedAt = Date.now()
      timerRef.current = setInterval(() => setElapsedMs(Date.now() - startedAt), 100)
    } catch (e: any) {
      setError(`Mic access: ${e?.message || e}`)
    }
  }

  const stop = () => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  const save = async () => {
    if (!localBlob) return
    setUploading(true); setError(null)
    try {
      const r = await fetch(`/api/v2/productions/${productionId}/beats/${beat.id}/audio`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': localBlob.type || 'audio/webm' },
        body: localBlob,
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setLocalBlob(null)
      if (localUrl) URL.revokeObjectURL(localUrl)
      setLocalUrl(null)
      onUpdated()
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 200))
    } finally {
      setUploading(false)
    }
  }

  const discardLocal = () => {
    setLocalBlob(null)
    if (localUrl) URL.revokeObjectURL(localUrl)
    setLocalUrl(null)
  }

  const clearRemote = async () => {
    if (!confirm('Clear the saved recording for this beat?')) return
    try {
      const r = await fetch(`/api/v2/productions/${productionId}/beats/${beat.id}/audio`, {
        method: 'DELETE', credentials: 'include',
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      onUpdated()
    } catch (e: any) {
      alert(`Clear failed: ${e?.message || e}`)
    }
  }

  const seconds = (elapsedMs / 1000).toFixed(1)
  const hasRemote = !!beat.audio_r2_key
  const hasLocal = !!localBlob

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--line-1)',
      borderLeft: `2px solid ${hasRemote ? 'var(--sig)' : color}`,
      borderRadius: '0 12px 12px 0',
      padding: '16px 20px',
      display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
          textTransform: 'uppercase', color: hasRemote ? 'var(--sig)' : color,
          fontWeight: 600, flexShrink: 0,
        }}>{String(beat.beat_index + 1).padStart(2, '0')}{beat.cue ? ` · ${beat.cue}` : ''}</span>
        <span style={{
          marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--fg-3)', letterSpacing: 0.4,
        }}>
          {wordCount} words · ≈ {estSec}s spoken
          {beat.take_number > 1 && <> · take {beat.take_number}</>}
        </span>
      </div>
      <div style={{
        fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.6,
        color: 'var(--fg-1)', letterSpacing: '-0.15px',
        whiteSpace: 'pre-wrap',
      }}>
        {beat.beat_text}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        paddingTop: 10, borderTop: '1px solid var(--line)',
      }}>
        {/* Existing saved recording */}
        {hasRemote && beat.audio_url && !hasLocal && (
          <audio src={beat.audio_url} controls style={{ height: 32, flex: 1, minWidth: 200 }}/>
        )}
        {hasRemote && !hasLocal && (
          <>
            <button onClick={start} className="canon-btn ghost" style={{ fontSize: 11 }}>
              Retake
            </button>
            <button onClick={clearRemote} className="canon-btn ghost" style={{ fontSize: 11, color: 'var(--t-terra)' }}>
              Clear
            </button>
          </>
        )}

        {/* Local recording in progress */}
        {recording && (
          <>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--t-terra)', fontWeight: 500,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', background: 'var(--t-terra)',
                boxShadow: '0 0 6px var(--t-terra)',
                animation: 'canon-pulse 1.1s ease-in-out infinite',
              }}/>
              REC · {seconds}s
            </span>
            <button onClick={stop} className="canon-btn primary" style={{ fontSize: 11 }}>
              Stop
            </button>
          </>
        )}

        {/* Just recorded — preview before save */}
        {hasLocal && !recording && (
          <>
            <audio src={localUrl!} controls style={{ height: 32, flex: 1, minWidth: 200 }}/>
            <button onClick={save} disabled={uploading} className="canon-btn primary" style={{ fontSize: 11 }}>
              {uploading ? 'Saving…' : 'Save take'}
            </button>
            <button onClick={discardLocal} className="canon-btn ghost" style={{ fontSize: 11 }}>
              Discard
            </button>
          </>
        )}

        {/* No recording at all */}
        {!hasRemote && !hasLocal && !recording && (
          <button onClick={start} className="canon-btn primary" style={{ fontSize: 12 }}>
            <span className="ico">
              <svg viewBox="0 0 14 14"><rect x="5" y="2" width="4" height="7" rx="2"/><path d="M3 7 Q3 11 7 11 Q11 11 11 7 M7 11 L7 13"/></svg>
            </span>
            Record beat
          </button>
        )}

        {error && (
          <span style={{ fontSize: 11.5, color: 'var(--t-terra)', marginLeft: 'auto' }}>{error}</span>
        )}
      </div>
    </div>
  )
}

/**
 * EngineCard — model picker + Re-generate button on the production
 * rail. Re-generate POSTs to /api/v2/productions/[id]/regenerate
 * with the selected model. For video_essay, warns that existing beat
 * recordings will be lost since beats get re-indexed.
 */
function EngineCard({ production, onRegenerated }: { production: Production; onRegenerated: () => void }) {
  const [model, setModel] = useState<'llama70b' | 'kimi' | 'claude'>('llama70b')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isClip = production.production_type === 'clip'
  const isVideoEssay = production.production_type === 'video_essay'

  const regenerate = async () => {
    if (isVideoEssay) {
      if (!confirm('Re-generating a video essay wipes all beat recordings (new beats won\'t match old indices). Continue?')) return
    }
    setGenerating(true); setError(null)
    try {
      const r = await fetch(`/api/v2/productions/${production.id}/regenerate`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      onRegenerated()
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 200))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="rail-card">
      <div className="rc-head"><h3>Engine</h3></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, color: 'var(--fg-2)' }}>
        <div><span style={{ color: 'var(--fg-3)' }}>Model:</span> <strong style={{ color: 'var(--fg-1)' }}>{production.prompt_version?.split('·')[1]?.trim() || 'unknown'}</strong></div>
        <div><span style={{ color: 'var(--fg-3)' }}>Prompt:</span> <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{production.prompt_version?.split('·')[0]?.trim() || '—'}</span></div>

        {isClip ? (
          <div style={{
            fontSize: 11.5, color: 'var(--fg-3)', lineHeight: 1.5, marginTop: 4,
            padding: '8px 10px', background: 'var(--bg-2)', borderRadius: 6,
          }}>
            Clips are FFmpeg slices — to re-generate, delete and Produce a fresh clip from the thread.
          </div>
        ) : (
          <>
            <div style={{
              display: 'flex', gap: 4, flexWrap: 'wrap',
              paddingTop: 8, borderTop: '1px solid var(--line)', marginTop: 4,
            }}>
              {(['llama70b', 'kimi', 'claude'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setModel(m)}
                  disabled={generating}
                  className={`canon-filter-chip ${model === m ? 'active' : ''}`}
                  style={{ fontSize: 10, padding: '3px 8px' }}
                >
                  {m === 'llama70b' ? 'Llama 70B' : m === 'kimi' ? 'Kimi' : 'Sonnet'}
                </button>
              ))}
            </div>
            <button
              onClick={regenerate}
              disabled={generating}
              className="canon-btn ghost"
              style={{ fontSize: 12 }}
            >
              {generating ? 'Re-generating…' : 'Re-generate draft'}
            </button>
            {error && (
              <div style={{ fontSize: 11.5, color: 'var(--t-terra)' }}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
