'use client'

/**
 * Vlogs — the raw archive. Replaces /uploads.
 *
 * Ported from neolog-design/project/screens/vlogs.jsx. Grid of vlog cards
 * with topic dot, filename, date, size, thread count. Filter pills across
 * the top + status pill on each card.
 *
 * Live data: GET /api/v2/vlogs?limit=200 (existing endpoint).
 */

export const runtime = 'edge'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Shell, { NavIcons, TopicDot } from '@/components/Shell'

interface VlogRow {
  id: string
  original_filename: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  recorded_at: string | null
  uploaded_at: string
  thumbnail_url: string | null
  pipeline_status: string
  has_transcript?: 0 | 1 | boolean
}

type Filter = 'all' | 'today' | 'week' | 'processing' | 'complete' | 'archived' | 'failed'

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',        label: 'All' },
  { key: 'today',      label: 'Today' },
  { key: 'week',       label: 'This week' },
  { key: 'processing', label: 'Processing' },
  { key: 'complete',   label: 'Complete' },
  { key: 'archived',   label: 'Archived' },
  { key: 'failed',     label: 'Failed' },
]

export default function VlogsPage() {
  const [vlogs, setVlogs] = useState<VlogRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [bulkOpen, setBulkOpen] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then((d: any) => { setVlogs(d.vlogs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: 0, today: 0, week: 0, processing: 0, complete: 0, archived: 0, failed: 0 }
    const now = Date.now()
    const dayMs = 86_400_000
    for (const v of vlogs) {
      c.all++
      const recordedTs = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - recordedTs) / dayMs
      if (ageDays < 1) c.today++
      if (ageDays < 7) c.week++
      if (['transcoding', 'transcribing', 'extracting', 'uploaded'].includes(v.pipeline_status)) c.processing++
      else if (v.pipeline_status === 'complete') c.complete++
      else if (v.pipeline_status === 'archived') c.archived++
      else if (v.pipeline_status === 'failed') c.failed++
    }
    return c
  }, [vlogs])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = Date.now()
    const dayMs = 86_400_000
    return vlogs.filter(v => {
      if (q) {
        const hay = `${v.original_filename ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (filter === 'all') return true
      const recordedTs = v.recorded_at ? new Date(v.recorded_at).getTime() : new Date(v.uploaded_at).getTime()
      const ageDays = (now - recordedTs) / dayMs
      if (filter === 'today') return ageDays < 1
      if (filter === 'week') return ageDays < 7
      if (filter === 'processing') return ['transcoding', 'transcribing', 'extracting', 'uploaded'].includes(v.pipeline_status)
      if (filter === 'complete') return v.pipeline_status === 'complete'
      if (filter === 'archived') return v.pipeline_status === 'archived'
      if (filter === 'failed') return v.pipeline_status === 'failed'
      return true
    })
  }, [vlogs, filter, query])

  const totalBytes = vlogs.reduce((s, v) => s + (v.file_size_bytes ?? 0), 0)
  const totalGb = (totalBytes / 1_000_000_000).toFixed(2)
  const busy = counts.processing > 0

  return (
    <Shell active="vlogs" breadcrumb={['Vlogs']} hot={busy ? `${counts.processing} active` : 'all healthy'} busy={busy}>
      <div className="pad-tight">
        <div className="h1-row">
          <div>
            <h1>Vlogs</h1>
            <p className="sub" style={{ marginBottom: 0, marginTop: 6 }}>
              Every recording you've brought into Neolog. {counts.all} files · {totalGb} GB on disk.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={load}><span className="ico">{NavIcons.Refresh}</span>Refresh</button>
            <button className="btn" onClick={() => setBulkOpen(true)}>
              Re-process all
            </button>
            <Link href="/capture" className="btn primary">
              <span className="ico">{NavIcons.Plus}</span>Add vlog<span className="kbd">N</span>
            </Link>
          </div>
        </div>

        {bulkOpen && (
          <BulkReprocessModal
            onClose={() => setBulkOpen(false)}
            onDone={load}
          />
        )}

        {/* Filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 24, marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="pills">
            {FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`filter-pill ${filter === f.key ? 'active' : ''}`}
              >
                {f.label} <span className="n">{counts[f.key]}</span>
              </button>
            ))}
          </div>
          <div style={{ flex: 1 }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, width: 240 }}>
            <span style={{ display: 'inline-flex', width: 13, height: 13, color: 'var(--fg-4)' }}>{NavIcons.Search}</span>
            <input
              placeholder="Filename or content"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{ flex: 1, fontSize: 12, color: 'var(--fg-1)' }}
            />
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ color: 'var(--fg-3)', padding: 40, textAlign: 'center' }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="ico">{NavIcons.Vlogs}</div>
            <h3>No vlogs match this filter</h3>
            <p>Try a different filter or upload your first vlog.</p>
            <Link href="/capture" className="btn primary"><span className="ico">{NavIcons.Plus}</span>Add vlog</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
            {filtered.map(v => <VlogCard key={v.id} v={v}/>)}
          </div>
        )}
      </div>
    </Shell>
  )
}

// ─── Bulk reprocess modal ──────────────────────────────────────────────────
//
// State machine (phase):
//   idle      — picking scope/mode/chunk_size, can preview
//   preview   — fetching dry-run list, then showing count + sample
//   ready     — preview returned, user clicks Run
//   running   — chunked loop in flight; cancellable
//   done      — finished or aborted, summary shown
//
// Durability:
//   - Run state is checkpointed to localStorage after every chunk so
//     closing the modal (or even reloading the page) doesn't lose progress.
//   - Resuming a run picks up from `processed_idx` against the original
//     `ids` list.
//   - Per-chunk retry: each chunk POST retries up to 3x with exponential
//     backoff before being recorded as a failed chunk; remaining chunks
//     keep going.
//
// Throughput knobs the operator can tune:
//   - chunk_size   (default 8, range 1–25): how many ids per POST.
//   - pause_ms     (default 800): how long to wait between chunks.
//   These are intentionally conservative so a 150-vlog run won't spike
//   Workers AI / Anthropic rate limits.

type BulkPhase = 'idle' | 'preview' | 'ready' | 'running' | 'done'

interface BulkCheckpoint {
  version: 1
  mode: 'cheap' | 'premium'
  scope: 'incomplete' | 'all'
  chunkSize: number
  pauseMs: number
  ids: string[]
  processedIdx: number
  dispatched: number
  skipped: number
  failed: number
  failures: { vlog_id: string; error: string; reason?: string }[]
  startedAt: number
  finishedAt: number | null
}

const CHECKPOINT_KEY = 'neolog.bulkReprocess.v1'

function loadCheckpoint(): BulkCheckpoint | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(CHECKPOINT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== 1) return null
    return parsed as BulkCheckpoint
  } catch { return null }
}

function saveCheckpoint(cp: BulkCheckpoint) {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(cp)) } catch {}
}

function clearCheckpoint() {
  if (typeof window === 'undefined') return
  try { window.localStorage.removeItem(CHECKPOINT_KEY) } catch {}
}

function BulkReprocessModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [phase, setPhase] = useState<BulkPhase>('idle')
  const [mode, setMode] = useState<'cheap' | 'premium'>('cheap')
  const [scope, setScope] = useState<'incomplete' | 'all'>('incomplete')
  // Defaults tuned after a real 150-vlog backfill showed Workers AI
  // degrading silently under burst pressure. Lower throughput plus the
  // empty-extraction guard in extract-unified.ts means each individual
  // call is reliable even if total wall-clock is a bit longer.
  const [chunkSize, setChunkSize] = useState(6)
  const [pauseMs, setPauseMs] = useState(1200)

  const [ids, setIds] = useState<string[]>([])
  const [skippedInFlight, setSkippedInFlight] = useState(0)
  const [transcribedCount, setTranscribedCount] = useState(0)
  const [untranscribedCount, setUntranscribedCount] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Diagnostic data — auto-fetched on modal open. ZERO cost.
  const [diag, setDiag] = useState<any | null>(null)
  const [diagError, setDiagError] = useState<string | null>(null)
  const [diagLoading, setDiagLoading] = useState(true)

  // Stuck-cleanup state
  const [resetBusy, setResetBusy] = useState(false)
  const [resetResult, setResetResult] = useState<string | null>(null)

  // Kill-all state (terminate workflow instances + DOs)
  const [killBusy, setKillBusy] = useState(false)
  const [killResult, setKillResult] = useState<string | null>(null)

  // Smoke-test state
  const [smokeBusy, setSmokeBusy] = useState(false)
  const [smokeResult, setSmokeResult] = useState<{ ok: boolean; vlog_id?: string; message: string } | null>(null)

  const [processed, setProcessed] = useState(0)
  const [dispatched, setDispatched] = useState(0)
  const [skipped, setSkipped] = useState(0)
  const [failed, setFailed] = useState(0)
  const [failures, setFailures] = useState<{ vlog_id: string; error: string; reason?: string }[]>([])

  // Mutable refs so the async loop reads the latest values without the
  // closure-over-state hazard.
  const abortRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)
  const checkpointRef = useRef<BulkCheckpoint | null>(null)

  // Restore in-progress checkpoint on open.
  useEffect(() => {
    const cp = loadCheckpoint()
    if (cp && cp.processedIdx < cp.ids.length && !cp.finishedAt) {
      setMode(cp.mode); setScope(cp.scope); setChunkSize(cp.chunkSize); setPauseMs(cp.pauseMs)
      setIds(cp.ids); setProcessed(cp.processedIdx)
      setDispatched(cp.dispatched); setSkipped(cp.skipped); setFailed(cp.failed); setFailures(cp.failures)
      checkpointRef.current = cp
      setPhase('ready') // let the user click Resume rather than auto-running
    }
  }, [])

  // Fetch the free diagnostic on modal open.
  const refreshDiag = async () => {
    setDiagLoading(true); setDiagError(null)
    try {
      const r = await fetch('/api/v2/admin/pipeline-state', { credentials: 'include' })
      if (!r.ok) {
        const d: any = await r.json().catch(() => ({}))
        throw new Error(d?.details || d?.error || `HTTP ${r.status}`)
      }
      setDiag(await r.json())
    } catch (err: any) {
      setDiagError(err?.message || String(err))
    } finally {
      setDiagLoading(false)
    }
  }
  useEffect(() => { refreshDiag() }, [])

  const runResetStuck = async () => {
    setResetBusy(true); setResetResult(null)
    try {
      const r = await fetch('/api/v2/admin/reset-stuck', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'in_flight' }),
      })
      const d: any = await r.json()
      if (!r.ok) {
        setResetResult(`Reset failed: ${d?.details || d?.error || `HTTP ${r.status}`}`)
      } else {
        setResetResult(`Reset ${d.reset} stuck vlog${d.reset === 1 ? '' : 's'}.`)
        await refreshDiag()
      }
    } catch (err: any) {
      setResetResult(`Reset error: ${err?.message || err}`)
    } finally {
      setResetBusy(false)
    }
  }

  const runKillAll = async () => {
    if (!confirm('Terminate every running Workflow + Durable Object for your operator? This stops all in-flight pipeline work — including any vlog that\'s legitimately progressing. Continue?')) return
    setKillBusy(true); setKillResult(null)
    try {
      const r = await fetch('/api/v2/admin/terminate-all', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflows: true, dos: true }),
      })
      const d: any = await r.json()
      if (!r.ok) {
        setKillResult(`Kill failed: ${d?.details || d?.error || `HTTP ${r.status}`}`)
      } else {
        const wf = d.workflows ?? {}
        const dos = d.dos ?? {}
        const summary = [
          `Workflows: ${wf.terminated}/${wf.found} terminated`,
          `DOs: ${dos.terminated}/${dos.found} killed`,
          (wf.errors?.length || dos.errors?.length) ? `(${(wf.errors?.length ?? 0) + (dos.errors?.length ?? 0)} errors)` : '',
        ].filter(Boolean).join(' · ')
        setKillResult(summary)
        await refreshDiag()
      }
    } catch (err: any) {
      setKillResult(`Kill error: ${err?.message || err}`)
    } finally {
      setKillBusy(false)
    }
  }

  const runSmokeTest = async () => {
    if (!diag || diag.counts_for_run?.needs_full_pipeline === 0) {
      setSmokeResult({ ok: false, message: 'No untranscribed vlog available to smoke-test.' })
      return
    }
    setSmokeBusy(true); setSmokeResult(null)
    try {
      // Dry-run resolution to find the first untranscribed candidate.
      const r = await fetch('/api/v2/admin/reprocess-vlogs', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'all', mode, dry_run: true, skip_in_flight: true }),
      })
      const d: any = await r.json()
      const candidates: string[] = d.ids ?? []
      // Pick the first id we know is untranscribed (transcribed_count
      // vs untranscribed_count tells us roughly where in the list they are
      // but doesn't give per-id flags — we use the second response):
      // call dispatch with a single id list and read entry='start' back.
      if (candidates.length === 0) {
        setSmokeResult({ ok: false, message: 'No eligible vlog found.' })
        return
      }
      // The bulk endpoint dispatches per-vlog and tells us whether it
      // routed to /start or /reextract. Send just the first candidate.
      const dispatchRes = await fetch('/api/v2/admin/reprocess-vlogs', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_ids: [candidates[0]], mode, skip_in_flight: true }),
      })
      const dispatchJson: any = await dispatchRes.json()
      if (!dispatchRes.ok || dispatchJson.dispatched === 0) {
        setSmokeResult({
          ok: false, vlog_id: candidates[0],
          message: `Smoke dispatch failed: ${dispatchJson?.error || dispatchJson?.results?.[0]?.error || 'unknown'}`,
        })
        return
      }
      const entry = dispatchJson.results?.[0]?.entry
      setSmokeResult({
        ok: true, vlog_id: candidates[0],
        message: `Dispatched 1 vlog via ${entry === 'start' ? '/start (full pipeline)' : '/reextract (LLM only)'}. Open the vlog detail page to watch live progress.`,
      })
      await refreshDiag()
    } catch (err: any) {
      setSmokeResult({ ok: false, message: `Smoke test error: ${err?.message || err}` })
    } finally {
      setSmokeBusy(false)
    }
  }

  const runPreview = async () => {
    setPhase('preview'); setPreviewError(null)
    try {
      const r = await fetch('/api/v2/admin/reprocess-vlogs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, mode, dry_run: true, skip_in_flight: true }),
      })
      const d: any = await r.json().catch(() => ({}))
      if (!r.ok) {
        setPreviewError(d?.details || d?.error || `HTTP ${r.status}`)
        setPhase('idle'); return
      }
      setIds(d.ids ?? [])
      setSkippedInFlight(d.skipped_in_flight ?? 0)
      setTranscribedCount(d.transcribed_count ?? 0)
      setUntranscribedCount(d.untranscribed_count ?? 0)
      setProcessed(0); setDispatched(0); setSkipped(0); setFailed(0); setFailures([])
      setPhase('ready')
    } catch (err: any) {
      setPreviewError(err?.message || String(err))
      setPhase('idle')
    }
  }

  const start = async (resume = false) => {
    cancelledRef.current = false
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal

    const startIdx = resume ? processed : 0
    // FIRE-AND-FORGET CHUNKS: dispatch CHUNK_SIZE vlogs per server call,
    // pause CHUNK_PAUSE_MS between chunks, don't wait for them to
    // complete. This is what the operator ranked as the BEST approach
    // earlier — "it did a bunch" — high visible throughput, tolerant
    // of individual vlog failures, doesn't block the queue on one
    // slow vlog.
    //
    // Progress here counts DISPATCHED vlogs, not COMPLETED ones. To
    // see actual completion progress, the operator refreshes the
    // diagnostic panel at the top of the modal.
    const cp: BulkCheckpoint = {
      version: 1,
      mode, scope, chunkSize: CHUNK_SIZE, pauseMs: CHUNK_PAUSE_MS,
      ids,
      processedIdx: startIdx,
      dispatched: resume ? dispatched : 0,
      skipped: resume ? skipped : 0,
      failed: resume ? failed : 0,
      failures: resume ? failures : [],
      startedAt: Date.now(),
      finishedAt: null,
    }
    checkpointRef.current = cp
    saveCheckpoint(cp)
    setProcessed(startIdx)
    setPhase('running')

    let idx = startIdx
    while (idx < ids.length) {
      if (cancelledRef.current || signal.aborted) break

      const chunk = ids.slice(idx, idx + CHUNK_SIZE)
      const chunkRes = await dispatchChunkWithRetry(chunk, mode, signal)
      if (chunkRes === 'aborted') break

      if (typeof chunkRes === 'object' && 'kind' in chunkRes && chunkRes.kind === 'fatal') {
        for (const vlog_id of chunk) {
          cp.failures.push({ vlog_id, error: chunkRes.lastError })
          cp.failed += 1
        }
      } else if (typeof chunkRes === 'object' && 'results' in chunkRes) {
        for (const r of chunkRes.results) {
          if (r.ok) cp.dispatched += 1
          else if (r.reason) {
            cp.skipped += 1
            cp.failures.push({ vlog_id: r.vlog_id, error: r.reason, reason: r.reason })
          } else {
            cp.failed += 1
            cp.failures.push({ vlog_id: r.vlog_id, error: r.error || 'unknown' })
          }
        }
      }

      idx += chunk.length
      cp.processedIdx = idx
      saveCheckpoint(cp)

      setProcessed(idx)
      setDispatched(cp.dispatched); setSkipped(cp.skipped); setFailed(cp.failed)
      setFailures([...cp.failures])

      if (idx < ids.length && !cancelledRef.current) {
        await sleepWithAbort(CHUNK_PAUSE_MS, signal)
      }
    }

    cp.finishedAt = Date.now()
    saveCheckpoint(cp)
    setPhase('done')
    onDone()
  }

  const cancel = () => {
    cancelledRef.current = true
    if (abortRef.current) abortRef.current.abort()
  }

  const reset = () => {
    cancelledRef.current = false
    setIds([]); setProcessed(0); setDispatched(0); setSkipped(0); setFailed(0); setFailures([])
    clearCheckpoint()
    checkpointRef.current = null
    setPhase('idle')
  }

  const perVlog = mode === 'premium' ? 0.05 : 0.02
  const estCost = ids.length * perVlog
  const remaining = Math.max(0, ids.length - processed)
  const pct = ids.length > 0 ? Math.round((processed / ids.length) * 100) : 0

  return (
    <div onClick={phase === 'running' ? undefined : onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 50,
    }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{
        padding: 20, maxWidth: 600, width: '92%', maxHeight: '85vh', overflow: 'auto',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Bulk re-process vlogs</h2>
          {phase === 'running' && (
            <span className="pill hot" style={{ marginLeft: 'auto' }}>running · {pct}%</span>
          )}
          {phase === 'done' && (
            <span className={`pill ${failed > 0 ? 'err' : 'ok'}`} style={{ marginLeft: 'auto' }}>
              {cancelledRef.current ? 'cancelled' : 'done'}
            </span>
          )}
        </div>

        {(phase === 'idle' || phase === 'preview') && (
          <>
            {/* Free diagnostic — fetched on modal open. Costs nothing. */}
            <DiagnosticPanel
              diag={diag}
              loading={diagLoading}
              error={diagError}
              onRefresh={refreshDiag}
              onResetStuck={runResetStuck}
              resetBusy={resetBusy}
              resetResult={resetResult}
              onKillAll={runKillAll}
              killBusy={killBusy}
              killResult={killResult}
            />

            {/* Smoke test — runs ONE vlog through the full pipeline. ~$0.10. */}
            <SmokeTestRow
              diag={diag}
              busy={smokeBusy}
              result={smokeResult}
              onRun={runSmokeTest}
            />

            <p style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.55, margin: 0 }}>
              Bulk dispatches the right pipeline entry per vlog: untranscribed → full pipeline
              (audio extract → transcribe → LLM extract); transcribed → LLM extract only.
              Both paths queue through rate-limiters so external services aren't overwhelmed.
            </p>

            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Mode
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  ['cheap',   'Cheap',   'Llama 3.3 70B · ~$0.02 / vlog'],
                  ['premium', 'Premium', 'Sonnet 4.6 · ~$0.05 / vlog'],
                ] as const).map(([k, label, sub]) => (
                  <button
                    key={k}
                    className={`fchip ${mode === k ? 'active' : ''}`}
                    style={{ flex: 1, padding: '10px 14px', flexDirection: 'column', alignItems: 'flex-start' }}
                    onClick={() => setMode(k)}
                  >
                    <span style={{ fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                Scope
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {([
                  ['incomplete', 'Incomplete only', 'Skips vlogs that already finished with an active extraction'],
                  ['all',        'Everything',      'Includes already-complete vlogs (will replace their extraction)'],
                ] as const).map(([k, label, sub]) => (
                  <button
                    key={k}
                    className={`fchip ${scope === k ? 'active' : ''}`}
                    style={{ flex: 1, padding: '10px 14px', flexDirection: 'column', alignItems: 'flex-start' }}
                    onClick={() => setScope(k)}
                  >
                    <span style={{ fontWeight: 500 }}>{label}</span>
                    <span style={{ fontSize: 11, color: 'var(--fg-3)', marginTop: 2 }}>{sub}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={{
              fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.5,
              padding: 8, background: 'var(--bg-1)', borderRadius: 4, border: '1px solid var(--line)',
            }}>
              <b style={{ color: 'var(--fg-1)' }}>Fire-and-forget chunks of 6:</b> the modal
              dispatches 6 vlogs per call to the server, waits 1s, then dispatches the
              next 6. Each vlog runs through its own pipeline DO in the background — the
              modal doesn't wait for them to complete. The downstream gates (LlamaGate
              cap 8, FFmpegGate cap 3) absorb the burst so Workers AI / FFmpeg never get
              overwhelmed. To see how many actually completed, refresh the corpus
              diagnostic panel at the top. Close the modal anytime — dispatched work
              continues; the checkpoint resumes from where it stopped.
            </div>

            {previewError && (
              <div style={{ fontSize: 12, color: 'var(--err)' }}>Preview failed: {previewError}</div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={onClose}>Cancel</button>
              <button className="btn primary" disabled={phase === 'preview'} onClick={runPreview}>
                {phase === 'preview' ? 'Resolving…' : 'Preview'}
              </button>
            </div>
          </>
        )}

        {phase === 'ready' && (
          <>
            {/* Cost is split: untranscribed cost ~5x more (full pipeline:
                FFmpeg + Whisper + LLM) vs transcribed (just LLM). */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, fontSize: 12 }}>
              <Stat label="Total" value={ids.length} />
              <Stat label="Full pipeline" value={untranscribedCount} />
              <Stat label="Extract only" value={transcribedCount} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, fontSize: 12 }}>
              <Stat
                label="Est. cost"
                value={`$${(untranscribedCount * 0.10 + transcribedCount * 0.02).toFixed(2)}`}
              />
              <Stat label="Skipped (in-flight)" value={skippedInFlight} tone="mute" />
            </div>
            {untranscribedCount > 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.5 }}>
                {untranscribedCount} untranscribed vlog{untranscribedCount === 1 ? '' : 's'} will
                run the full pipeline (FFmpeg audio extract → Whisper transcribe → LLM extract),
                gated through FFmpegGate (max 3 concurrent) and LlamaGate (max 3 concurrent).
                Wall-clock estimate: ~{Math.ceil(untranscribedCount / 3)} min for FFmpeg,
                + ~{Math.ceil(untranscribedCount / 3 / 6)} min for LLM. Transcribed vlogs
                skip straight to the LLM step.
              </div>
            )}

            {ids.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
                Sample: <span className="mono">{ids.slice(0, 3).map(s => s.slice(-6)).join(', ')}{ids.length > 3 ? `, +${ids.length - 3} more` : ''}</span>
              </div>
            )}

            {ids.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>
                No vlogs to dispatch in this scope.
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.5 }}>
                Chunks of <b>{chunkSize}</b> with <b>{pauseMs}ms</b> pause between.
                Estimated dispatch time (modal closes once all are dispatched; actual completion runs in the background): {estDurationLabel(ids.length, untranscribedCount, transcribedCount)}.
                You can cancel any time without losing progress so far.
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn ghost" onClick={reset}>Back</button>
              <button className="btn ghost" onClick={onClose}>Close</button>
              <button className="btn primary" disabled={ids.length === 0} onClick={() => start(processed > 0)}>
                {processed > 0 ? `Resume (${processed}/${ids.length} done)` : `Run · ${ids.length} vlogs`}
              </button>
            </div>
          </>
        )}

        {(phase === 'running' || phase === 'done') && (
          <>
            <ProgressBar processed={processed} total={ids.length} />

            {phase === 'running' && (
              <div style={{
                fontSize: 12, color: 'var(--fg-2)', padding: 10,
                background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 6,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <span style={{
                  display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent)', animation: 'pulse 1.5s infinite',
                }}/>
                <span>Dispatching in chunks of {CHUNK_SIZE} · refresh the corpus diagnostic above to see actual completion</span>
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, fontSize: 12 }}>
              <Stat label="Dispatched" value={dispatched} tone="ok" />
              <Stat label="Skipped" value={skipped} tone="mute" />
              <Stat label="Failed" value={failed} tone={failed > 0 ? 'err' : 'mute'} />
              <Stat label="Remaining" value={remaining} />
            </div>

            {failures.length > 0 && (
              <details style={{ fontSize: 12 }}>
                <summary style={{ cursor: 'pointer', color: 'var(--fg-2)' }}>
                  {failures.length} non-success {failures.length === 1 ? 'row' : 'rows'} · click to expand
                </summary>
                <div style={{
                  marginTop: 8, maxHeight: 200, overflow: 'auto',
                  border: '1px solid var(--line)', borderRadius: 6,
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                }}>
                  {failures.slice(0, 100).map((f, i) => (
                    <div key={i} style={{
                      padding: '6px 10px',
                      borderBottom: '1px solid var(--line)',
                      color: f.reason ? 'var(--fg-3)' : 'var(--err)',
                      display: 'flex', gap: 10, alignItems: 'baseline',
                    }}>
                      <Link href={`/timeline/${f.vlog_id}`} style={{ color: 'inherit' }}>
                        …{f.vlog_id.slice(-10)}
                      </Link>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {f.error}
                      </span>
                    </div>
                  ))}
                  {failures.length > 100 && (
                    <div style={{ padding: '6px 10px', color: 'var(--fg-4)' }}>
                      + {failures.length - 100} more…
                    </div>
                  )}
                </div>
              </details>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {phase === 'running' && (
                <button className="btn ghost" onClick={cancel}>Cancel</button>
              )}
              {phase === 'done' && (
                <>
                  <button className="btn ghost" onClick={reset}>Start over</button>
                  <button className="btn primary" onClick={() => { clearCheckpoint(); onClose() }}>Close</button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

function estDurationLabel(
  total: number,
  _untranscribed: number = 0,
  _transcribed: number = 0,
): string {
  // Dispatch time (not completion time). Each chunk POST takes maybe
  // 1-3 seconds + CHUNK_PAUSE_MS pause. For 233 vlogs at chunk 6 with
  // 1s pause: ~40 chunks × 2s + 1s pause = ~2 min to dispatch them all.
  // Background completion takes much longer — that shows in diagnostic.
  const chunks = Math.ceil(total / CHUNK_SIZE)
  const ms = chunks * (2000 + CHUNK_PAUSE_MS)
  if (ms < 60_000) return `~${Math.round(ms / 1000)}s`
  const m = Math.round(ms / 60_000)
  if (m < 60) return `~${m} min`
  const h = Math.floor(m / 60); const remM = m % 60
  return `~${h}h ${remM}m`
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: 'ok' | 'err' | 'mute' }) {
  const color = tone === 'ok' ? 'var(--ok)' : tone === 'err' ? 'var(--err)' : tone === 'mute' ? 'var(--fg-3)' : 'var(--fg)'
  return (
    <div style={{
      background: 'var(--bg-1)', border: '1px solid var(--line)',
      borderRadius: 6, padding: '8px 10px',
    }}>
      <div className="mono" style={{ fontSize: 9, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
        {label}
      </div>
      <div style={{ fontSize: 16, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function DiagnosticPanel({
  diag, loading, error, onRefresh,
  onResetStuck, resetBusy, resetResult,
  onKillAll, killBusy, killResult,
}: {
  diag: any | null
  loading: boolean
  error: string | null
  onRefresh: () => void
  onResetStuck: () => void
  resetBusy: boolean
  resetResult: string | null
  onKillAll: () => void
  killBusy: boolean
  killResult: string | null
}) {
  if (loading && !diag) {
    return (
      <div className="card" style={{ padding: 12, fontSize: 12, color: 'var(--fg-3)' }}>
        Loading corpus diagnostic…
      </div>
    )
  }
  if (error && !diag) {
    return (
      <div className="card" style={{ padding: 12, fontSize: 12, color: 'var(--err)' }}>
        Diagnostic failed: {error}
        <button className="btn ghost small" onClick={onRefresh} style={{ marginLeft: 8 }}>Retry</button>
      </div>
    )
  }
  if (!diag) return null

  const status = diag.by_status ?? {}
  const stuck = status.stuck_in_flight ?? 0
  const inFlightRecent = status.in_flight_recent ?? 0
  const cost = diag.estimated_costs?.to_complete_corpus_usd ?? 0

  return (
    <div className="card" style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Corpus state · {diag.total ?? 0} vlogs
        </span>
        <button className="btn ghost small" onClick={onRefresh} style={{ marginLeft: 'auto' }}>
          Refresh
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, fontSize: 12 }}>
        <Stat label="Complete + data" value={status.complete_with_data ?? 0} tone="ok" />
        <Stat label="Complete + no data" value={status.complete_no_data ?? 0} tone={status.complete_no_data ? 'err' : 'mute'} />
        <Stat label="Transcribed only" value={status.transcribed_only ?? 0} />
        <Stat label="Untranscribed" value={status.untranscribed ?? 0} />
        <Stat label="Stuck > 5 min" value={stuck} tone={stuck > 0 ? 'err' : 'mute'} />
        <Stat label="Failed" value={status.failed ?? 0} tone={status.failed ? 'err' : 'mute'} />
      </div>
      {inFlightRecent > 0 && (
        <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
          {inFlightRecent} vlog{inFlightRecent === 1 ? '' : 's'} actively processing (started within 5 min) — not stuck.
        </div>
      )}

      {/* Kill button always available — useful even when nothing is "stuck"
          because zombies might be running with recent updated_at timestamps. */}
      <div style={{
        padding: 10, borderRadius: 6,
        background: 'var(--bg-1)', border: '1px solid var(--err-bd, var(--line))',
        fontSize: 12, color: 'var(--fg-1)',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {stuck > 0 && (
          <div>
            <div style={{ marginBottom: 6 }}>
              <b>{stuck}</b> vlog{stuck === 1 ? '' : 's'} stuck from a prior failed run.
              Reset their pipeline_status so they're re-runnable. Free — only D1 updates.
              Does NOT stop the actual background workflows.
            </div>
            <button className="btn" onClick={onResetStuck} disabled={resetBusy}>
              {resetBusy ? 'Resetting…' : `Reset ${stuck} stuck (D1 only)`}
            </button>
            {resetResult && (
              <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-2)' }}>{resetResult}</div>
            )}
          </div>
        )}
        <div>
          <div style={{ marginBottom: 6 }}>
            <b>Kill all running.</b> Hard-stop every active Cloudflare Workflow
            instance + Durable Object for your operator. Use this when zombie
            workflows from a prior bulk are still spamming failures. Counts as
            compute used but stops further work immediately.
          </div>
          <button className="btn" onClick={onKillAll} disabled={killBusy}
            style={{ background: 'var(--err)', color: 'white', borderColor: 'var(--err)' }}>
            {killBusy ? 'Killing…' : 'Kill all running'}
          </button>
          {killResult && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fg-2)' }}>{killResult}</div>
          )}
        </div>
        <BindingsCheck />
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)' }}>
        To bring the whole corpus to complete + data: ~${cost.toFixed(2)} estimated cost.
      </div>
    </div>
  )
}

function BindingsCheck() {
  const [data, setData] = useState<any | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const run = async () => {
    setLoading(true); setErr(null)
    try {
      const r = await fetch('/api/v2/admin/bindings-check', { credentials: 'include' })
      if (!r.ok) {
        setErr(`HTTP ${r.status}`)
        return
      }
      setData(await r.json())
    } catch (e: any) {
      setErr(e?.message || String(e))
    } finally {
      setLoading(false)
    }
  }
  return (
    <div style={{ fontSize: 11, color: 'var(--fg-3)', borderTop: '1px solid var(--line)', paddingTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span>Binding sanity check (use this if bulk Run returns "chunk request failed"):</span>
        <button className="btn ghost small" onClick={run} disabled={loading} style={{ marginLeft: 'auto' }}>
          {loading ? 'Checking…' : 'Check now'}
        </button>
      </div>
      {err && <div style={{ color: 'var(--err)' }}>Error: {err}</div>}
      {data && (
        <div style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
          padding: 8, background: 'var(--bg-2)', borderRadius: 4,
          whiteSpace: 'pre-wrap',
        }}>
          {`ready_for.bulk_dispatch:       ${data.ready_for?.bulk_dispatch ? '✅' : '❌ (PIPELINE + HEARTBEAT_TOKEN required)'}
ready_for.terminate_workflows: ${data.ready_for?.terminate_workflows ? '✅' : '❌ (CLOUDFLARE_API_TOKEN + ACCOUNT_ID required)'}
ready_for.terminate_dos:       ${data.ready_for?.terminate_dos ? '✅' : '❌'}
pipeline_probe:                ${data.pipeline_probe?.reachable ? `reachable (status ${data.pipeline_probe.status})` : `❌ ${data.pipeline_probe?.error || 'unreachable'}`}

services:  PIPELINE=${data.services?.PIPELINE} PROCESS_UPLOAD=${data.services?.PROCESS_UPLOAD} DB=${data.services?.DB}
secrets:   HEARTBEAT_TOKEN=${data.secrets?.HEARTBEAT_TOKEN} CF_API_TOKEN=${data.secrets?.CLOUDFLARE_API_TOKEN} ANTHROPIC=${data.secrets?.ANTHROPIC_API_KEY}`}
        </div>
      )}
    </div>
  )
}

function SmokeTestRow({
  diag, busy, result, onRun,
}: {
  diag: any | null
  busy: boolean
  result: { ok: boolean; vlog_id?: string; message: string } | null
  onRun: () => void
}) {
  const needsFull = diag?.counts_for_run?.needs_full_pipeline ?? 0
  const disabled = !diag || (needsFull === 0 && (diag?.counts_for_run?.needs_extract_only ?? 0) === 0) || busy
  return (
    <div className="card" style={{
      padding: 12, display: 'flex', flexDirection: 'column', gap: 8,
      background: 'var(--bg-1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Smoke test · ~$0.10
        </span>
        <button className="btn primary small" onClick={onRun} disabled={disabled} style={{ marginLeft: 'auto' }}>
          {busy ? 'Dispatching…' : 'Run on 1 vlog'}
        </button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--fg-3)', lineHeight: 1.5 }}>
        Picks one vlog from the eligible set, dispatches it through the full new gated
        pipeline as an end-to-end sanity check. Watch its detail page; if threads / clips /
        creative / entities show up, the bulk path is safe. If not, STOP — don't bulk.
      </div>
      {result && (
        <div style={{
          fontSize: 12,
          color: result.ok ? 'var(--ok)' : 'var(--err)',
          padding: 8, borderRadius: 6, background: 'var(--bg-2)',
        }}>
          {result.message}
          {result.vlog_id && (
            <Link href={`/timeline/${result.vlog_id}`} style={{ marginLeft: 8, color: 'var(--accent)' }}>
              open vlog →
            </Link>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ processed, total }: { processed: number; total: number }) {
  const pct = total > 0 ? (processed / total) * 100 : 0
  return (
    <div>
      <div style={{
        height: 8, background: 'var(--bg-2)', borderRadius: 4, overflow: 'hidden',
        border: '1px solid var(--line)',
      }}>
        <div style={{
          width: `${pct}%`, height: '100%', background: 'var(--accent)',
          transition: 'width 200ms ease-out',
        }}/>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>{processed} / {total}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>
    </div>
  )
}

async function dispatchChunkWithRetry(
  vlog_ids: string[],
  mode: 'cheap' | 'premium',
  signal: AbortSignal,
): Promise<
  | { results: { vlog_id: string; ok: boolean; backend: string; error?: string; reason?: string }[] }
  | 'aborted'
  | { kind: 'fatal'; lastError: string }
> {
  const maxAttempts = 3
  let lastError = 'unknown — request never reached the server'
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal.aborted) return 'aborted'
    try {
      const r = await fetch('/api/v2/admin/reprocess-vlogs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vlog_ids, mode, skip_in_flight: true }),
        signal,
      })
      if (r.ok) {
        const d: any = await r.json()
        return { results: d.results ?? [] }
      }
      // Capture the actual server error message for both 4xx and 5xx.
      // Previously 5xx errors were retried silently and we lost the
      // upstream error; now we keep the latest one and surface it if
      // every retry fails.
      let serverErr = `HTTP ${r.status}`
      try {
        const d: any = await r.json()
        const hint = d?.hint ? ` · ${String(d.hint).slice(0, 200)}` : ''
        const details = d?.details ? ` · ${String(d.details).slice(0, 200)}` : ''
        serverErr = `HTTP ${r.status}: ${d?.error || 'unknown'}${details}${hint}`
      } catch {
        try { serverErr = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}` } catch {}
      }
      lastError = serverErr
      // 4xx (bad request, unauth) — fatal, don't retry.
      if (r.status >= 400 && r.status < 500) {
        return { results: vlog_ids.map(id => ({ vlog_id: id, ok: false, backend: 'none', error: serverErr })) }
      }
      // 5xx — retry with backoff.
    } catch (err: any) {
      if (signal.aborted || err?.name === 'AbortError') return 'aborted'
      lastError = `network: ${err?.message || String(err)}`
    }
    if (attempt < maxAttempts) {
      await sleepWithAbort(500 * Math.pow(2, attempt - 1), signal)
      if (signal.aborted) return 'aborted'
    }
  }
  return { kind: 'fatal', lastError }
}

