/**
 * Uploads — raw vlog gallery. Every video the operator has dropped in,
 * shown as a thumbnail grid with pipeline status badges.
 *
 * Distinct from /library (finished productions). This is the input archive;
 * Library is the output archive.
 */
'use client'

import { useEffect, useMemo, useState } from 'react'

interface UploadRow {
  id: string
  original_filename: string | null
  file_size_bytes: number | null
  mime_type: string | null
  duration_seconds: number | null
  recorded_at: string | null
  thumbnail_url: string | null
  pipeline_status: string
  uploaded_at: string
}

type Filter = 'all' | 'uploaded' | 'transcribing' | 'extracting' | 'complete' | 'archived' | 'failed'

interface ThumbRow {
  vlog_id: string
  filename: string
  status: 'queued' | 'processing' | 'done' | 'queued_for_transcode' | 'failed'
  method?: 'direct' | 'mini_transcode' | 'queued'
  thumbnail_url?: string
  error?: string
  started_at?: number
  ms?: number
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'complete', label: 'Complete' },
  { key: 'extracting', label: 'Extracting' },
  { key: 'transcribing', label: 'Transcribing' },
  { key: 'uploaded', label: 'Queued' },
  { key: 'archived', label: 'Archived' },
  { key: 'failed', label: 'Failed' },
]

