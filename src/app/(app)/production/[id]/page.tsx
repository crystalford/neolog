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
  broll_image_r2_key: string | null
  broll_image_url: string | null
  broll_video_r2_key: string | null
  broll_video_url: string | null
  broll_prompt: string | null
  broll_status: string | null
  synth_audio_r2_key: string | null
  synth_audio_url: string | null
  synth_voice_id: string | null
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
  short: 'Short (30–60s)',
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
            {(p.state === 'produced' || p.state === 'script_ready' || p.state === 'materializing') && (
              <button
                className="action primary"
                onClick={() => setState('published')}
                title="Mark this as shipped — it'll appear on the Published page."
              >
                Mark published
              </button>
            )}
            {p.state === 'published' && (
              <>
                <a className="action primary" href={`/p/${p.id}`} target="_blank" rel="noreferrer">
                  View public
                </a>
                <button
                  className="action"
                  onClick={() => setState('produced')}
                  title="Move back to produced state."
                >
                  Un-publish
                </button>
              </>
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
                <VoiceoverPanel production={p} beats={data.beats ?? []} onStitched={load}/>
                <AiBrollPanel production={p} beats={data.beats ?? []} onChanged={load}/>
                <BrollRenderPanel production={p} onRendered={load}/>
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
  const [synthesizing, setSynthesizing] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<BlobPart[]>([])

  const synthesize = async () => {
    setSynthesizing(true)
    setError(null)
    try {
      const r = await fetch(`/api/v2/productions/${productionId}/voiceover/synthesize`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beat_indexes: [beat.beat_index] }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      const result = d.results?.[0]
      if (result?.status === 'failed') throw new Error(result.error || 'synth failed')
      onUpdated()
    } catch (e: any) {
      setError(e?.message || String(e))
    } finally {
      setSynthesizing(false)
    }
  }
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

        {/* Synthesized take exists but no operator recording */}
        {!hasRemote && !hasLocal && !recording && beat.synth_audio_url && (
          <audio src={beat.synth_audio_url} controls
            style={{ height: 32, flex: 1, minWidth: 200 }}/>
        )}
        {!hasRemote && !hasLocal && !recording && beat.synth_audio_url && (
          <span style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1,
            color: 'var(--sig)', border: '1px solid var(--sig)', borderRadius: 4, padding: '2px 6px',
          }}>SYNTH</span>
        )}

        {/* No audio at all — offer both paths */}
        {!hasRemote && !hasLocal && !recording && !beat.synth_audio_url && (
          <>
            <button onClick={start} className="canon-btn primary" style={{ fontSize: 12 }}>
              <span className="ico">
                <svg viewBox="0 0 14 14"><rect x="5" y="2" width="4" height="7" rx="2"/><path d="M3 7 Q3 11 7 11 Q11 11 11 7 M7 11 L7 13"/></svg>
              </span>
              Record beat
            </button>
            <button onClick={synthesize} className="canon-btn ghost"
              disabled={synthesizing}
              title="Generate this beat with Cloudflare TTS (MiniMax 2.8 if your voice profile is set, Aura-2 preset otherwise)."
              style={{ fontSize: 12, color: 'var(--sig)' }}>
              {synthesizing ? 'Synthesizing…' : 'Synthesize'}
            </button>
          </>
        )}

        {/* Synthesized exists — show Re-synth + Record-instead */}
        {!hasRemote && !hasLocal && !recording && beat.synth_audio_url && (
          <>
            <button onClick={synthesize} className="canon-btn ghost"
              disabled={synthesizing}
              style={{ fontSize: 11, color: 'var(--sig)' }}>
              {synthesizing ? '…' : 'Re-synthesize'}
            </button>
            <button onClick={start} className="canon-btn ghost" style={{ fontSize: 11 }}>
              Record instead
            </button>
          </>
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

/**
 * VoiceoverPanel — for video_essay productions. Shows current
 * voiceover state (none / stitched), Stitch button when all beats are
 * recorded, audio player when stitched. The stitched MP3 lives at
 * productions.output_r2_key (with output_metadata.kind='voiceover').
 */
function VoiceoverPanel({ production, beats, onStitched }: {
  production: Production
  beats: Beat[]
  onStitched: () => void
}) {
  const [stitching, setStitching] = useState(false)
  const [synthAllProgress, setSynthAllProgress] = useState<{ done: number; total: number; current?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const recordedCount = beats.filter(b => b.audio_r2_key).length
  const synthCount = beats.filter(b => !b.audio_r2_key && b.synth_audio_r2_key).length
  const totalCount = beats.length
  const audibleCount = recordedCount + synthCount
  const allAudible = totalCount > 0 && audibleCount === totalCount
  const allRecorded = totalCount > 0 && recordedCount === totalCount

  // Sequential per-beat synthesis so the progress UI reflects real per-tile
  // state. Total wall-clock matches a batch POST; granularity is the win.
  const synthesizeAll = async () => {
    const pending = beats.filter(b => !b.audio_r2_key && !b.synth_audio_r2_key)
    if (pending.length === 0) return
    setSynthAllProgress({ done: 0, total: pending.length })
    setError(null)
    let failures = 0
    for (let i = 0; i < pending.length; i++) {
      const beat = pending[i]
      setSynthAllProgress({ done: i, total: pending.length, current: beat.beat_index })
      try {
        const r = await fetch(`/api/v2/productions/${production.id}/voiceover/synthesize`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ beat_indexes: [beat.beat_index] }),
        })
        const d: any = await r.json()
        const result = d?.results?.[0]
        if (!r.ok || result?.status === 'failed') {
          failures++
          if (failures === 1) setError(`beat ${beat.beat_index}: ${result?.error || d?.error || 'failed'}`)
        }
      } catch (e: any) {
        failures++
        if (failures === 1) setError(`beat ${beat.beat_index}: ${e?.message || String(e)}`)
      }
      onStitched() // refresh production state for each tile
    }
    setSynthAllProgress(null)
  }

  // Determine if the existing output is a stitched voiceover (vs a
  // future final-render artifact).
  let isVoiceover = false
  try {
    const meta = JSON.parse(production.output_metadata || '{}')
    isVoiceover = meta?.kind === 'voiceover'
  } catch {}
  const hasVoiceover = isVoiceover && !!production.output_url

  const stitch = async () => {
    setStitching(true); setError(null)
    try {
      const r = await fetch(`/api/v2/productions/${production.id}/voiceover`, {
        method: 'POST', credentials: 'include',
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      onStitched()
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 220))
    } finally {
      setStitching(false)
    }
  }

  return (
    <section className="canon-section">
      <div className="canon-section-head">
        <h2>Voiceover {hasVoiceover && <span className="meta">· stitched from {(() => { try { return JSON.parse(production.output_metadata || '{}').beat_count } catch { return recordedCount } })()} beats</span>}</h2>
        <div className="meta">
          {recordedCount} recorded{synthCount > 0 ? `, ${synthCount} synth` : ''} / {totalCount} beats
          {synthAllProgress && (
            <span style={{ marginLeft: 8, color: 'var(--sig)' }}>
              · synthesizing {synthAllProgress.done + 1}/{synthAllProgress.total}{synthAllProgress.current != null ? ` (beat ${synthAllProgress.current + 1})` : ''}
            </span>
          )}
        </div>
      </div>

      {hasVoiceover && production.output_url && (
        <div style={{
          padding: '16px 20px',
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderLeft: '2px solid var(--sig)',
          borderRadius: '0 12px 12px 0',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
            textTransform: 'uppercase', color: 'var(--sig)', fontWeight: 600,
          }}>Voiceover ready</div>
          <audio src={production.output_url} controls style={{ width: '100%' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={stitch}
              disabled={stitching || !allRecorded}
              className="canon-btn ghost"
              style={{ fontSize: 11 }}
            >
              {stitching ? 'Re-stitching…' : 'Re-stitch'}
            </button>
            <a
              href={production.output_url}
              download={`voiceover-${production.id}.mp3`}
              className="canon-btn ghost"
              style={{ fontSize: 11 }}
            >
              Download
            </a>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-3)' }}>
              MP3 · 160k · stitched from all beats in order
            </span>
          </div>
        </div>
      )}

      {!hasVoiceover && (
        <div style={{
          padding: '18px 22px',
          background: 'var(--bg-1)',
          border: '1px dashed var(--line-2)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}>
          <div style={{ fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.5 }}>
            {allAudible
              ? `All beats have audio (${recordedCount} recorded${synthCount > 0 ? `, ${synthCount} synthesized` : ''}). Stitch into the final voiceover.`
              : `${totalCount - audibleCount} beat${totalCount - audibleCount === 1 ? '' : 's'} need${totalCount - audibleCount === 1 ? 's' : ''} audio. Record below, or synthesize all remaining at once.`}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!allAudible && (
              <button
                onClick={synthesizeAll}
                disabled={!!synthAllProgress || stitching}
                className="canon-btn ghost"
                style={{ fontSize: 12, color: 'var(--sig)' }}
                title="Synthesize every un-audio beat with Cloudflare TTS (MiniMax 2.8 if your voice profile is set, Aura-2 preset otherwise)."
              >
                {synthAllProgress
                  ? `Synthesizing ${synthAllProgress.done + 1}/${synthAllProgress.total}…`
                  : `Synthesize ${totalCount - audibleCount} remaining`}
              </button>
            )}
            <button
              onClick={stitch}
              disabled={stitching || !allAudible || !!synthAllProgress}
              className="canon-btn primary"
              style={{ fontSize: 12, opacity: !allAudible ? 0.5 : 1 }}
            >
              {stitching ? 'Stitching…' : 'Stitch voiceover'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: 8, padding: '8px 12px',
          background: 'rgba(230,99,74,0.06)', border: '1px solid var(--t-terra)',
          borderRadius: 6, fontSize: 12, color: 'var(--fg-1)',
        }}>{error}</div>
      )}
    </section>
  )
}

/**
 * BrollRenderPanel — pick b-roll clips + render the final MP4.
 *
 * Fetches /api/v2/broll for available b-roll vlogs (vlogs the
 * operator marked as silent via Mark broll). Operator picks any
 * number in order via clickable thumbnails. Render button calls
 * /api/v2/productions/[id]/render and replaces the production's
 * output with the final MP4 (state → produced).
 *
 * If output_metadata.kind === 'final_render', shows the rendered
 * <video> + Re-render button. If voiceover not stitched yet, shows
 * a hint pointing back to VoiceoverPanel.
 */
function BrollRenderPanel({ production, onRendered }: {
  production: Production
  onRendered: () => void
}) {
  const [broll, setBroll] = useState<{
    id: string; filename: string | null; duration_sec: number | null
    thumbnail_url: string | null; playback_url: string | null
    recorded_at: string | null
  }[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [loadingBroll, setLoadingBroll] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)
  const [renderElapsed, setRenderElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  // Check if a voiceover exists (must come before render).
  let isVoiceover = false
  let isFinalRender = false
  try {
    const meta = JSON.parse(production.output_metadata || '{}')
    isVoiceover = meta?.kind === 'voiceover'
    isFinalRender = meta?.kind === 'final_render'
  } catch {}

  useEffect(() => {
    fetch('/api/v2/broll', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { broll: [] })
      .then((d: any) => { setBroll(d.broll ?? []); setLoadingBroll(false) })
      .catch(() => setLoadingBroll(false))
  }, [])

  // Render heartbeat — while a render is in flight, poll the production
  // every 3 seconds and surface render_status (the server updates this
  // between substeps: presigning → ffmpeg → uploading → done). Also tick
  // an elapsed-seconds counter for the ETA line.
  useEffect(() => {
    if (!rendering) { setRenderStatus(null); setRenderElapsed(0); return }
    const started = Date.now()
    const tick = setInterval(() => setRenderElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/v2/productions/${production.id}`, { credentials: 'include' })
        if (!r.ok) return
        const d: any = await r.json()
        const status = d?.production?.render_status
        if (typeof status === 'string') setRenderStatus(status)
      } catch {}
    }, 3000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [rendering, production.id])

  const toggle = (id: string) => {
    setPicked(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const render = async () => {
    if (picked.length === 0) return
    setRendering(true); setError(null)
    try {
      const r = await fetch(`/api/v2/productions/${production.id}/render`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ broll_vlog_ids: picked }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      onRendered()
    } catch (e: any) {
      setError(String(e?.message || e).slice(0, 240))
    } finally {
      setRendering(false)
    }
  }

  return (
    <section className="canon-section">
      <div className="canon-section-head">
        <h2>Render <span className="meta">{isFinalRender ? '· final MP4 ready' : ''}</span></h2>
        <div className="meta">b-roll + voiceover → final MP4</div>
      </div>

      {/* Existing final render — show the video */}
      {isFinalRender && production.output_url && (
        <div style={{
          padding: '16px 20px', marginBottom: 14,
          background: 'var(--bg-1)',
          border: '1px solid var(--line-1)',
          borderLeft: '2px solid var(--sig)',
          borderRadius: '0 12px 12px 0',
        }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.6,
            textTransform: 'uppercase', color: 'var(--sig)', fontWeight: 600, marginBottom: 10,
          }}>Final render</div>
          <video src={production.output_url} controls style={{
            width: '100%', maxHeight: 480, background: '#000', borderRadius: 8, display: 'block',
          }}/>
          <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href={production.output_url} download={`render-${production.id}.mp4`} className="canon-btn ghost" style={{ fontSize: 11 }}>
              Download MP4
            </a>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
              Pick new b-roll below to re-render
            </span>
          </div>
        </div>
      )}

      {/* No voiceover yet */}
      {!isVoiceover && !isFinalRender && (
        <div className="canon-empty-hint">
          Stitch the voiceover above first. Once the voiceover MP3 exists, pick b-roll here and render the final video.
        </div>
      )}

      {/* Voiceover exists — show b-roll picker */}
      {(isVoiceover || isFinalRender) && (
        <>
          {loadingBroll && <div style={{ color: 'var(--fg-3)', padding: 16 }}>Loading b-roll…</div>}
          {!loadingBroll && broll.length === 0 && (
            <div className="canon-empty-hint">
              No b-roll vlogs yet. Mark some vlogs as B-roll from their detail page (System actions →
              Mark as B-roll). Those become available here.
            </div>
          )}
          {!loadingBroll && broll.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                Pick b-roll clips in the order they should appear in the final video. They'll be
                concatenated and trimmed to match the voiceover length.
              </div>
              <div style={{
                display: 'grid', gap: 10,
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              }}>
                {broll.map(b => {
                  const idx = picked.indexOf(b.id)
                  const isPicked = idx >= 0
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggle(b.id)}
                      disabled={rendering}
                      style={{
                        position: 'relative',
                        padding: 0, border: 'none', background: 'transparent', cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        aspectRatio: '16 / 9',
                        background: b.thumbnail_url ? `url(${b.thumbnail_url}) center / cover` : 'linear-gradient(135deg, #1a1a1a, #050505)',
                        borderRadius: 8,
                        border: `2px solid ${isPicked ? 'var(--sig)' : 'var(--line-1)'}`,
                        boxShadow: isPicked ? '0 0 0 2px var(--sig-soft)' : 'none',
                        overflow: 'hidden',
                        position: 'relative',
                        transition: 'all .15s',
                      }}>
                        {isPicked && (
                          <span style={{
                            position: 'absolute', top: 8, left: 8,
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'var(--sig)', color: '#061735',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                          }}>{idx + 1}</span>
                        )}
                        {b.duration_sec != null && (
                          <span style={{
                            position: 'absolute', bottom: 6, right: 6,
                            fontFamily: 'var(--font-mono)', fontSize: 10,
                            color: 'var(--fg)',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '2px 6px', borderRadius: 4,
                          }}>
                            {Math.floor(b.duration_sec / 60)}:{String(Math.floor(b.duration_sec % 60)).padStart(2, '0')}
                          </span>
                        )}
                      </div>
                      <div style={{
                        marginTop: 6, fontSize: 11.5, color: 'var(--fg-2)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {b.filename || 'Untitled'}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                paddingTop: 14, borderTop: '1px solid var(--line)',
              }}>
                <span style={{ fontSize: 13, color: 'var(--fg-2)' }}>
                  <strong style={{ color: 'var(--fg)' }}>{picked.length}</strong> clip{picked.length === 1 ? '' : 's'} picked
                  {picked.length > 0 && (() => {
                    const total = picked.reduce((s, id) => {
                      const b = broll.find(x => x.id === id)
                      return s + (b?.duration_sec ?? 0)
                    }, 0)
                    return total > 0 ? ` · ~${Math.round(total)}s of footage` : ''
                  })()}
                </span>
                {picked.length > 0 && (
                  <button onClick={() => setPicked([])} disabled={rendering} className="canon-btn ghost" style={{ fontSize: 11 }}>
                    Clear
                  </button>
                )}
                <button
                  onClick={render}
                  disabled={rendering || picked.length === 0}
                  className="canon-btn primary"
                  style={{ marginLeft: 'auto', fontSize: 12, opacity: picked.length === 0 ? 0.5 : 1 }}
                >
                  {rendering
                    ? renderStatus
                      ? `${renderStatus} · ${renderElapsed}s`
                      : `Rendering… ${renderElapsed}s`
                    : isFinalRender ? 'Re-render' : 'Render final MP4'}
                </button>
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px',
                  background: 'rgba(230,99,74,0.06)', border: '1px solid var(--t-terra)',
                  borderRadius: 8, fontSize: 12.5, color: 'var(--fg-1)',
                }}>{error}</div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  )
}

/**
 * AiBrollPanel — Cloudflare-native AI b-roll for video essays.
 *
 * For each beat: gpt-oss writes a cinematic image prompt → Flux 1 Schnell
 * generates a 1024×1024 still → Wan 2.7 animates it into a 5-10s clip
 * (FFmpeg Ken Burns fallback if Wan errors). All Workers AI + R2, no third
 * party. Then "Render with AI b-roll" calls /render with use_ai_broll=true.
 *
 * The operator can regenerate per-beat (single image or single clip)
 * without re-running the whole production.
 */
function AiBrollPanel({ production, beats, onChanged }: {
  production: Production
  beats: Beat[]
  onChanged: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; current: number; stage: string } | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderStatus, setRenderStatus] = useState<string | null>(null)
  const [renderElapsed, setRenderElapsed] = useState(0)

  useEffect(() => {
    if (!rendering) { setRenderStatus(null); setRenderElapsed(0); return }
    const started = Date.now()
    const tick = setInterval(() => setRenderElapsed(Math.floor((Date.now() - started) / 1000)), 1000)
    const poll = setInterval(async () => {
      try {
        const r = await fetch(`/api/v2/productions/${production.id}`, { credentials: 'include' })
        if (!r.ok) return
        const d: any = await r.json()
        const status = d?.production?.render_status
        if (typeof status === 'string') setRenderStatus(status)
      } catch {}
    }, 3000)
    return () => { clearInterval(tick); clearInterval(poll) }
  }, [rendering, production.id])

  const haveAnyImages = beats.some(b => !!b.broll_image_r2_key)
  const haveAllImages = beats.length > 0 && beats.every(b => !!b.broll_image_r2_key)
  const haveAllVideos = beats.length > 0 && beats.every(b => !!b.broll_video_r2_key)

  // Sequential per-beat generation: one POST per beat so each tile reflects
  // its real state (prompting/Flux/Wan/Grok/done/failed) instead of a single
  // "..." across the whole panel. Same total wall-clock; better feedback.
  const generate = async (stage: 'image' | 'video' | 'both' | 'direct_video', beatIndexes?: number[]) => {
    const targets = beatIndexes && beatIndexes.length > 0
      ? beatIndexes
      : beats.map(b => b.beat_index)
    const isBulk = !beatIndexes || beatIndexes.length > 1
    if (isBulk) setBulkProgress({ done: 0, total: targets.length, current: targets[0], stage })
    setErr(null)
    let failures = 0
    for (let i = 0; i < targets.length; i++) {
      const idx = targets[i]
      setBusy(`beat ${idx}:${stage}`)
      if (isBulk) setBulkProgress({ done: i, total: targets.length, current: idx, stage })
      try {
        const r = await fetch(`/api/v2/productions/${production.id}/broll`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage, beat_indexes: [idx] }),
        })
        const d: any = await r.json()
        if (!r.ok) {
          failures++
          if (failures === 1) setErr(d?.error || `HTTP ${r.status}`)
        } else if (d.failures > 0) {
          failures++
          const detail = d.results?.find((x: any) => x.status === 'failed')?.error
          if (failures === 1) setErr(`beat ${idx}: ${detail || 'failed'}`)
        }
        onChanged()
      } catch (e: any) {
        failures++
        if (failures === 1) setErr(`beat ${idx}: ${e?.message || String(e)}`)
      }
    }
    setBusy(null)
    if (isBulk) setBulkProgress(null)
  }

  const render = async () => {
    setRendering(true)
    setErr(null)
    try {
      const r = await fetch(`/api/v2/productions/${production.id}/render`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_ai_broll: true }),
      })
      const d: any = await r.json()
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      onChanged()
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setRendering(false)
    }
  }

  if (beats.length === 0) return null

  return (
    <section className="rail-card" style={{ marginTop: 16 }}>
      <div className="rc-head">
        <h3>AI b-roll <span className="meta">· Cloudflare Workers AI</span></h3>
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.5, marginTop: 4 }}>
        Each beat gets a Kubrick-tier prompt (cinematographer + production-designer + set-builder, never literal), then Flux generates a still and Wan&nbsp;2.7 animates it. Per beat, you can override to <strong>Grok Imagine Video</strong> for direct text-to-video <em>with synchronized native audio</em>. All Cloudflare, no third party.
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button
          className="canon-btn primary"
          onClick={() => generate(haveAllImages ? 'video' : 'both')}
          disabled={!!busy || rendering}
          style={{ fontSize: 12 }}
        >
          {busy === 'both:all' ? 'Generating…'
            : busy === 'video:all' ? 'Animating…'
            : !haveAnyImages ? 'Generate b-roll for all beats'
            : !haveAllImages ? 'Finish generating (mixed state)'
            : !haveAllVideos ? 'Animate all stills'
            : 'Regenerate all'}
        </button>
        <button
          className="canon-btn ghost"
          onClick={() => generate('direct_video')}
          disabled={!!busy || rendering}
          style={{ fontSize: 12, color: 'var(--sig)' }}
          title="Skip stills entirely. Grok Imagine generates each beat's clip with synchronized ambient audio. Costlier and slower than the default; use it for richer beats."
        >
          {busy === 'direct_video:all' ? 'Generating (Grok)…' : 'All beats → Grok (with audio)'}
        </button>
        {haveAllVideos && (
          <button
            className="canon-btn primary"
            onClick={render}
            disabled={!!busy || rendering}
            style={{ fontSize: 12 }}
          >
            {rendering
              ? renderStatus
                ? `${renderStatus} · ${renderElapsed}s`
                : `Rendering… ${renderElapsed}s`
              : 'Render with AI b-roll'}
          </button>
        )}
      </div>
      {bulkProgress && (
        <div style={{ marginTop: 12 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 10.5, letterSpacing: 1,
            color: 'var(--fg-3)', marginBottom: 4, display: 'flex', justifyContent: 'space-between',
          }}>
            <span>
              {bulkProgress.stage.toUpperCase()} · BEAT {bulkProgress.done + 1}/{bulkProgress.total}{bulkProgress.current != null ? ` (#${bulkProgress.current + 1})` : ''}
            </span>
            <span>
              ~{estimateBrollRemaining(bulkProgress)}s remaining
            </span>
          </div>
          <div style={{
            height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden',
          }}>
            <div style={{
              height: '100%', width: `${(bulkProgress.done / bulkProgress.total) * 100}%`,
              background: 'var(--sig)', transition: 'width 0.3s',
            }}/>
          </div>
        </div>
      )}
      {err && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'var(--t-terra)', wordBreak: 'break-word' }}>
          {err}
        </div>
      )}
      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
        {beats.map(b => (
          <BrollBeatTile
            key={b.id}
            beat={b}
            busy={busy}
            onGenerate={() => generate('both', [b.beat_index])}
            onAnimate={() => generate('video', [b.beat_index])}
            onDirectVideo={() => generate('direct_video', [b.beat_index])}
          />
        ))}
      </div>
    </section>
  )
}

