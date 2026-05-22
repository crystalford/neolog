'use client'

/**
 * Vlog detail — canon rebuild per
 * /tmp/neolognextlevel/design-reference/04-Vlog.html
 *
 * Was /timeline/[id]; moved to /vlog/[id] in Phase 5 to match canon
 * naming. Old path redirects here.
 *
 * Sections (top to bottom):
 *   1. Crumbs              — Timeline / Vlogs / filename
 *   2. Hero                — status pill + filename h1 + meta strip
 *                            (recorded date / duration / size / words)
 *                            + actions column (Re-extract / Mark broll /
 *                            Delete / Open original)
 *   3. Anchor take         — pull-quote with the strongest thread (if any)
 *   4. Session digest      — 4-cell strip (threads / clips / entities / clusters)
 *   5. Player + timeline   — 16:9 video + MultiTrackTimeline (audio /
 *                            threads / clips / entities)
 *   6. Body grid           — main: Threads / Clips / Creative / Entities /
 *                            Transcript / System actions disclosure
 *                            rail: re-extract panel, diagnosis if pipeline
 *                            failure, raw extraction_outcomes
 *   7. Provenance grid     — 8 cells
 *   8. Footer              — colophon + j/k hints
 *
 * Data: /api/v2/vlogs/[id]. Same payload as before; reused as-is.
 * Reuses: MultiTrackTimeline, LivePipeline (pipeline status realtime).
 */

export const runtime = 'edge'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Shell from '@/components/Shell'
import { topicColor } from '@/lib/topic-color'
import {
  MultiTrackTimeline, truncate, formatMmSs, formatDate, formatFullDate,
  type MultiTrackBand, type MultiTrackMark,
} from '@/components/threadkit'
import LivePipeline from '../../timeline/[id]/live-pipeline'

interface VlogDetail {
  id: string
  title: string | null
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  recorded_at: string | null
  recorded_at_source: string | null
  thumbnail_url: string | null
  transcript_text: string | null
  summary: string | null
  pipeline_status: string
  pipeline_error: string | null
  playback_url: string | null
  has_transcoded?: boolean
  extraction_outcomes: string | null
  updated_at: string | null
  visibility?: string
  created_at?: string
}
interface ThreadRow {
  id: string
  topic: string
  take: string | null
  key_quotes: string | null
  strength: number | null
  abstracted_topic: string | null
  register?: string | null
  transcript_span_start?: number | null
  transcript_span_end?: number | null
}
interface ClipRow {
  id: string
  start_time: number | null
  end_time: number | null
  headline: string
  quote: string | null
  why_clippable: string | null
  status: string | null
  validated: number | null
}
interface CreativeRow { id: string; element_type: string; content: string; register: string | null; validated: number | null }
interface EntityRow { id: string; name: string; entity_type: string; aliases: string | null; mention_count: number | null; vlog_quotes?: string[] }
interface EntityMention { entity_id: string; mention_time: number | null; entity_name: string; entity_type: string }