export default function UploadsPage() {
  const [vlogs, setVlogs] = useState<UploadRow[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ inserted: number; skipped_existing: number; total_objects_scanned: number } | null>(null)
  const [showSupabaseForm, setShowSupabaseForm] = useState(false)
  const [supabaseUrl, setSupabaseUrl] = useState('')
  const [supabaseKey, setSupabaseKey] = useState('')
  const [thumbImporting, setThumbImporting] = useState(false)
  const [thumbResult, setThumbResult] = useState<{ imported: number; supabase_rows_scanned: number; skipped_already_set_or_no_d1_match: number; error?: string } | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [regenResult, setRegenResult] = useState<{ reset?: number; message?: string; error?: string } | null>(null)
  // Path C — batch fix-thumbnails
  const [batchRunning, setBatchRunning] = useState(false)
  const [batchStopFlag, setBatchStopFlag] = useState(false)
  const [batchCursor, setBatchCursor] = useState<string>('')
  const [batchStats, setBatchStats] = useState<{
    direct: number
    mini_transcode: number
    queued: number
    failed: number
    remaining: number | null
    lastError?: string
  } | null>(null)
  // Live per-row status for the thumbnail fix queue. Pre-populated when the
  // operator clicks "Fix all thumbnails" so they see exactly what's queued
  // and watch each row tick from queued → processing → done (with the actual
  // thumbnail rendering inline).
  const [thumbQueue, setThumbQueue] = useState<ThumbRow[] | null>(null)
  // Path A — supabase probe
  const [probing, setProbing] = useState(false)
  const [probeResult, setProbeResult] = useState<{ ok: boolean; total?: number | null; reason?: string } | null>(null)
  // Part B — backfill recorded_at
  const [backfillRunning, setBackfillRunning] = useState(false)
  const [backfillStopFlag, setBackfillStopFlag] = useState(false)
  const [backfillCursor, setBackfillCursor] = useState('')
  const [backfillStats, setBackfillStats] = useState<{
    mvhd: number
    filename: number
    upload_time_default: number
    failed: number
    remaining: number | null
    lastError?: string
  } | null>(null)

  const regenerateThumbnails = async () => {
    setRegenerating(true)
    setRegenResult(null)
    try {
      const r = await fetch('/api/v2/admin/regenerate-thumbnails', {
        method: 'POST',
        credentials: 'include',
      })
      const text = await r.text()
      let data: any
      try { data = JSON.parse(text) }
      catch { data = { error: text.slice(0, 200) } }
      if (!r.ok) {
        setRegenResult({ error: data.error || `HTTP ${r.status}` })
      } else {
        setRegenResult(data)
        load()  // Refresh tiles so reset rows flip badge immediately
      }
    } catch (e: any) {
      setRegenResult({ error: String(e.message || e) })
    } finally {
      setRegenerating(false)
    }
  }

  const load = () => {
    setLoading(true)
    fetch('/api/v2/vlogs?limit=500', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { vlogs: [] })
      .then((d: any) => { setVlogs(d.vlogs || []); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(load, [])

  const importSupabaseThumbnails = async () => {
    setThumbImporting(true)
    setThumbResult(null)
    let offset = 0
    let totalImported = 0
    let totalScanned = 0
    let totalSkipped = 0

    try {
      while (true) {
        const r = await fetch('/api/v2/admin/import-supabase-thumbnails', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ supabase_url: supabaseUrl.trim(), service_role_key: supabaseKey.trim(), offset }),
        })
        const text = await r.text()
        let data: any = null
        try { data = JSON.parse(text) }
        catch {
          setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: `Server returned non-JSON (HTTP ${r.status}) at offset ${offset}. First chars: ${text.slice(0, 160)}` })
          return
        }
        if (!r.ok) {
          setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: data?.error || `HTTP ${r.status} at offset ${offset}` })
          return
        }
        totalImported += data.imported || 0
        totalScanned += data.page_rows || 0
        totalSkipped += data.skipped_already_set || 0
        // Show interim progress
        setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped })
        if (data.done) break
        offset = data.next_offset
        if (offset > 5000) break  // safety stop
      }
      load()
    } catch (e: any) {
      setThumbResult({ imported: totalImported, supabase_rows_scanned: totalScanned, skipped_already_set_or_no_d1_match: totalSkipped, error: String(e.message || e) })
    } finally {
      setThumbImporting(false)
    }
  }

  // Build the queue from the current vlogs list (only those missing thumbs)
  // and process it in chunks of 2. Each chunk sends explicit vlog_ids so
  // the server processes them in the order the operator sees on screen.
  // Per-row state updates as results arrive — operator watches each row
  // tick from queued → processing → done with the actual thumbnail rendered
  // inline.
  const runBatch = async (resume: boolean = false) => {
    if (batchRunning) return
    setBatchRunning(true)
    setBatchStopFlag(false)

    // Pre-build the queue from current vlogs state. Filter to those missing
    // thumbnails AND not already in a non-queued state from a previous run.
    const candidates = vlogs.filter(v => !v.thumbnail_url)
    const queue: ThumbRow[] = (resume && thumbQueue)
      ? thumbQueue.map(r => r.status === 'failed' ? { ...r, status: 'queued' as const } : r)
      : candidates.map(v => ({
          vlog_id: v.id,
          filename: v.original_filename || '(untitled)',
          status: 'queued' as const,
        }))

    if (queue.length === 0) {
      setBatchRunning(false)
      return
    }
    setThumbQueue(queue)
    setBatchStats({ direct: 0, mini_transcode: 0, queued: 0, failed: 0, remaining: queue.length })

    const CHUNK = 2
    let direct = 0, miniTranscode = 0, queuedDispatched = 0, failed = 0
    // Mutable local copy so we can update as we go
    const localQueue = [...queue]

    try {
      for (let i = 0; i < localQueue.length; i += CHUNK) {
        if (batchStopFlag) break
        // Find the next batch of still-queued rows
        const batch = localQueue.slice(i, i + CHUNK).filter(r => r.status === 'queued')
        if (batch.length === 0) continue
        const ids = batch.map(r => r.vlog_id)

        // Mark them as processing in the UI
        for (const r of batch) r.status = 'processing'
        for (const r of batch) r.started_at = Date.now()
        setThumbQueue([...localQueue])

        // Send the chunk
        let data: any = null
        try {
          const r = await fetch('/api/v2/admin/fix-thumbnails-batch', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vlog_ids: ids, chunk_size: CHUNK }),
          })
          const text = await r.text()
          try { data = JSON.parse(text) } catch {
            setBatchStats(prev => prev && { ...prev, lastError: `Non-JSON HTTP ${r.status}: ${text.slice(0, 160)}` })
            // Roll back — mark these as failed
            for (const row of batch) {
              row.status = 'failed'
              row.error = `chunk failed (HTTP ${r.status})`
              row.ms = Date.now() - (row.started_at ?? Date.now())
            }
            setThumbQueue([...localQueue])
            failed += batch.length
            setBatchStats(prev => prev && { ...prev, failed, remaining: localQueue.filter(x => x.status === 'queued' || x.status === 'processing').length })
            continue
          }
          if (!r.ok) {
            for (const row of batch) {
              row.status = 'failed'
              row.error = data?.error || `HTTP ${r.status}`
              row.ms = Date.now() - (row.started_at ?? Date.now())
            }
            setThumbQueue([...localQueue])
            failed += batch.length
            setBatchStats(prev => prev && { ...prev, failed, lastError: data?.error || `HTTP ${r.status}` })
            continue
          }
        } catch (err: any) {
          for (const row of batch) {
            row.status = 'failed'
            row.error = err?.message || String(err)
            row.ms = Date.now() - (row.started_at ?? Date.now())
          }
          setThumbQueue([...localQueue])
          failed += batch.length
          continue
        }

        // Apply per-row results
        for (const p of (data.processed as any[]) || []) {
          const row = localQueue.find(r => r.vlog_id === p.vlog_id)
          if (!row) continue
          row.ms = Date.now() - (row.started_at ?? Date.now())
          if (p.method === 'direct' || p.method === 'mini_transcode') {
            row.status = 'done'
            row.method = p.method
            row.thumbnail_url = p.thumbnail_url
            if (p.method === 'direct') direct++; else miniTranscode++
          } else if (p.method === 'queued') {
            row.status = 'queued_for_transcode'
            row.method = 'queued'
            row.error = p.error  // diagnostic: WHY did the fast tiers fail?
            queuedDispatched++
          } else {
            row.status = 'failed'
            row.error = p.error || 'unknown'
            failed++
          }
        }
        setThumbQueue([...localQueue])
        const remaining = localQueue.filter(r => r.status === 'queued' || r.status === 'processing').length
        setBatchStats({ direct, mini_transcode: miniTranscode, queued: queuedDispatched, failed, remaining })
      }
      // Refresh the master vlog list so /uploads tiles also pick up new thumbs
      load()
    } catch (e: any) {
      setBatchStats(prev => prev && { ...prev, lastError: String(e?.message || e) })
    } finally {
      setBatchRunning(false)
    }
  }

  // Part B — backfill recorded_at via mvhd for archived vlogs that imported
  // with no date (or upload_time_default fallback).
  const runBackfill = async (resume: boolean = false) => {
    if (backfillRunning) return
    setBackfillRunning(true)
    setBackfillStopFlag(false)
    if (!resume) {
      setBackfillCursor('')
      setBackfillStats({ mvhd: 0, filename: 0, upload_time_default: 0, failed: 0, remaining: null })
    }
    let cursor = resume ? backfillCursor : ''
    let mvhd = backfillStats?.mvhd ?? 0
    let filename = backfillStats?.filename ?? 0
    let uploadDefault = backfillStats?.upload_time_default ?? 0
    let failed = backfillStats?.failed ?? 0
    try {
      for (let i = 0; i < 500; i++) {
        if (backfillStopFlag) break
        const r = await fetch('/api/v2/admin/backfill-recorded-at', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor, chunk_size: 5 }),
        })
        const text = await r.text()
        let data: any
        try { data = JSON.parse(text) } catch {
          setBackfillStats({ mvhd, filename, upload_time_default: uploadDefault, failed, remaining: null, lastError: `Server returned non-JSON (HTTP ${r.status}): ${text.slice(0, 160)}` })
          break
        }
        if (!r.ok) {
          setBackfillStats({ mvhd, filename, upload_time_default: uploadDefault, failed, remaining: null, lastError: data?.error || `HTTP ${r.status}` })
          break
        }
        for (const p of (data.processed as any[]) || []) {
          if (p.source === 'mvhd') mvhd++
          else if (p.source === 'filename') filename++
          else if (p.source === 'upload_time_default') uploadDefault++
          else if (!p.ok) failed++
        }
        setBackfillStats({ mvhd, filename, upload_time_default: uploadDefault, failed, remaining: data.remaining ?? null })
        if (data.done || !data.next_cursor) {
          setBackfillCursor('')
          break
        }
        cursor = data.next_cursor
        setBackfillCursor(cursor)
      }
      load()
    } catch (e: any) {
      setBackfillStats({ mvhd, filename, upload_time_default: uploadDefault, failed, remaining: null, lastError: String(e?.message || e) })
    } finally {
      setBackfillRunning(false)
    }
  }

  // Path A — pre-flight probe before kicking off the import loop. Validates
  // URL + key in one fast HEAD-style request so the operator gets a clean
  // reason (or a row count) immediately instead of opaque retries.
  const probeSupabase = async () => {
    if (!supabaseUrl.trim() || !supabaseKey.trim()) return
    setProbing(true)
    setProbeResult(null)
    try {
      const r = await fetch('/api/v2/admin/import-supabase-thumbnails?mode=probe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supabase_url: supabaseUrl.trim(), service_role_key: supabaseKey.trim() }),
      })
      const data: any = await r.json().catch(() => ({}))
      if (r.ok && data.ok) {
        setProbeResult({ ok: true, total: data.total })
      } else {
        setProbeResult({ ok: false, reason: data.error || data.reason || `HTTP ${r.status}` })
      }
    } catch (e: any) {
      setProbeResult({ ok: false, reason: String(e?.message || e) })
    } finally {
      setProbing(false)
    }
  }

  const importFromR2 = async () => {
    setImporting(true)
    setImportResult(null)
    try {
      const r = await fetch('/api/v2/admin/import-r2', { method: 'POST', credentials: 'include' })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data: any = await r.json()
      setImportResult(data)
      load()
    } catch (e: any) {
      setImportResult({ inserted: -1, skipped_existing: 0, total_objects_scanned: 0 })
    } finally {
      setImporting(false)
    }
  }

  const filtered = useMemo(() => {
    if (filter === 'all') return vlogs
    return vlogs.filter(v => v.pipeline_status === filter)
  }, [vlogs, filter])

  const totalBytes = vlogs.reduce((s, v) => s + (v.file_size_bytes ?? 0), 0)
  const totalGb = (totalBytes / 1_000_000_000).toFixed(2)
  const missingThumbs = vlogs.filter(v => !v.thumbnail_url).length

  return (
    <main>
      <section className="hero" style={{ paddingBottom: 8 }}>
        <div className="crumb reveal d2">Raw archive</div>
        <h1 className="reveal d3">Uploads</h1>
        <p className="lead reveal d4">Every vlog you've dropped in. Thumbnails come from the locked transcode-then-extract step; status reflects where the pipeline is.</p>
      </section>

      <div className="gallery-summary reveal d4">
        <span><span className="n">{vlogs.length}</span> vlogs</span>
        <span><span className="n">{totalGb}</span> GB in R2</span>
        <span><span className="n">{vlogs.filter(v => v.pipeline_status === 'complete').length}</span> complete</span>
        <span><span className="n">{vlogs.filter(v => v.pipeline_status === 'archived').length}</span> archived</span>
        <button
          onClick={importFromR2}
          disabled={importing}
          style={adminPillStyle(importing)}
        >
          {importing ? 'Scanning R2…' : 'Import from R2'}
        </button>
        <button
          onClick={regenerateThumbnails}
          disabled={regenerating}
          style={adminPillStyle(regenerating)}
          title="Resets rows stuck on 'transcoding' back to 'archived'. The in-flight workflows continue on Cloudflare's side."
        >
          {regenerating ? 'Resetting…' : 'Reset stuck transcoding rows'}
        </button>
        <button
          onClick={() => runBatch(false)}
          disabled={batchRunning || missingThumbs === 0}
          style={adminPillStyle(batchRunning)}
          title="Generate thumbnails directly from R2 videos using FFmpeg. H.264 done in ~2s each; HEVC dispatched to background workflow."
        >
          {batchRunning ? 'Fixing thumbnails…' : `Fix all thumbnails (${missingThumbs})`}
        </button>
        {batchRunning && (
          <button
            onClick={() => setBatchStopFlag(true)}
            style={adminPillStyle(false)}
            title="Stop after current chunk completes."
          >
            Stop
          </button>
        )}
        {!batchRunning && batchCursor && (
          <button
            onClick={() => runBatch(true)}
            style={adminPillStyle(false)}
            title="Resume from where the batch stopped."
          >
            Continue
          </button>
        )}
        <button
          onClick={() => runBackfill(false)}
          disabled={backfillRunning}
          style={adminPillStyle(backfillRunning)}
          title="For archived vlogs whose filename had no date, read the MP4 mvhd atom (first 2 MB) to find the real recording date. Vlogs move to their correct timeline position."
        >
          {backfillRunning ? 'Backfilling dates…' : 'Backfill recorded dates'}
        </button>
        {backfillRunning && (
          <button onClick={() => setBackfillStopFlag(true)} style={adminPillStyle(false)}>
            Stop
          </button>
        )}
        {!backfillRunning && backfillCursor && (
          <button onClick={() => runBackfill(true)} style={adminPillStyle(false)}>
            Continue
          </button>
        )}
        <button
          onClick={() => setShowSupabaseForm(s => !s)}
          style={adminPillStyle(false)}
          title="Last-try recovery of legacy thumbnails from the old Supabase project (if you still have the credentials)."
        >
          {showSupabaseForm ? 'Hide Supabase' : 'Pull from Supabase'}
        </button>
      </div>

      {backfillStats && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: backfillStats.lastError ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${backfillStats.lastError ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {backfillStats.lastError ? (
            <>Backfill error: {backfillStats.lastError}</>
          ) : (
            <>
              mvhd: <strong>{backfillStats.mvhd}</strong> ·
              filename: <strong>{backfillStats.filename}</strong> ·
              upload-time-default: <strong>{backfillStats.upload_time_default}</strong> ·
              Failed: <strong>{backfillStats.failed}</strong>
              {backfillStats.remaining != null && <> · Remaining: <strong>{backfillStats.remaining}</strong></>}
              {backfillRunning && <> · running…</>}
              {!backfillRunning && backfillCursor && <> · paused (Continue to resume)</>}
              {!backfillRunning && !backfillCursor && (backfillStats.mvhd + backfillStats.filename + backfillStats.upload_time_default) > 0 && <> · done</>}
            </>
          )}
        </div>
      )}

      {batchStats && thumbQueue && thumbQueue.length > 0 && (
        <div className="reveal d4" style={{ margin: '0 24px 16px' }}>
          {/* Summary header */}
          <div style={{
            padding: '12px 16px',
            background: batchStats.lastError ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
            border: `1px solid ${batchStats.lastError ? 'var(--state-err)' : 'var(--line)'}`,
            borderRadius: '12px 12px 0 0',
            borderBottom: 'none',
            fontSize: 13,
            color: 'var(--bone-1)',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}>
            <strong>Fixing thumbnails</strong>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--bone-2)' }}>
              {batchStats.direct + batchStats.mini_transcode + batchStats.queued + batchStats.failed} / {thumbQueue.length}
            </span>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--bone-3)', letterSpacing: 1 }}>
              · {batchStats.direct} DIRECT · {batchStats.mini_transcode} MINI · {batchStats.queued} QUEUED · {batchStats.failed} FAILED
            </span>
            {batchRunning && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--state-info, #6b9aa9)' }}>running…</span>}
            {!batchRunning && batchStats.remaining === 0 && <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--state-ok, #7a9a6a)' }}>complete</span>}
          </div>
          {/* Progress bar */}
          <div style={{
            height: 4,
            background: 'var(--ink-1)',
            borderLeft: '1px solid var(--line)',
            borderRight: '1px solid var(--line)',
          }}>
            <div style={{
              height: '100%',
              width: `${(((batchStats.direct + batchStats.mini_transcode + batchStats.queued + batchStats.failed) / thumbQueue.length) * 100).toFixed(1)}%`,
              background: 'var(--bone-3)',
              transition: 'width 0.3s',
            }} />
          </div>
          {/* Per-row queue list */}
          <div style={{
            maxHeight: 360,
            overflowY: 'auto',
            background: 'var(--ink-2)',
            border: `1px solid ${batchStats.lastError ? 'var(--state-err)' : 'var(--line)'}`,
            borderTop: 'none',
            borderRadius: '0 0 12px 12px',
          }}>
            {thumbQueue.map(row => <ThumbQueueRow key={row.vlog_id} row={row} />)}
          </div>
          {batchStats.lastError && (
            <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--state-err)', fontFamily: 'JetBrains Mono, monospace' }}>
              {batchStats.lastError}
            </div>
          )}
        </div>
      )}

      {regenResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: regenResult.error ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${regenResult.error ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {regenResult.error ? <>Failed: {regenResult.error}</> : <>{regenResult.message}</>}
        </div>
      )}

      {showSupabaseForm && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '16px 18px',
          background: 'var(--ink-2)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 13, color: 'var(--bone-1)', lineHeight: 1.55 }}>
            Paste your <strong style={{ color: 'var(--bone)' }}>paused Supabase</strong> credentials. We'll read
            the old <code style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 12, color: 'var(--bone)' }}>video_uploads.thumbnail_url</code> column and copy each thumbnail into the matching D1 vlog by R2 key. Read-only on Supabase — nothing is written there.
          </div>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bone-3)' }}>Project URL</span>
            <input
              type="text"
              placeholder="https://abcdefghij.supabase.co"
              value={supabaseUrl}
              onChange={e => setSupabaseUrl(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: 'var(--bone-4)' }}>Dashboard → Project → Settings → API → "Project URL"</span>
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--bone-3)' }}>service_role key</span>
            <input
              type="password"
              placeholder="eyJhbGciOiJIUzI1NiIs… (long JWT, not your login password)"
              value={supabaseKey}
              onChange={e => setSupabaseKey(e.target.value)}
              style={inputStyle}
            />
            <span style={{ fontSize: 11, color: 'var(--bone-4)' }}>Same page → Project API keys → row labeled <strong style={{ color: 'var(--bone-2)' }}>service_role</strong> → Reveal</span>
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={probeSupabase}
              disabled={!supabaseUrl.trim() || !supabaseKey.trim() || probing || thumbImporting}
              style={{
                padding: '10px 18px',
                border: '1px solid var(--line-warm)',
                background: 'rgba(236,228,210,0.02)',
                color: 'var(--bone-1)',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 500,
                cursor: probing ? 'wait' : 'pointer',
              }}>{probing ? 'Probing…' : '1. Probe'}</button>
            <button
              onClick={importSupabaseThumbnails}
              disabled={!supabaseUrl.trim() || !supabaseKey.trim() || thumbImporting || (probeResult != null && !probeResult.ok)}
              style={{
                padding: '10px 18px',
                border: '1px solid var(--bone-3)',
                background: 'rgba(236,228,210,0.04)',
                color: 'var(--bone)',
                borderRadius: 100,
                fontSize: 13,
                fontWeight: 500,
                cursor: thumbImporting ? 'wait' : 'pointer',
              }}>{thumbImporting ? 'Pulling…' : '2. Pull thumbnails'}</button>
            <span style={{ fontSize: 11, color: 'var(--bone-3)' }}>The key is never persisted — used in-memory only.</span>
          </div>
          {probeResult && (
            <div style={{
              fontSize: 12,
              color: probeResult.ok ? 'var(--bone-1)' : 'var(--state-err)',
              padding: '8px 0 0',
            }}>
              {probeResult.ok
                ? <>Connection OK{probeResult.total != null ? ` · ${probeResult.total} thumbnail rows found` : ''} — click Pull thumbnails.</>
                : <>Probe failed: {probeResult.reason}</>}
            </div>
          )}
        </div>
      )}

      {thumbResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: thumbResult.error ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${thumbResult.error ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {thumbResult.error ? (
            <>Pull failed: {thumbResult.error}</>
          ) : (
            <>
              Scanned <strong>{thumbResult.supabase_rows_scanned}</strong> Supabase rows ·
              copied <strong>{thumbResult.imported}</strong> thumbnail{thumbResult.imported === 1 ? '' : 's'} ·
              skipped <strong>{thumbResult.skipped_already_set_or_no_d1_match}</strong>.
            </>
          )}
        </div>
      )}

      {importResult && (
        <div className="reveal d4" style={{
          margin: '0 24px 16px',
          padding: '12px 16px',
          background: importResult.inserted < 0 ? 'rgba(198,96,66,0.10)' : 'var(--ink-2)',
          border: `1px solid ${importResult.inserted < 0 ? 'var(--state-err)' : 'var(--line)'}`,
          borderRadius: 12,
          fontSize: 13,
          color: 'var(--bone-1)',
        }}>
          {importResult.inserted < 0 ? (
            <>Import failed — check the worker logs.</>
          ) : (
            <>
              Scanned <strong>{importResult.total_objects_scanned}</strong> R2 objects ·
              imported <strong>{importResult.inserted}</strong> new vlog{importResult.inserted === 1 ? '' : 's'} ·
              skipped <strong>{importResult.skipped_existing}</strong> already in D1.
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--bone-3)' }}>
                All imports land as <em>archived</em> (no auto-extract). Click any vlog → Re-extract to process.
              </div>
            </>
          )}
        </div>
      )}

      <div className="filter-bar reveal d4" style={{ padding: '0 24px 16px' }}>
        {FILTERS.map(f => {
          const count = f.key === 'all' ? vlogs.length : vlogs.filter(v => v.pipeline_status === f.key).length
          return (
            <button key={f.key} className={`fchip ${filter === f.key ? 'active' : ''}`} onClick={() => setFilter(f.key)}>
              {f.label} <span className="num">{count}</span>
            </button>
          )
        })}
      </div>

      {loading && (
        <div className="empty-row reveal d5">
          <p style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 2, color: 'var(--bone-3)' }}>LOADING…</p>
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="empty-row reveal d5">
          <h3>{filter === 'all' ? 'No uploads yet' : `No ${filter} uploads`}</h3>
          <p>{filter === 'all' ? 'Tap Record or Upload below to drop in your first vlog.' : `Switch the filter to see vlogs in other states.`}</p>
        </div>
      )}

      <div className="gallery reveal d5">
        {filtered.map(v => (
          <TileVideoPoster key={v.id} v={v} />
        ))}
      </div>
    </main>
  )
}

