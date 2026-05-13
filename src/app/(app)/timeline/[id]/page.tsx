/**
 * Vlog detail. Renders the playback, basic metadata, the transcript, and the
 * threads extracted from this vlog. From here the operator can trigger
 * processing (archived vlogs), re-run extraction, or jump to a thread.
 */
'use client'

import { useEffect, useState } from 'react'

interface VlogDetail {
  id: string
  original_filename: string | null
  mime_type: string | null
  file_size_bytes: number | null
  duration_seconds: number | null
  recorded_at: string | null
  recorded_at_source: string | null
  thumbnail_url: string | null
  transcript_text: string | null
  pipeline_status: string
  pipeline_error: string | null
  playback_url: string | null
  extraction_outcomes: string | null  // JSON: {thumbnail, transcode, recorded_at, transcribe, threads, ...}
  updated_at: string | null
}

interface ThreadRow {
  id: string
  topic: string
  take: string
  key_quotes: string | null
  strength: number | null
  abstracted_topic: string | null
}

export default function VlogDetailPage({ params }: { params: { id: string } }) {
  const [vlog, setVlog] = useState<VlogDetail | null>(null)
  const [threads, setThreads] = useState<ThreadRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [tier, setTier] = useState<'free' | 'premium' | 'max'>('free')
  const [passes, setPasses] = useState<Set<'threads' | 'clip_candidates' | 'creative_elements' | 'entities'>>(
    new Set(['threads', 'clip_candidates', 'creative_elements', 'entities']),
  )
  const [showAdvanced, setShowAdvanced] = useState(false)

  // Kimi K2.6 (free tier): ~$0.01/pass. Sonnet (premium/max): ~$0.042/pass.
  // Numbers mirror src/lib/llm.ts COST_PER_VLOG — keep them in sync.
  const COST: Record<'free' | 'premium' | 'max', Record<string, number>> = {
    free:    { threads: 0.01,  clip_candidates: 0.01,  creative_elements: 0.01,  entities: 0.01 },
    premium: { threads: 0.042, clip_candidates: 0.01,  creative_elements: 0.042, entities: 0.01 },
    max:     { threads: 0.042, clip_candidates: 0.042, creative_elements: 0.042, entities: 0.042 },
  }
  const estCost = Array.from(passes).reduce((sum, p) => sum + (COST[tier][p] ?? 0), 0)
  const fmtCost = (n: number) => n < 0.01 ? '<$0.01' : `$${n.toFixed(n < 1 ? 2 : 2)}`

  const load = async () => {
    setError(null)
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}`, { credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: any = await r.json()
      setVlog(data.vlog)
      setThreads(data.threads || [])
    } catch (e: any) {
      setError(String(e.message || e))
    }
  }

  useEffect(() => { load() }, [params.id])

  // Auto-poll every 5s while pipeline is in flight, so the operator sees
  // status flip from 'transcoding' → 'transcribing' → 'extracting' → 'complete'
  // without manually refreshing. Stops as soon as we hit a terminal state.
  useEffect(() => {
    if (!vlog) return
    const status = vlog.pipeline_status
    const inFlight = status === 'uploaded' || status === 'transcoding' || status === 'transcribing' || status === 'extracting'
    if (!inFlight) return
    const id = setTimeout(() => { load() }, 5000)
    return () => clearTimeout(id)
  }, [vlog?.pipeline_status, vlog?.updated_at])

  // Pick up operator's preferred default tier (set in /settings).
  useEffect(() => {
    fetch('/api/v2/settings', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then((d: any) => {
        const t = d?.settings?.extraction_default_tier
        if (t === 'free' || t === 'premium' || t === 'max') setTier(t)
      })
      .catch(() => {})
  }, [])

  const triggerProcess = async () => {
    setProcessing(true)
    try {
      const r = await fetch(`/api/v2/vlogs/${params.id}/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, passes: Array.from(passes) }),
      })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      await load()
    } catch (e: any) {
      setError(String(e.message || e))
    } finally {
      setProcessing(false)
    }
  }

  if (error) return <main><div className="error-row">Error: {error}</div></main>
  if (!vlog) return <main><div className="empty-row"><p style={{ color: 'var(--bone-3)' }}>Loading…</p></div></main>

  const sizeMb = vlog.file_size_bytes ? (vlog.file_size_bytes / 1_000_000).toFixed(1) : null
  const recorded = vlog.recorded_at ? new Date(vlog.recorded_at).toLocaleString() : 'Unknown'
  const status = vlog.pipeline_status
  const isVideo = (vlog.mime_type || '').startsWith('video/')

  return (
    <div className="vlog-detail">
      <a href="/timeline" style={{ fontSize: 12, color: 'var(--bone-3)', display: 'inline-block', marginBottom: 16 }}>← Timeline</a>

      <div className="vplayer">
        {vlog.playback_url && isVideo && (
          <video src={vlog.playback_url} controls poster={vlog.thumbnail_url || undefined} />
        )}
        {vlog.playback_url && !isVideo && (
          <audio src={vlog.playback_url} controls style={{ width: '100%' }} />
        )}
        {!vlog.playback_url && vlog.thumbnail_url && (
          <img src={vlog.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>

      <h2>{deriveTitle(vlog.original_filename)}</h2>
      <div className="meta-row">
        <span>{recorded}{vlog.recorded_at_source ? ` · ${vlog.recorded_at_source}` : ''}</span>
        {sizeMb && <span>{sizeMb} MB</span>}
        {vlog.mime_type && <span>{vlog.mime_type}</span>}
        <span className="status-pill">{status}</span>
      </div>

      {vlog.pipeline_error && (
        <div className="error-row" style={{ marginBottom: 16 }}>Pipeline error: {vlog.pipeline_error}</div>
      )}

      {!vlog.thumbnail_url && (
        <div className="section">
          <div className="label">Thumbnail</div>
          <p style={{ fontSize: 13, color: 'var(--bone-2)', marginBottom: 12 }}>
            No thumbnail yet. For H.264 sources this generates in ~1-2 sec. For HEVC it requires a transcode first (~10 min).
          </p>
          <GenerateThumbnailButton vlogId={params.id} onDone={load} />
        </div>
      )}

      <PipelineStatus vlog={vlog} onRestart={load} />

      <div className="section">
        <div className="label">Re-extract</div>
        <p style={{ fontSize: 13, color: 'var(--bone-2)', marginBottom: 14 }}>
          Run the AI passes on this vlog. Higher tier = better quality where voice nuance matters.
        </p>

        {/* Tier picker */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {([
            ['free',    'Free',    'Kimi K2.6'],
            ['premium', 'Premium', 'Sonnet for voice-sensitive passes'],
            ['max',     'Max',     'Sonnet for everything'],
          ] as const).map(([k, label, sub]) => {
            const tierTotal = (['threads', 'clip_candidates', 'creative_elements', 'entities'] as const)
              .reduce((s, p) => s + COST[k][p], 0)
            return (
              <button
                key={k}
                onClick={() => setTier(k)}
                className={`fchip ${tier === k ? 'active' : ''}`}
                style={{
                  padding: '12px 16px',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  textAlign: 'left',
                  minWidth: 160,
                  flex: 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%' }}>
                  <span style={{ fontWeight: 500, fontSize: 14 }}>{label}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--bone-2)' }}>
                    {fmtCost(tierTotal)}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--bone-3)', marginTop: 4, lineHeight: 1.3 }}>{sub}</div>
              </button>
            )
          })}
        </div>

        <button
          onClick={triggerProcess}
          disabled={processing || passes.size === 0}
          className="action-btn"
          style={{ width: '100%' }}
        >
          {processing ? 'Dispatching…' : `Re-extract this vlog · ${fmtCost(estCost)}`}
        </button>

        <button
          onClick={() => setShowAdvanced(s => !s)}
          style={{
            marginTop: 12,
            background: 'transparent',
            border: 'none',
            color: 'var(--bone-3)',
            fontSize: 12,
            cursor: 'pointer',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '4px 0',
          }}
        >
          {showAdvanced ? '− Hide advanced' : '+ Advanced · pick specific passes'}
        </button>

        {showAdvanced && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)' }}>
            <p style={{ fontSize: 12, color: 'var(--bone-3)', marginBottom: 12, lineHeight: 1.55 }}>
              Four passes write to the graph. Uncheck any you don't want to re-run:
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {([
                ['threads',           'Threads',  'Your takes — topic / quotes / register'],
                ['clip_candidates',   'Clips',    'Moments worth pulling out as short clips'],
                ['creative_elements', 'Creative', 'Fictional / story material'],
                ['entities',          'Entities', 'People, places, projects, tools mentioned'],
              ] as const).map(([p, label, sub]) => {
                const on = passes.has(p)
                const model = MODEL_FOR_PASS(tier, p)
                const cost = COST[tier][p]
                return (
                  <button
                    key={p}
                    onClick={() => {
                      const next = new Set(passes)
                      on ? next.delete(p) : next.add(p)
                      setPasses(next)
                    }}
                    className={`fchip ${on ? 'active' : ''}`}
                    style={{
                      padding: '10px 14px',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      textAlign: 'left',
                      minWidth: 200,
                      opacity: on ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%' }}>
                      <span style={{ fontWeight: 500 }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: model === 'Sonnet' ? 'var(--t-brass)' : 'var(--bone-3)' }}>
                        {model} · {fmtCost(cost)}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--bone-3)', marginTop: 3, lineHeight: 1.3 }}>{sub}</div>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {vlog.transcript_text && (
        <div className="section">
          <div className="label">Transcript</div>
          <div className="transcript">{vlog.transcript_text}</div>
        </div>
      )}

      {threads.length > 0 && (
        <div className="section">
          <div className="label">{threads.length} thread{threads.length === 1 ? '' : 's'} extracted</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {threads.map(t => {
              const keyQuote = parseFirstQuote(t.key_quotes)
              return (
                <a key={t.id} href={`/thread/${t.id}`} className="tcard thread has-topic" style={{ ['--topic' as any]: 'var(--t-brass)' } as React.CSSProperties}>
                  <div className="t-meta">
                    <span className="type-tag">Thread</span>
                    <span className="sep">·</span>
                    <span className="status">{t.abstracted_topic || t.topic}</span>
                  </div>
                  <div className="t-headline">{t.take}</div>
                  {keyQuote && <div className="quote">{keyQuote}</div>}
                </a>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function GenerateThumbnailButton({ vlogId, onDone }: { vlogId: string; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const trigger = async () => {
    setBusy(true)
    setMsg(null)
    let r: Response
    let data: any
    try {
      r = await fetch(`/api/v2/vlogs/${vlogId}/thumbnail`, { method: 'POST', credentials: 'include' })
      data = await r.json().catch(() => ({}))
    } catch (e: any) {
      setMsg(`Failed: ${e.message || String(e)}`)
      setBusy(false)
      return
    }
    if (r.status === 200 && data.thumbnail_url) {
      setMsg('Thumbnail ready.')
      onDone()
      setBusy(false)
      return
    }
    if (r.status === 202) {
      // HEVC fallback — workflow dispatched. Poll for completion (max 15 min).
      setMsg(data.message || 'Transcoding — checking back…')
      let attempts = 0
      const maxAttempts = 90
      const poll = async () => {
        attempts++
        if (attempts > maxAttempts) {
          setMsg('Still transcoding after 15 min. Refresh the page later.')
          setBusy(false)
          return
        }
        try {
          const pr = await fetch(`/api/v2/vlogs/${vlogId}`, { credentials: 'include' })
          const pdata: any = await pr.json().catch(() => ({}))
          if (pdata?.vlog?.thumbnail_url) {
            setMsg('Thumbnail ready.')
            onDone()
            setBusy(false)
            return
          }
        } catch {}
        setTimeout(poll, 10_000)
      }
      setTimeout(poll, 10_000)
      return
    }
    setMsg(`Failed: ${data?.error || `HTTP ${r.status}`}`)
    setBusy(false)
  }
  return (
    <div>
      <button onClick={trigger} disabled={busy} className="action-btn">
        {busy ? 'Generating…' : 'Generate thumbnail'}
      </button>
      {msg && <div style={{ marginTop: 10, fontSize: 12, color: 'var(--bone-3)' }}>{msg}</div>}
    </div>
  )
}

// Live pipeline status block — visible whenever the vlog isn't 'complete' or
// 'archived' (the two terminal states). Reads pipeline_status + the per-step
// extraction_outcomes JSON. The parent component auto-polls every 5s while
// status is in flight so this just re-renders with fresh data.
function PipelineStatus({ vlog, onRestart }: { vlog: VlogDetail; onRestart: () => void }) {
  const status = vlog.pipeline_status
  const [diagnostic, setDiagnostic] = useState<{
    container: { ok: boolean; status?: number; body?: string; error?: string; ms?: number }
    in_flight: { transcoding: number; transcribing: number; extracting: number; uploaded: number; total: number }
    container_max_instances: number
    saturated: boolean
  } | null>(null)
  const [diagBusy, setDiagBusy] = useState(false)
  const [restartBusy, setRestartBusy] = useState(false)
  const runDiagnostic = async () => {
    setDiagBusy(true)
    try {
      const r = await fetch('/api/v2/system/ffmpeg-status', { credentials: 'include' })
      const d: any = await r.json().catch(() => null)
      if (d?.container && d?.in_flight) setDiagnostic(d)
    } catch {} finally { setDiagBusy(false) }
  }
  const restart = async () => {
    if (restartBusy) return
    setRestartBusy(true)
    try {
      await fetch(`/api/v2/vlogs/${vlog.id}/process`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),  // no tier/passes → fresh dispatch, full pipeline
      })
      onRestart()
    } finally { setRestartBusy(false) }
  }
  // Hide entirely when there's nothing useful to show — no processing happening
  // and no per-step outcomes recorded yet.
  if ((status === 'complete' || status === 'archived' || status === 'failed') && !vlog.extraction_outcomes) {
    return null
  }

  // Per-step outcomes from the workflow's softStep wrapper. Shape per step:
  //   { ok, status?: 'running'|'done'|'failed', started_at?, ms?, method?,
  //     tier?, count?, error? }
  let outcomes: Record<string, {
    ok: boolean
    status?: 'running' | 'done' | 'failed'
    started_at?: string
    ms?: number
    method?: string
    tier?: string
    count?: number
    error?: string
  }> = {}
  try { if (vlog.extraction_outcomes) outcomes = JSON.parse(vlog.extraction_outcomes) } catch {}

  // Determine which steps the workflow will SKIP because state is already
  // present (guards live in workers/process-upload/src/workflow.ts — keep
  // in sync). Skipped steps show as ✓ (already done) instead of pending (·).
  const alreadyDone: Record<string, string | null> = {
    thumbnail:    vlog.thumbnail_url ? 'data URI present' : null,  // r2_key also implies done but we can't see it from client
    recorded_at:  vlog.recorded_at ? vlog.recorded_at_source || 'already set' : null,
    transcode:    null,  // can't tell from client (transcoded_r2_key isn't exposed)
    transcribe:   vlog.transcript_text ? 'transcript present' : null,
  }

  const STEPS: { key: string; label: string; model?: string }[] = [
    { key: 'thumbnail',         label: 'Thumbnail extraction', model: 'FFmpeg' },
    { key: 'recorded_at',       label: 'Recorded date',         model: 'mvhd / filename' },
    { key: 'transcode',         label: 'Video transcode',       model: 'FFmpeg' },
    { key: 'transcribe',        label: 'Transcribe audio',      model: 'Workers AI Whisper' },
    { key: 'threads',           label: 'Threads extraction',    model: 'LLM' },
    { key: 'clip_candidates',   label: 'Clips extraction',      model: 'LLM' },
    { key: 'creative_elements', label: 'Creative extraction',   model: 'LLM' },
    { key: 'entities',          label: 'Entities extraction',   model: 'LLM' },
  ]

  // Current step inference: first one without a recorded outcome (assuming
  // pipeline_status is in flight). Best-effort — workflow steps don't all
  // map 1:1 to pipeline_status enum values.
  const inFlight = status === 'uploaded' || status === 'transcoding' || status === 'transcribing' || status === 'extracting'

  return (
    <div className="section" style={{
      padding: '14px 16px',
      background: 'var(--ink-2)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div className="label" style={{ margin: 0 }}>Pipeline</div>
        <span style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          letterSpacing: 1.5,
          textTransform: 'uppercase',
          padding: '3px 8px',
          borderRadius: 100,
          color: inFlight ? 'var(--state-info, #6b9aa9)' : status === 'complete' ? 'var(--state-ok, #7a9a6a)' : status === 'failed' ? 'var(--state-err)' : 'var(--bone-3)',
          background: inFlight ? 'rgba(107,154,169,0.10)' : status === 'complete' ? 'rgba(122,154,106,0.10)' : status === 'failed' ? 'rgba(198,96,66,0.10)' : 'transparent',
          border: `1px solid ${inFlight ? 'rgba(107,154,169,0.30)' : status === 'complete' ? 'rgba(122,154,106,0.40)' : status === 'failed' ? 'var(--state-err)' : 'var(--line-warm)'}`,
        }}>
          {status}{inFlight && ' · polling'}
        </span>
        {inFlight && (
          <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--bone-4)' }}>
            updates every 5s
          </span>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {STEPS.map(step => {
          const o = outcomes[step.key]
          // Three precise states from the workflow itself:
          //   o.status === 'running' → step is actively executing
          //   o.status === 'done'    → step completed successfully
          //   o.status === 'failed'  → step exhausted retries
          //   (no entry)             → either not started yet OR skipped because
          //                             pre-state already satisfied
          const running = o?.status === 'running' || (o?.ok === false && o?.status === undefined && o?.ms === 0)
          const done = o?.status === 'done' || (o?.ok === true && !running)
          const failed = o?.status === 'failed' || (o?.ok === false && o?.error != null)
          const skippedAlreadyDone = !o && alreadyDone[step.key] != null
          const elapsedSec = running && o?.started_at
            ? Math.max(0, Math.floor((Date.now() - new Date(o.started_at).getTime()) / 1000))
            : null
          return (
            <div key={step.key} style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              padding: '4px 0',
              fontSize: 12,
              color: done || skippedAlreadyDone ? 'var(--bone-1)' : failed ? 'var(--bone-2)' : running ? 'var(--bone)' : 'var(--bone-4)',
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 11,
                width: 22,
                color: done || skippedAlreadyDone ? 'var(--state-ok, #7a9a6a)' : failed ? 'var(--state-err)' : running ? 'var(--state-info, #6b9aa9)' : 'var(--bone-4)',
              }}>
                {done ? '✓' : skippedAlreadyDone ? '✓' : failed ? '✗' : running ? '⋯' : '·'}
              </span>
              <span style={{ flex: 1 }}>{step.label}</span>
              {step.model && (
                <span style={{ fontSize: 10, color: 'var(--bone-4)', fontFamily: 'JetBrains Mono, monospace', letterSpacing: 0.5 }}>
                  {step.model}
                </span>
              )}
              {/* Trailing detail */}
              {running && elapsedSec != null && (
                <span style={{ fontSize: 10, color: 'var(--state-info, #6b9aa9)', fontFamily: 'JetBrains Mono, monospace' }}>
                  running {elapsedSec}s
                </span>
              )}
              {!running && o && (
                <span style={{ fontSize: 10, color: failed ? 'var(--state-err)' : 'var(--bone-3)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {failed ? (o.error ? o.error.slice(0, 40) : 'failed') :
                   o.method ? o.method :
                   o.tier ? o.tier :
                   o.count != null ? `${o.count}` :
                   o.ms != null ? `${(o.ms / 1000).toFixed(1)}s` : 'ok'}
                </span>
              )}
              {!o && skippedAlreadyDone && (
                <span style={{ fontSize: 10, color: 'var(--bone-3)', fontFamily: 'JetBrains Mono, monospace' }}>
                  already done · skipped
                </span>
              )}
            </div>
          )
        })}
      </div>

      {vlog.pipeline_error && (
        <div style={{
          marginTop: 12,
          padding: '8px 10px',
          background: 'rgba(198,96,66,0.08)',
          border: '1px solid var(--state-err)',
          borderRadius: 8,
          fontSize: 11,
          color: 'var(--state-err)',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {vlog.pipeline_error}
        </div>
      )}

      {/* Raw extraction_outcomes JSON for forensics — collapsed by default */}
      {vlog.extraction_outcomes && (
        <details style={{ marginTop: 12 }}>
          <summary style={{
            fontSize: 10,
            color: 'var(--bone-4)',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1,
            textTransform: 'uppercase',
            cursor: 'pointer',
          }}>
            View raw workflow log
          </summary>
          <pre style={{
            marginTop: 8,
            padding: '10px 12px',
            background: 'var(--ink-1)',
            border: '1px solid var(--line)',
            borderRadius: 8,
            fontSize: 10,
            lineHeight: 1.5,
            color: 'var(--bone-2)',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
            maxHeight: 280,
          }}>
            {(() => {
              try { return JSON.stringify(JSON.parse(vlog.extraction_outcomes), null, 2) }
              catch { return vlog.extraction_outcomes }
            })()}
          </pre>
        </details>
      )}

      {/* Diagnostic + Restart row — visible when the workflow is in flight.
          Restart dispatches a fresh workflow (clears stale outcomes), useful
          when a step is genuinely stuck. Diagnostic probes the FFmpeg
          container health + counts how many in-flight workflows are competing
          for container slots (max 5 concurrent). */}
      {inFlight && (
        <div style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: '1px solid var(--line)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}>
          <button
            onClick={restart}
            disabled={restartBusy}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--state-err)',
              background: 'rgba(198,96,66,0.06)',
              color: 'var(--state-err)',
              borderRadius: 100,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              cursor: restartBusy ? 'wait' : 'pointer',
            }}
          >
            {restartBusy ? 'Restarting…' : 'Restart pipeline'}
          </button>
          <button
            onClick={runDiagnostic}
            disabled={diagBusy}
            style={{
              padding: '6px 12px',
              border: '1px solid var(--line-warm)',
              background: 'rgba(236,228,210,0.04)',
              color: 'var(--bone-1)',
              borderRadius: 100,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              letterSpacing: 1.4,
              textTransform: 'uppercase',
              cursor: diagBusy ? 'wait' : 'pointer',
            }}
          >
            {diagBusy ? 'Checking…' : 'Check FFmpeg container'}
          </button>
          {diagnostic && (
            <div style={{
              flex: '1 0 100%',
              marginTop: 8,
              padding: '10px 12px',
              background: 'var(--ink-1)',
              border: `1px solid ${diagnostic.container.ok ? 'var(--line)' : 'var(--state-err)'}`,
              borderRadius: 8,
              fontSize: 11,
              fontFamily: 'JetBrains Mono, monospace',
              color: 'var(--bone-1)',
              lineHeight: 1.6,
            }}>
              <div>
                <strong>Container:</strong>{' '}
                {diagnostic.container.ok
                  ? <span style={{ color: 'var(--state-ok, #7a9a6a)' }}>OK · {diagnostic.container.ms}ms</span>
                  : <span style={{ color: 'var(--state-err)' }}>FAIL · {diagnostic.container.error || `HTTP ${diagnostic.container.status}`}</span>}
              </div>
              <div>
                <strong>In-flight workflows:</strong> {diagnostic.in_flight.total} ·
                transcoding: {diagnostic.in_flight.transcoding} ·
                transcribing: {diagnostic.in_flight.transcribing} ·
                extracting: {diagnostic.in_flight.extracting}
              </div>
              {diagnostic.saturated && (
                <div style={{ marginTop: 6, color: 'var(--state-err)' }}>
                  ⚠ Container saturated. Max {diagnostic.container_max_instances} concurrent.
                  Other workflows are ahead in the queue — wait or kill them in Cloudflare dashboard.
                </div>
              )}
              {!diagnostic.saturated && diagnostic.container.ok && (
                <div style={{ marginTop: 6, color: 'var(--bone-3)' }}>
                  Container OK, queue clear. If your row's still stuck, the workflow died — hit Restart pipeline.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Mirrors src/lib/llm.ts modelFor() — keep in sync. Returns the human-friendly
// model name for the (tier, pass) pair so the UI can show which model will run
// each pass.
type Pass = 'threads' | 'clip_candidates' | 'creative_elements' | 'entities'
function MODEL_FOR_PASS(tier: 'free' | 'premium' | 'max', pass: Pass): string {
  if (tier === 'max') return 'Sonnet'
  if (tier === 'premium') {
    return (pass === 'threads' || pass === 'creative_elements') ? 'Sonnet' : 'Kimi K2.6'
  }
  return 'Kimi K2.6'
}

function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled vlog'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, ch => ch.toUpperCase()) || 'Untitled vlog'
}

function parseFirstQuote(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return String(parsed[0])
  } catch {}
  return null
}