export default function VlogDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [vlog, setVlog] = useState<VlogDetail | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [clips, setClips] = useState<ClipRow[]>([])
  const [creative, setCreative] = useState<CreativeRow[]>([])
  const [entities, setEntities] = useState<EntityRow[]>([])
  const [mentions, setMentions] = useState<EntityMention[]>([])
  const [anchorThread, setAnchorThread] = useState<{ id: string; topic: string; take: string | null; strength: number | null } | null>(null)
  const [navigation, setNavigation] = useState<{ prev_vlog_id: string | null; next_vlog_id: string | null }>({ prev_vlog_id: null, next_vlog_id: null })
  const [error, setError] = useState<string | null>(null)
  const [currentT, setCurrentT] = useState(0)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [systemOpen, setSystemOpen] = useState(false)
  const [actionNote, setActionNote] = useState<string | null>(null)

  const load = () => {
    fetch(`/api/v2/vlogs/${params.id}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((d: any) => {
        setVlog(d.vlog)
        setThreads(d.threads ?? [])
        setClips(d.clips ?? [])
        setCreative(d.creative_elements ?? [])
        setEntities(d.entities ?? [])
        setMentions(d.entity_mention_times ?? [])
        setAnchorThread(d.anchor_thread ?? null)
        setNavigation(d.navigation ?? { prev_vlog_id: null, next_vlog_id: null })
      })
      .catch(e => setError(String(e?.message || e)))
  }
  useEffect(() => { load() }, [params.id])

  useEffect(() => {
    if (!navigation) return
    const h = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'j' && navigation.next_vlog_id) router.push(`/vlog/${navigation.next_vlog_id}`)
      else if (e.key === 'k' && navigation.prev_vlog_id) router.push(`/vlog/${navigation.prev_vlog_id}`)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [navigation, router])

  const seek = (t: number) => {
    setCurrentT(t)
    if (videoRef.current) videoRef.current.currentTime = t
  }

  const reExtract = async (passes?: string[]) => {
    setActionNote('Starting re-extraction…')
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}/process`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // Always pass mode so the API doesn't short-circuit with
        // { already_complete: true } when pipeline_status='complete'.
        // Without this, "Re-extract" silently no-ops for any vlog that
        // already finished once — and we never re-run transcode even
        // when transcoded_r2_key is null.
        body: JSON.stringify(passes ? { passes, mode: 'cheap' } : { mode: 'cheap' }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
      setActionNote(`Re-extraction queued. Pipeline running.`)
      setTimeout(load, 2000)
    } catch (e: any) {
      setActionNote(`Failed: ${e?.message || String(e)}`)
    }
  }

  const markBroll = async () => {
    if (!confirm('Mark as B-roll? Silent footage, no extraction.')) return
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}/mark-broll`, { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      setActionNote('Marked as B-roll.')
      load()
    } catch (e: any) {
      setActionNote(`Failed: ${e?.message || String(e)}`)
    }
  }

  const deleteVlog = async () => {
    if (!confirm('Delete this vlog? This removes the R2 bytes too. Cannot be undone.')) return
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}`, { method: 'DELETE', credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      router.push('/')
    } catch (e: any) {
      setActionNote(`Delete failed: ${e?.message || String(e)}`)
    }
  }

  // Multi-track timeline bands/marks
  const threadBands: MultiTrackBand[] = useMemo(() => threads
    .filter(t => t.transcript_span_start != null && t.transcript_span_end != null)
    .map(t => ({
      start: t.transcript_span_start!,
      end: t.transcript_span_end!,
      color: topicColor(t.abstracted_topic ?? t.topic),
      label: truncate(t.topic, 40),
    })), [threads])
  const clipBands: MultiTrackBand[] = useMemo(() => clips
    .filter(c => c.start_time != null && c.end_time != null)
    .map(c => ({
      start: c.start_time!,
      end: c.end_time!,
      color: 'var(--sig)',
      label: c.headline,
    })), [clips])
  const entityMarks: MultiTrackMark[] = useMemo(() => mentions
    .filter(m => m.mention_time != null)
    .map(m => ({ time: m.mention_time!, color: 'var(--fg-3)', label: m.entity_name })), [mentions])

  if (error) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, 'Vlog · error']}/>
      <div style={{ padding: 40, color: 'var(--t-terra)' }}>Error: {error}</div>
    </Shell>
  )
  if (!vlog) return (
    <Shell>
      <CanonCrumbs trail={[{ label: 'Timeline', href: '/' }, 'Vlog · loading…']}/>
      <div style={{ padding: 40, color: 'var(--fg-3)' }}>Loading…</div>
    </Shell>
  )

  // Prefer the AI-derived title from extraction. Falls back to the
  // de-uglified DJI filename only when extraction hasn't run yet.
  const title = (vlog.title && vlog.title.trim()) || deriveVlogTitle(vlog.original_filename)
  const status = vlog.pipeline_status
  const isBroll = status === 'archived'
  const isProcessing = ['uploaded', 'transcoding', 'thumbnail_pending', 'transcribing', 'extracting'].includes(status)
  const isFailed = status === 'failed'
  const isComplete = status === 'complete'
  const wordCount = vlog.transcript_text ? vlog.transcript_text.trim().split(/\s+/).filter(Boolean).length : 0

  return (
    <Shell>
      <div>
        <CanonCrumbs
          trail={[
            { label: 'Timeline', href: '/' },
            { label: 'Vlogs', href: '/?filter=vlog' },
            { label: truncate(title, 50) },
          ]}
          prev={navigation.prev_vlog_id ? `/vlog/${navigation.prev_vlog_id}` : null}
          next={navigation.next_vlog_id ? `/vlog/${navigation.next_vlog_id}` : null}
          vlogId={vlog.id}
        />

        {/* Hero */}
        <section className="canon-detail-hero canon-reveal d2">
          <div>
            <div className="pills-row">
              <StatusPill status={status}/>
              {vlog.recorded_at_source && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9.5, letterSpacing: 1.4,
                  textTransform: 'uppercase', color: 'var(--fg-4)',
                }}>
                  date · {vlog.recorded_at_source}
                </span>
              )}
            </div>
            <h1>{title}</h1>
            <div className="meta-strip">
              {vlog.recorded_at && <span>Recorded <strong>{formatFullDate(vlog.recorded_at)}</strong></span>}
              {vlog.duration_seconds != null && <span><strong>{formatMmSs(vlog.duration_seconds)}</strong> duration</span>}
              {vlog.file_size_bytes != null && <span><strong>{fmtSize(vlog.file_size_bytes)}</strong></span>}
              {vlog.mime_type && <span>{vlog.mime_type.replace('video/', '').toUpperCase()}</span>}
              {wordCount > 0 && <span><strong>{wordCount.toLocaleString()}</strong> words</span>}
            </div>
          </div>
          <div className="actions">
            {isComplete && (
              <button className="action primary" onClick={() => reExtract()}>
                Re-extract
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'rgba(6,23,53,0.5)' }}>R</span>
              </button>
            )}
            {isBroll && (
              <button className="action primary" onClick={() => reExtract()}>
                Process
              </button>
            )}
            {!isBroll && (
              <button className="action" onClick={markBroll}>
                Mark as B-roll
              </button>
            )}
            {vlog.playback_url && (
              <a className="action" href={vlog.playback_url} target="_blank" rel="noreferrer">
                Open original
              </a>
            )}
            <button className="action" onClick={deleteVlog} style={{ color: 'var(--t-terra)' }}>
              Delete
            </button>
          </div>
        </section>

        {actionNote && (
          <div style={{
            margin: '0 0 24px', padding: '12px 16px',
            background: 'var(--bg-2)', border: '1px solid var(--line-1)',
            borderRadius: 8, fontSize: 13, color: 'var(--fg-2)',
          }}>{actionNote}</div>
        )}

        {/* Anchor take pull-quote */}
        {anchorThread && (anchorThread.take || anchorThread.topic) && (
          <Link href={`/thread/${anchorThread.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>
            <section className="canon-pull canon-reveal d3" style={{ ['--topic' as any]: topicColor(anchorThread.topic) } as React.CSSProperties}>
              <div className="label">Anchor take · strongest thread</div>
              <div className="quote">{anchorThread.take || anchorThread.topic}</div>
            </section>
          </Link>
        )}

        {/* Session digest */}
        <section className="canon-digest canon-reveal d3" style={{ marginBottom: 32 }}>
          <div className="canon-digest-cell">
            <span className="n">{threads.length}</span>
            <span className="l">Threads</span>
          </div>
          <div className="canon-digest-cell">
            <span className="n">{clips.length}</span>
            <span className="l">Clip candidates</span>
          </div>
          <div className="canon-digest-cell">
            <span className="n">{entities.length}</span>
            <span className="l">Entities</span>
          </div>
          <div className="canon-digest-cell">
            <span className="n">{creative.length}</span>
            <span className="l">Creative</span>
          </div>
        </section>

        {/* Player + multi-track timeline */}
        {vlog.playback_url && (
          <section className="canon-reveal d4" style={{ marginBottom: 32 }}>
            {vlog.has_transcoded === false && (
              <div style={{
                maxWidth: 720, margin: '0 auto 12px',
                padding: '12px 14px',
                background: 'rgba(230, 99, 74, 0.08)',
                border: '1px solid var(--t-terra)',
                borderRadius: 8,
                display: 'flex', gap: 12, alignItems: 'center',
                fontSize: 13, color: 'var(--fg-1)',
              }}>
                <div style={{ flex: 1, lineHeight: 1.4 }}>
                  <div style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.8,
                    textTransform: 'uppercase', color: 'var(--t-terra)', marginBottom: 2,
                  }}>
                    Transcode missing
                  </div>
                  H.264 version was never produced — Chrome can't decode the original HEVC video,
                  so playback may be audio-only. Re-extract to rerun the transcode step.
                </div>
                <button onClick={() => reExtract()} className="action primary" style={{ fontSize: 12 }}>
                  Re-transcode
                </button>
              </div>
            )}
            <div style={{
              width: '100%',
              maxWidth: 720,
              aspectRatio: '16 / 9',
              maxHeight: '55vh',
              margin: '0 auto 14px',
              background: '#050505',
              border: '1px solid var(--line-1)',
              borderRadius: 12,
              overflow: 'hidden',
            }}>
              <video
                ref={videoRef}
                src={vlog.playback_url}
                controls
                preload="metadata"
                poster={vlog.thumbnail_url ?? undefined}
                onTimeUpdate={(e) => setCurrentT((e.target as HTMLVideoElement).currentTime)}
                style={{ width: '100%', height: '100%', display: 'block', background: 'black', objectFit: 'contain' }}
              />
            </div>
            <MultiTrackTimeline
              durationSec={vlog.duration_seconds ?? 0}
              threadBands={threadBands}
              clipBands={clipBands}
              entityMarks={entityMarks}
              currentT={currentT}
              onSeek={seek}
              accentColor="var(--sig)"
            />
          </section>
        )}

        {/* Body grid: main + rail */}
        <div className="canon-detail-body">
          <div className="canon-detail-main">

            {threads.length > 0 && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Extracted threads <span className="meta">· {threads.length}</span></h2>
                  <div className="meta">extracted</div>
                </div>
                <div className="canon-siblings">
                  {threads.map(t => {
                    const c = topicColor(t.abstracted_topic ?? t.topic)
                    return (
                      <Link key={t.id} href={`/thread/${t.id}`} className="canon-sibling" style={{ '--c': c } as any}>
                        <span className="dot"/>
                        {t.transcript_span_start != null && (
                          <button onClick={(e) => { e.preventDefault(); seek(t.transcript_span_start!) }} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
                            padding: 0, flexShrink: 0,
                          }} title="Jump to timecode">
                            ▶ {formatMmSs(t.transcript_span_start)}
                          </button>
                        )}
                        <span className="name">{truncate(t.take || t.topic, 90)}</span>
                        <span style={{ fontSize: 10, color: 'var(--fg-4)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                          {t.abstracted_topic && truncate(t.abstracted_topic, 18)}
                        </span>
                        <span className="strength">
                          {[1,2,3,4,5].map(i => <span key={i} className={`pip ${i <= (t.strength ?? 0) ? 'on' : ''}`}/>)}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </section>
            )}

            {clips.length > 0 && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Clip candidates <span className="meta">· {clips.length}</span></h2>
                  <div className="meta">delivery moments</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {clips.map(c => {
                    // Span is missing when extraction didn't compute
                    // start/end (older runs) or when start===end===0.
                    const hasSpan = c.start_time != null && c.end_time != null
                      && (c.end_time - c.start_time) >= 1
                    // why_clippable sometimes lands as JSON-stringified
                    // {"reason":"…"} instead of plain text. Parse
                    // defensively so the operator doesn't see raw JSON.
                    const reason = extractReason(c.why_clippable)
                    return (
                      <div key={c.id} style={{
                        padding: '14px 18px',
                        background: 'var(--bg-1)',
                        border: '1px solid var(--line-1)',
                        borderLeft: '2px solid var(--sig)',
                        borderRadius: '0 10px 10px 0',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                          {hasSpan ? (
                            <button onClick={() => seek(c.start_time!)} style={{
                              background: 'var(--sig-soft)',
                              border: '1px solid color-mix(in srgb, var(--sig) 40%, transparent)',
                              color: 'var(--sig)',
                              padding: '3px 9px', borderRadius: 100,
                              fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
                              cursor: 'pointer',
                            }}>
                              ▶ {formatMmSs(c.start_time!)} → {formatMmSs(c.end_time!)}
                            </button>
                          ) : (
                            <span style={{
                              padding: '3px 9px', borderRadius: 100,
                              border: '1px dashed var(--line-2)',
                              color: 'var(--fg-4)',
                              fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: 0.5,
                            }}>no timecode · re-extract</span>
                          )}
                          <span style={{ fontSize: 14, color: 'var(--fg-1)', fontWeight: 500 }}>{c.headline}</span>
                        </div>
                        {c.quote && (
                          <div style={{ fontSize: 13.5, color: 'var(--fg-2)', lineHeight: 1.5, fontStyle: 'italic' }}>
                            “{c.quote}”
                          </div>
                        )}
                        {reason && (
                          <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 8, lineHeight: 1.5 }}>
                            {reason}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {creative.length > 0 && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Creative elements <span className="meta">· {creative.length}</span></h2>
                  <div className="meta">scene fragments + dialogue captures</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {creative.map(ce => (
                    <div key={ce.id} style={{
                      padding: '14px 18px',
                      background: 'var(--bg-1)',
                      border: '1px solid var(--line-1)',
                      borderLeft: '2px solid var(--t-plum)',
                      borderRadius: '0 10px 10px 0',
                    }}>
                      <div style={{
                        fontSize: 9.5, color: 'var(--t-plum)', letterSpacing: 1.5,
                        textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                        fontWeight: 500, marginBottom: 8,
                      }}>{ce.element_type.replace(/_/g, ' ')}</div>
                      <div style={{ fontSize: 14, color: 'var(--fg-1)', lineHeight: 1.55 }}>{ce.content}</div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Transcript */}
            {vlog.transcript_text && (
              <section className="canon-section">
                <div className="canon-section-head">
                  <h2>Transcript <span className="meta">· {wordCount.toLocaleString()} words</span></h2>
                  <div className="meta">{vlog.transcript_text && 'word-timestamped · whisper v3'}</div>
                </div>
                <div className="canon-transcript-flow" style={{ ['--topic' as any]: 'var(--fg-3)' } as React.CSSProperties}>
                  {vlog.transcript_text}
                </div>
              </section>
            )}

            {/* System actions disclosure */}
            <section className="canon-section">
              <button
                onClick={() => setSystemOpen(o => !o)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 16px',
                  background: 'var(--bg-1)',
                  border: '1px solid var(--line-1)',
                  borderRadius: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  letterSpacing: 1.6, textTransform: 'uppercase',
                  color: 'var(--fg-2)', cursor: 'pointer',
                  width: '100%', textAlign: 'left',
                }}
              >
                <span>{systemOpen ? '▾' : '▸'}</span>
                System actions · pipeline status · per-pass re-extract
              </button>
              {systemOpen && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <LivePipeline vlogId={vlog.id}/>
                  <div style={{
                    padding: 16, background: 'var(--bg-1)',
                    border: '1px solid var(--line-1)', borderRadius: 8,
                  }}>
                    <div style={{
                      fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
                      textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10,
                    }}>Per-pass re-extract</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {(['threads', 'clip_candidates', 'creative_elements', 'entities'] as const).map(p => (
                        <button key={p} onClick={() => reExtract([p])} className="canon-btn ghost" style={{ fontSize: 11 }}>
                          {p.replace('_', ' ')}
                        </button>
                      ))}
                      <button onClick={() => reExtract()} className="canon-btn primary" style={{ fontSize: 11 }}>
                        All passes
                      </button>
                    </div>
                  </div>
                  {vlog.extraction_outcomes && (
                    <div style={{
                      padding: 16, background: 'var(--bg-1)',
                      border: '1px solid var(--line-1)', borderRadius: 8,
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
                        textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 10,
                      }}>Extraction outcomes</div>
                      <pre style={{
                        fontSize: 11, color: 'var(--fg-2)', overflow: 'auto',
                        fontFamily: 'var(--font-mono)', margin: 0,
                      }}>{tryPrettyJson(vlog.extraction_outcomes)}</pre>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>

          {/* Rail */}
          <aside className="canon-detail-rail">
            {entities.length > 0 && (
              <div className="rail-card">
                <div className="rc-head">
                  <h3>Entities · in this vlog</h3>
                  <Link href="/graph" className="more">graph →</Link>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {entities.slice(0, 12).map(e => (
                    <div key={e.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <Link href={`/entity/${e.id}`} className="canon-entity-chip" style={{ alignSelf: 'flex-start' }}>
                        <span className="glyph">{e.name.slice(0, 2).toUpperCase()}</span>
                        {truncate(e.name, 22)}
                        {e.mention_count != null && <span className="n">·{e.mention_count}</span>}
                      </Link>
                      {(e.vlog_quotes ?? []).slice(0, 3).map((q, i) => (
                        <blockquote key={i} style={{
                          margin: 0, padding: '4px 0 4px 10px',
                          borderLeft: '2px solid var(--line-2)',
                          fontSize: 12, lineHeight: 1.45,
                          color: 'var(--fg-2)', fontStyle: 'italic',
                        }}>"{q}"</blockquote>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isProcessing && (
              <div className="rail-card" style={{ borderLeft: '2px solid var(--sig)' }}>
                <div className="rc-head">
                  <h3>Pipeline running</h3>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--sig)' }}>{status}</strong> — open System actions below to watch progress live.
                </div>
              </div>
            )}

            {isFailed && vlog.pipeline_error && (
              <div className="rail-card" style={{ borderLeft: '2px solid var(--t-terra)' }}>
                <div className="rc-head">
                  <h3>Pipeline failed</h3>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--fg-2)', lineHeight: 1.55, fontFamily: 'var(--font-mono)' }}>
                  {vlog.pipeline_error}
                </div>
                <button onClick={() => reExtract()} className="canon-btn primary" style={{ marginTop: 12, width: '100%', fontSize: 12 }}>
                  Retry
                </button>
              </div>
            )}
          </aside>
        </div>

        {/* Provenance */}
        <section className="canon-prov-grid" style={{ marginTop: 32 }}>
          <ProvCell label="Recorded" value={vlog.recorded_at ? formatFullDate(vlog.recorded_at) : '—'}/>
          <ProvCell label="Date source" value={vlog.recorded_at_source ?? '—'} mono/>
          <ProvCell label="Status" value={status}/>
          <ProvCell label="Visibility" value={vlog.visibility ?? 'private'}/>
          <ProvCell label="Duration" value={vlog.duration_seconds != null ? formatMmSs(vlog.duration_seconds) : '—'} mono/>
          <ProvCell label="Size" value={vlog.file_size_bytes != null ? fmtSize(vlog.file_size_bytes) : '—'}/>
          <ProvCell label="Vlog id" value={truncate(vlog.id, 22)} mono/>
          <ProvCell label="Updated" value={vlog.updated_at ? formatFullDate(vlog.updated_at) : '—'}/>
        </section>

        {/* Footer */}
        <footer className="canon-detail-footer">
          <span>neolog · vlog {truncate(vlog.id, 22)}</span>
          <span className="kbd-row">
            <span className="kbd">J</span> next
            <span className="kbd">K</span> prev
            <span className="kbd">R</span> re-extract
          </span>
        </footer>
      </div>
    </Shell>
  )
}

// ─── Subcomponents ───────────────────────────────────────────────────────

type CrumbItem = { label: string; href?: string } | string

function CanonCrumbs({ trail, prev, next, vlogId }: {
  trail: CrumbItem[]
  prev?: string | null
  next?: string | null
  vlogId?: string
}) {
  return (
    <div className="canon-crumbs">
      {trail.map((c, i) => {
        const isLast = i === trail.length - 1
        const item = typeof c === 'string' ? { label: c } : c
        return (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 14 }}>
            {item.href && !isLast ? (
              <Link href={item.href}>{item.label}</Link>
            ) : (
              <span className={isLast ? 'here' : ''}>{item.label}</span>
            )}
            {!isLast && <span className="sep">/</span>}
          </span>
        )
      })}
      <div className="spacer"/>
      {(prev || next || vlogId) && (
        <div className="navbtns">
          <Link href={prev ?? '#'} className="navbtn" aria-disabled={!prev}>
            ◂ Prev <span className="kbd">K</span>
          </Link>
          <Link href={next ?? '#'} className="navbtn" aria-disabled={!next}>
            Next ▸ <span className="kbd">J</span>
          </Link>
          {vlogId && (
            <button className="navbtn" onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/vlog/${vlogId}`).catch(() => {})
            }} title="Copy link">⎘</button>
          )}
        </div>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const isComplete = status === 'complete'
  const isFailed = status === 'failed'
  const isBroll = status === 'archived'
  const isProcessing = !isComplete && !isFailed && !isBroll
  const color = isComplete ? 'var(--sig)'
    : isFailed ? 'var(--t-terra)'
    : isBroll ? 'var(--fg-3)'
    : 'var(--t-ochre)'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '4px 11px',
      background: `color-mix(in srgb, ${color} 10%, var(--bg-2))`,
      border: `1px solid color-mix(in srgb, ${color} 35%, var(--line-1))`,
      borderRadius: 100,
      fontFamily: 'var(--font-mono)',
      fontSize: 10, letterSpacing: 1.6,
      textTransform: 'uppercase', fontWeight: 500,
      color,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px color-mix(in srgb, ${color} 60%, transparent)`,
        animation: isProcessing ? 'canon-pulse 2s ease-in-out infinite' : undefined,
      }}/>
      {isBroll ? 'B-roll · silent' : status.replace(/_/g, ' ')}
    </span>
  )
}

function ProvCell({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="canon-prov-cell">
      <span className="l">{label}</span>
      <span className={`v ${mono ? 'mono' : ''}`}>{value}</span>
    </div>
  )
}

function deriveVlogTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

/**
 * extractReason — pull plain-text rationale from a why_clippable
 * field. Some extraction runs wrote JSON like {"reason":"…"} instead
 * of a plain sentence; parse defensively so the operator doesn't
 * see raw JSON braces.
 */
function extractReason(raw: string | null | undefined): string | null {
  if (!raw) return null
  const t = String(raw).trim()
  if (!t.startsWith('{')) return t
  try {
    const parsed = JSON.parse(t)
    if (parsed && typeof parsed === 'object') {
      if (typeof parsed.reason === 'string') return parsed.reason
      if (typeof parsed.body === 'string') return parsed.body
    }
  } catch {}
  return t  // fall through — show the raw string rather than nothing
}

function tryPrettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2) } catch { return s }
}