function BrollBeatTile({ beat, busy, onGenerate, onAnimate, onDirectVideo }: {
  beat: Beat
  busy: string | null
  onGenerate: () => void
  onAnimate: () => void
  onDirectVideo: () => void
}) {
  const thisBusyImg = busy === `beat ${beat.beat_index}:both` || busy === `beat ${beat.beat_index}:image`
  const thisBusyVid = busy === `beat ${beat.beat_index}:video`
  const thisBusyDirect = busy === `beat ${beat.beat_index}:direct_video`
  const isGrok = beat.broll_status === 'video_grok'
  return (
    <div style={{
      border: '1px solid var(--line-1)', borderRadius: 8, padding: 8,
      background: 'var(--bg-2)', display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div style={{
        aspectRatio: '16 / 9', background: '#000', borderRadius: 4, overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, color: 'var(--fg-4)', position: 'relative',
      }}>
        {beat.broll_video_url ? (
          <video src={beat.broll_video_url} muted playsInline preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onMouseEnter={e => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}) }}
            onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
          />
        ) : beat.broll_image_url ? (
          <img src={beat.broll_image_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <span>{beat.broll_status === 'generating' ? 'Generating…' : beat.broll_status === 'failed' ? 'Failed' : 'No b-roll yet'}</span>
        )}
      </div>
      <div style={{
        fontFamily: 'JetBrains Mono, monospace', fontSize: 9.5, color: 'var(--fg-3)',
        letterSpacing: 0.5, textTransform: 'uppercase', display: 'flex', gap: 6, alignItems: 'center',
      }}>
        <span>Beat {beat.beat_index + 1}{beat.broll_video_r2_key ? ' · clip' : beat.broll_image_r2_key ? ' · still' : ''}</span>
        {isGrok && (
          <span style={{ color: 'var(--sig)', border: '1px solid var(--sig)', borderRadius: 4, padding: '1px 5px', letterSpacing: 0.5 }}>
            Grok · audio
          </span>
        )}
      </div>
      {beat.broll_prompt && (
        <div style={{ fontSize: 10.5, color: 'var(--fg-3)', lineHeight: 1.35, maxHeight: 56, overflow: 'hidden' }}>
          {beat.broll_prompt}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={onGenerate} disabled={!!busy}
          className="canon-btn ghost" style={{ fontSize: 10, flex: 1, minWidth: 0 }}
          title="Generate still (Flux) and animate it (Wan 2.7, Ken-Burns fallback).">
          {thisBusyImg ? '…' : beat.broll_image_r2_key ? 'Re-image' : 'Image'}
        </button>
        {beat.broll_image_r2_key && !isGrok && (
          <button onClick={onAnimate} disabled={!!busy}
            className="canon-btn ghost" style={{ fontSize: 10, flex: 1, minWidth: 0 }}
            title="Animate the current still (Wan 2.7, Ken-Burns fallback). Silent.">
            {thisBusyVid ? '…' : beat.broll_video_r2_key ? 'Re-animate' : 'Animate'}
          </button>
        )}
        <button onClick={onDirectVideo} disabled={!!busy}
          className="canon-btn ghost"
          style={{ fontSize: 10, flex: 1, minWidth: 0, color: 'var(--sig)' }}
          title="Skip the still — Grok Imagine Video generates motion + synchronized ambient audio in one shot. Costlier, slower, richer.">
          {thisBusyDirect ? '…' : isGrok ? 'Re-Grok' : 'Direct (Grok+audio)'}
        </button>
      </div>
    </div>
  )
}

// Rough seconds-per-beat for each broll stage. Used purely for the user-
// facing ETA on the progress bar — never for billing or scheduling.
function estimateBrollRemaining(p: { done: number; total: number; stage: string }): number {
  const perBeat = p.stage === 'direct_video' ? 60
    : p.stage === 'video' ? 25
    : p.stage === 'image' ? 10
    : 35 // 'both' = image + video
  const remaining = p.total - p.done
  return Math.max(0, remaining * perBeat)
}