/**
 * TileVideoPoster — single gallery tile, using an <img> for thumbnail.
 *
 * Render priority:
 *   1. thumbnail_url (server-provided: legacy data URI OR presigned R2 jpg) —
 *      rendered as <img loading="lazy">. Native browser lazy-load handles
 *      viewport visibility with zero JS — basically free per tile.
 *   2. Placeholder ("no preview") for vlogs that haven't been processed yet
 *      or that errored.
 *
 * Previous version used <video preload="metadata"> per tile for first-frame
 * poster. That approach (even with IntersectionObserver) maintains decoder
 * state, GPU, audio context per element — ~150-200ms work × 173 tiles =
 * unresponsive UI. Static <img> is what video archives have always used.
 */
function TileVideoPoster({ v }: { v: UploadRow }) {
  const [errored, setErrored] = useState(false)
  const src = !errored ? v.thumbnail_url : null
  return (
    <a href={`/timeline/${v.id}`} className="tile">
      {src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            pointerEvents: 'none',
            background: 'transparent',
          }}
        />
      ) : (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--bone-4)',
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          no preview
        </div>
      )}
      <span className={`tile-badge ${badgeKindFor(v.pipeline_status)}`}>{v.pipeline_status}</span>
      <div className="tile-foot">
        <span className="name">{deriveTitle(v.original_filename)}</span>
        {v.duration_seconds != null && <span className="dur">{fmtDur(v.duration_seconds)}</span>}
      </div>
    </a>
  )
}