// Fire-and-forget chunk-of-N dispatch. The operator ranked this as
// the best approach: high visible throughput, failures don't block
// the queue, each vlog runs through its own pipeline DO in the
// background. The downstream LlamaGate (cap 8) + FFmpegGate (cap 3)
// absorb burst load so we don't overwhelm Workers AI / FFmpeg
// container even if all 6 vlogs in a chunk hit the LLM step
// simultaneously.
//
// Progress in the modal = DISPATCHED, not completed. For completion
// progress, the operator refreshes the diagnostic panel which counts
// vlogs by status across the whole corpus.
const CHUNK_SIZE = 6
const CHUNK_PAUSE_MS = 1000


function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    if (signal.aborted) return resolve()
    const t = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    const onAbort = () => { clearTimeout(t); resolve() }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function VlogCard({ v }: { v: VlogRow }) {
  const statusCls = v.pipeline_status === 'complete' ? 'ok'
    : v.pipeline_status === 'archived' ? 'mute'
    : v.pipeline_status === 'failed' ? 'err'
    : 'hot'
  const date = v.recorded_at ? new Date(v.recorded_at) : new Date(v.uploaded_at)
  const dateLabel = formatDate(date)
  const size = v.file_size_bytes ? `${(v.file_size_bytes / 1_000_000).toFixed(1)} MB` : '—'

  return (
    <Link href={`/timeline/${v.id}`} className="card no-pad" style={{ overflow: 'hidden', cursor: 'pointer', display: 'block' }}>
      <div style={{
        aspectRatio: '16/10',
        background: v.thumbnail_url
          ? `center / cover no-repeat url(${v.thumbnail_url})`
          : `linear-gradient(135deg, var(--bg-3), var(--bg-1), var(--bg-2))`,
        position: 'relative',
        borderBottom: '1px solid var(--line)',
      }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.25)' }}>
            <svg width="11" height="11" viewBox="0 0 16 16" fill="white"><polygon points="5,3 12,8 5,13"/></svg>
          </div>
        </div>
        <span className={`pill ${statusCls}`} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.5)' }}>{v.pipeline_status}</span>
      </div>
      <div style={{ padding: '11px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <TopicDot/>
          <span style={{ fontSize: 13, color: 'var(--fg)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
            {v.original_filename ?? v.id}
          </span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--fg-3)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{dateLabel} · {size}</span>
          {v.has_transcript ? <span style={{ color: 'var(--fg-2)' }}>transcribed</span> : <span>—</span>}
        </div>
      </div>
    </Link>
  )
}

function formatDate(d: Date): string {
  const now = new Date()
  const dayDiff = Math.floor((now.getTime() - d.getTime()) / 86_400_000)
  if (dayDiff === 0) return 'Today ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff === 1) return 'Yesterday ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (dayDiff < 7) return d.toLocaleDateString('en-US', { weekday: 'short' }) + ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