function badgeKindFor(s: string): 'archived' | 'error' | 'processing' | '' {
  if (s === 'archived') return 'archived'
  if (s === 'failed') return 'error'
  if (s === 'complete') return ''
  return 'processing'
}
function fmtDur(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
function adminPillStyle(busy: boolean): React.CSSProperties {
  return {
    marginLeft: 'auto',
    padding: '6px 12px',
    border: '1px solid var(--line-bright)',
    borderRadius: 100,
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'var(--bone-1)',
    background: 'rgba(236,228,210,0.04)',
    cursor: busy ? 'wait' : 'pointer',
  }
}
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--ink-1)',
  border: '1px solid var(--line-warm)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  color: 'var(--bone)',
  fontFamily: 'JetBrains Mono, monospace',
}

function deriveTitle(filename: string | null): string {
  if (!filename) return 'Untitled'
  return filename
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled'
}

// ─── Thumbnail-fix queue row ─────────────────────────────────────────────────
function ThumbQueueRow({ row }: { row: ThumbRow }) {
  const statusColor =
    row.status === "done" ? "var(--state-ok, #7a9a6a)" :
    row.status === "failed" ? "var(--state-err)" :
    row.status === "processing" ? "var(--state-info, #6b9aa9)" :
    row.status === "queued_for_transcode" ? "var(--bone-3)" :
    "var(--bone-4)"
  const statusLabel =
    row.status === "queued" ? "queued" :
    row.status === "processing" ? "processing…" :
    row.status === "done" ? `done · ${row.method === "mini_transcode" ? "mini-transcode" : "direct"}${row.ms ? ` · ${(row.ms/1000).toFixed(1)}s` : ""}` :
    row.status === "queued_for_transcode" ? "queued for full transcode (background)" :
    `failed: ${(row.error || "unknown").slice(0, 80)}`
  // Show verbatim FFmpeg / network error in a collapsible block when we have one
  // AND the row didn't succeed via fast path. Lets the operator paste the
  // actual error string back to me instead of "it just failed".
  const hasDiagnostic = (row.status === "failed" || row.status === "queued_for_transcode") && !!row.error
  return (
    <div style={{
      borderBottom: "1px solid var(--line-dim, rgba(236,228,210,0.04))",
      background: row.status === "processing" ? "rgba(107,154,169,0.04)" : "transparent",
    }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 14px",
      }}>
        <div style={{
          width: 56, height: 32,
          background: row.thumbnail_url ? `url(${row.thumbnail_url}) center/cover` : "var(--ink-1)",
          border: "1px solid var(--line-warm)",
          borderRadius: 4,
          display: "flex", alignItems: "center", justifyContent: "center",
          flexShrink: 0,
        }}>
          {!row.thumbnail_url && (
            <span style={{
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 9,
              color: statusColor,
            }}>
              {row.status === "processing" ? "⋯" : row.status === "failed" ? "✗" : row.status === "queued_for_transcode" ? "⏳" : "·"}
            </span>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12,
            color: "var(--bone-1)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>{row.filename}</div>
          <div style={{
            fontSize: 10,
            color: statusColor,
            fontFamily: "JetBrains Mono, monospace",
            marginTop: 2,
          }}>{statusLabel}</div>
        </div>
        <a
          href={`/timeline/${row.vlog_id}`}
          style={{
            fontSize: 10,
            color: "var(--bone-3)",
            fontFamily: "JetBrains Mono, monospace",
            letterSpacing: 1,
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >Open →</a>
      </div>
      {hasDiagnostic && (
        // Auto-open so the operator sees the actual ffmpeg/network error
        // immediately, not buried behind a click.
        <details open style={{ padding: "0 14px 8px" }}>
          <summary style={{
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 9,
            color: "var(--bone-4)",
            letterSpacing: 1,
            textTransform: "uppercase",
            cursor: "pointer",
            paddingLeft: 68,
          }}>
            Diagnostic
          </summary>
          <pre style={{
            margin: "6px 0 0 68px",
            padding: "6px 8px",
            background: "var(--ink-1)",
            border: "1px solid var(--line-warm)",
            borderRadius: 4,
            fontSize: 10,
            lineHeight: 1.5,
            color: "var(--bone-2)",
            fontFamily: "JetBrains Mono, monospace",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            maxHeight: 200,
            overflow: "auto",
          }}>{row.error}</pre>
        </details>
      )}
    </div>
  )
}
