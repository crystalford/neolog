/**
 * Capture — drop in vlogs (one or many). Modes: Upload (primary), Record.
 *
 * Multi-file queue:
 *   - Operator selects / drops N files at once.
 *   - Each file is pre-checked against D1 for (filename, size) dedup.
 *     Duplicates are silently SKIPPED (no error, no manual deselect).
 *   - Files upload one at a time (avoids saturating the user's uplink).
 *   - WITHIN a file, parts upload 3-at-a-time (concurrent), 50 MB each,
 *     with up-to-3 retries per part on network failure.
 *   - Per-file status: queued → checking → skipped|uploading X% → registering → done|failed
 *   - If a file fails, the queue keeps going — the other files still ship.
 *
 * Archive toggle skips auto-pipeline for the whole batch.
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Mode = 'upload' | 'record'

const PART_SIZE = 50 * 1024 * 1024 // 50 MiB — must match server /api/v2/upload/initiate
const PARTS_CONCURRENCY = 3        // parts uploaded in parallel within a file
const PART_RETRIES = 3              // network retries per part
const PART_TIMEOUT_MS = 10 * 60 * 1000  // 10 min per part — accommodates slow uplinks on huge files

type FileStatus =
  | 'queued'
  | 'checking_dup'
  | 'skipped'      // duplicate — no upload performed
  | 'initiating'
  | 'uploading'
  | 'finalizing'
  | 'registering'
  | 'done'
  | 'failed'

interface FileEntry {
  id: string           // local UI id, not D1 id
  file: File
  status: FileStatus
  progress: number     // 0..1 within the upload step
  bytes_uploaded: number
  message: string | null
  vlog_id?: string     // when status === 'done' or 'skipped' (existing)
  error?: string
}

interface ThreadPreview {
  id: string
  topic: string
  take: string | null
  vlog_id: string
}

export default function CapturePage() {
  const params = useSearchParams()
  const initialMode = (params?.get('mode') as Mode) || 'upload'
  const [mode, setMode] = useState<Mode>(initialMode === 'record' ? 'record' : 'upload')
  const [archive, setArchive] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const [recent, setRecent] = useState<ThreadPreview[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  // Cancel flag — set when the user wants to stop the queue mid-flight.
  const cancelRef = useRef(false)

  useEffect(() => {
    fetch('/api/v2/threads/recent', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then((d: any) => setRecent(d.threads || []))
      .catch(() => {})
  }, [])

  const addFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return
    setEntries(prev => [
      ...prev,
      ...list.map(f => ({
        id: `${f.name}__${f.size}__${Date.now()}__${Math.random().toString(36).slice(2, 8)}`,
        file: f,
        status: 'queued' as FileStatus,
        progress: 0,
        bytes_uploaded: 0,
        message: null,
      })),
    ])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer?.files)
  }, [addFiles])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onSelect = useCallback(() => inputRef.current?.click(), [])

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const clearDone = useCallback(() => {
    setEntries(prev => prev.filter(e => e.status !== 'done' && e.status !== 'skipped'))
  }, [])

  const startQueue = useCallback(async () => {
    if (running) return
    setRunning(true)
    cancelRef.current = false
    try {
      // Snapshot the queue at start; new files added mid-run are picked up in the next iteration.
      while (!cancelRef.current) {
        // Find the next queued entry. Read fresh from state.
        const next = await new Promise<FileEntry | null>(resolve => {
          setEntries(prev => {
            const found = prev.find(e => e.status === 'queued')
            resolve(found || null)
            return prev
          })
        })
        if (!next) break
        await processOne(next, archive, updateEntry, () => cancelRef.current)
      }
    } finally {
      setRunning(false)
    }
  }, [running, archive, updateEntry])

  const cancelQueue = useCallback(() => {
    cancelRef.current = true
  }, [])

  const totalBytes = entries.reduce((s, e) => s + e.file.size, 0)
  const uploadedBytes = entries.reduce((s, e) => {
    if (e.status === 'done' || e.status === 'skipped') return s + e.file.size
    return s + e.bytes_uploaded
  }, 0)
  const queuedCount = entries.filter(e => e.status === 'queued').length
  const doneCount = entries.filter(e => e.status === 'done').length
  const skippedCount = entries.filter(e => e.status === 'skipped').length
  const failedCount = entries.filter(e => e.status === 'failed').length

  return (
    <div className="capture-stage">
      <section className="hero" style={{ padding: '32px 0 16px' }}>
        <div className="crumb reveal d2">Drop them in</div>
        <h1 className="reveal d3">Capture</h1>
        <p className="lead reveal d4">
          One vlog or fifty. Drop them all in — duplicates skip automatically, parts upload in parallel,
          failed parts retry.
        </p>
        <div className="reveal d4" style={{ marginTop: 16 }}>
          <a href="/uploads" style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            border: '1px solid var(--line-warm)',
            borderRadius: 100,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            letterSpacing: 1.5,
            textTransform: 'uppercase',
            color: 'var(--bone-2)',
          }}>View uploads archive →</a>
        </div>
      </section>

      <div className="mode-row reveal d4">
        <button className={`mode ${mode === 'upload' ? 'active' : ''}`} onClick={() => setMode('upload')}>Upload</button>
        <button className={`mode ${mode === 'record' ? 'active' : ''}`} onClick={() => setMode('record')}>Record</button>
      </div>

      {mode === 'upload' && (
        <>
          <div
            className={`dropzone reveal d5${dragging ? ' dragging' : ''}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setDragging(false)}
            onClick={onSelect}
          >
            <input
              ref={inputRef}
              type="file"
              accept="video/*,audio/*"
              multiple
              hidden
              onChange={e => { addFiles(e.target.files); if (inputRef.current) inputRef.current.value = '' }}
            />
            {entries.length === 0 ? (
              <>
                <h3>Drop vlogs here</h3>
                <p>Or tap to pick. Select multiple at once — MP4, MOV, M4A, WAV.</p>
              </>
            ) : (
              <>
                <h3>{entries.length} file{entries.length === 1 ? '' : 's'} in queue</h3>
                <p>{(totalBytes / 1_000_000_000).toFixed(2)} GB total · tap to add more</p>
              </>
            )}
          </div>

          <div className="options-row reveal d5">
            <div className="option">
              <div>
                <div className="label">Archive mode</div>
                <div className="sub">Skips auto-transcribe + analyze for every file. Process later from vlog detail.</div>
              </div>
              <button className={`toggle ${archive ? 'on' : ''}`} onClick={() => setArchive(a => !a)} aria-pressed={archive} aria-label="Archive mode" />
            </div>
          </div>

          {entries.length > 0 && (
            <div className="reveal d5" style={{ marginTop: 18 }}>
              {/* Queue summary + actions */}
              <div style={{
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexWrap: 'wrap',
                marginBottom: 12,
                padding: '10px 14px',
                background: 'var(--ink-2)',
                border: '1px solid var(--line)',
                borderRadius: 12,
              }}>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: 'var(--bone-2)' }}>
                  {(uploadedBytes / 1_000_000_000).toFixed(2)} / {(totalBytes / 1_000_000_000).toFixed(2)} GB ·
                  <strong style={{ color: 'var(--bone)' }}> {doneCount}</strong> done ·
                  <strong style={{ color: 'var(--bone)' }}> {skippedCount}</strong> skipped ·
                  <strong style={{ color: 'var(--bone)' }}> {queuedCount}</strong> queued ·
                  {failedCount > 0 && <><strong style={{ color: 'var(--state-err)' }}> {failedCount}</strong> failed</>}
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                  {!running && queuedCount > 0 && (
                    <button onClick={startQueue} className="action-upload" style={primaryBtnStyle}>
                      Start upload · {queuedCount} file{queuedCount === 1 ? '' : 's'}
                    </button>
                  )}
                  {running && (
                    <button onClick={cancelQueue} style={secondaryBtnStyle}>
                      Stop after current
                    </button>
                  )}
                  {!running && (doneCount > 0 || skippedCount > 0) && (
                    <button onClick={clearDone} style={secondaryBtnStyle}>
                      Clear done
                    </button>
                  )}
                </div>
              </div>

              {/* Overall progress bar */}
              <div className="track" style={{ marginBottom: 12 }}>
                <div className="fill" style={{ width: `${totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0}%` }} />
              </div>

              {/* Per-file list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {entries.map(e => <FileRow key={e.id} entry={e} onRemove={removeEntry} running={running} />)}
              </div>
            </div>
          )}
        </>
      )}

      {mode === 'record' && (
        <div className="dropzone reveal d5" style={{ cursor: 'default' }}>
          <h3>Browser recording — coming next</h3>
          <p>For now, use Upload. The record mode will let you capture directly into Neolog with timer, level meter, and instant pipeline trigger.</p>
        </div>
      )}

      {recent.length > 0 && (
        <div className="active-threads reveal d6">
          <div className="kicker">Active threads</div>
          <p style={{ fontSize: 13, color: 'var(--bone-2)', marginTop: 8 }}>What's been on your mind recently — drop a vlog that adds to any of these and the system will link them.</p>
          <div className="threads-list">
            {recent.map(t => (
              <a key={t.id} href={`/thread/${t.id}`} className="thread-pill">
                <span className="dot" />
                <span className="name">{t.take || t.topic}</span>
                <span className="meta">{t.topic}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function FileRow({ entry, onRemove, running }: { entry: FileEntry; onRemove: (id: string) => void; running: boolean }) {
  const e = entry
  const sizeMb = (e.file.size / 1_000_000).toFixed(1)
  const pct = Math.round(e.progress * 100)
  const removable = e.status === 'queued' || e.status === 'failed' || e.status === 'done' || e.status === 'skipped'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 14px',
      background: e.status === 'failed' ? 'rgba(198,96,66,0.04)' : 'var(--ink-2)',
      border: `1px solid ${e.status === 'failed' ? 'var(--state-err)' : 'var(--line)'}`,
      borderRadius: 10,
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Inline progress bar background */}
      {e.status !== 'queued' && e.status !== 'skipped' && e.status !== 'done' && e.status !== 'failed' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          width: `${pct}%`,
          background: 'rgba(236,228,210,0.04)',
          pointerEvents: 'none',
          transition: 'width 0.2s',
        }} />
      )}
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          fontSize: 13,
          color: 'var(--bone-1)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {e.file.name}
        </div>
        <div style={{ fontSize: 10, color: 'var(--bone-3)', fontFamily: 'JetBrains Mono, monospace', marginTop: 2 }}>
          {sizeMb} MB · {statusLabel(e)}
        </div>
      </div>
      {e.vlog_id && (e.status === 'done' || e.status === 'skipped') && (
        <a
          href={`/timeline/${e.vlog_id}`}
          style={{
            fontSize: 10,
            color: 'var(--bone-3)',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '4px 8px',
            border: '1px solid var(--line-warm)',
            borderRadius: 100,
            textDecoration: 'none',
            position: 'relative',
          }}
        >
          Open →
        </a>
      )}
      {removable && !running && (
        <button
          onClick={() => onRemove(e.id)}
          style={{
            background: 'transparent',
            color: 'var(--bone-4)',
            cursor: 'pointer',
            fontSize: 14,
            padding: 4,
            position: 'relative',
          }}
          title="Remove from queue"
        >×</button>
      )}
    </div>
  )
}

function statusLabel(e: FileEntry): string {
  switch (e.status) {
    case 'queued':       return 'Queued'
    case 'checking_dup': return 'Checking for duplicate…'
    case 'skipped':      return 'Skipped — already uploaded'
    case 'initiating':   return 'Starting upload…'
    case 'uploading':    return `Uploading ${Math.round(e.progress * 100)}%`
    case 'finalizing':   return 'Finalizing…'
    case 'registering':  return 'Registering vlog…'
    case 'done':         return 'Done'
    case 'failed':       return `Failed: ${e.error || 'unknown error'}`
  }
}

// ─── Upload pipeline ────────────────────────────────────────────────────────

async function processOne(
  entry: FileEntry,
  archive: boolean,
  update: (id: string, patch: Partial<FileEntry>) => void,
  isCanceled: () => boolean,
): Promise<void> {
  const { file, id } = entry

  // 1. Duplicate pre-check — skip the upload+presign cycle if a row already
  // exists with the same (filename, size). Server-side check matches the
  // dedup heuristic used by /api/v2/vlogs POST.
  update(id, { status: 'checking_dup' })
  try {
    const r = await fetch(
      `/api/v2/vlogs/duplicate-check?filename=${encodeURIComponent(file.name)}&size=${file.size}`,
      { credentials: 'include' },
    )
    if (r.ok) {
      const data: any = await r.json()
      if (data.exists) {
        update(id, { status: 'skipped', vlog_id: data.existing_id, message: 'Already uploaded' })
        return
      }
    }
    // If the check fails, fall through and let the upload race; the POST
    // /vlogs at the end will catch the duplicate via 409 anyway.
  } catch { /* fall through */ }

  if (isCanceled()) {
    update(id, { status: 'queued' })
    return
  }

  // 2. Initiate multipart upload
  update(id, { status: 'initiating', progress: 0, bytes_uploaded: 0 })
  let initiate: { uploadId: string; key: string; partUrls: string[] }
  try {
    const r = await fetch('/api/v2/upload/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        fileSize: file.size,
      }),
    })
    if (!r.ok) throw new Error(`initiate ${r.status}`)
    initiate = await r.json()
  } catch (err: any) {
    update(id, { status: 'failed', error: err?.message || String(err) })
    return
  }

  if (isCanceled()) {
    update(id, { status: 'queued' })
    return
  }

  // 3. Upload parts with bounded concurrency + per-part retry.
  update(id, { status: 'uploading' })
  const totalParts = initiate.partUrls.length
  const partResults: { partNumber: number; etag: string }[] = new Array(totalParts)
  let completedParts = 0
  let completedBytes = 0
  let failedError: string | null = null

  // Simple semaphore via a running counter
  let nextPartIndex = 0
  const inFlight: Promise<void>[] = []

  const launchOne = async (): Promise<void> => {
    while (nextPartIndex < totalParts) {
      if (isCanceled() || failedError) return
      const i = nextPartIndex++
      const partNumber = i + 1
      const start = i * PART_SIZE
      const end = Math.min(start + PART_SIZE, file.size)
      const blob = file.slice(start, end)
      try {
        const etag = await uploadPartWithRetry(initiate.partUrls[i], blob, partNumber)
        partResults[i] = { partNumber, etag }
        completedParts++
        completedBytes += (end - start)
        update(id, {
          progress: completedParts / totalParts,
          bytes_uploaded: completedBytes,
        })
      } catch (err: any) {
        failedError = `part ${partNumber}: ${err?.message || String(err)}`
        return
      }
    }
  }

  for (let i = 0; i < Math.min(PARTS_CONCURRENCY, totalParts); i++) {
    inFlight.push(launchOne())
  }
  await Promise.all(inFlight)

  if (isCanceled()) {
    update(id, { status: 'queued' })
    return
  }
  if (failedError) {
    update(id, { status: 'failed', error: failedError })
    return
  }

  // 4. Complete multipart
  update(id, { status: 'finalizing' })
  try {
    const r = await fetch('/api/v2/upload/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ uploadId: initiate.uploadId, key: initiate.key, parts: partResults }),
    })
    if (!r.ok) throw new Error(`complete ${r.status}`)
  } catch (err: any) {
    update(id, { status: 'failed', error: err?.message || String(err) })
    return
  }

  // 5. Register vlog row
  update(id, { status: 'registering' })
  const recordedAt = inferDateFromFilename(file.name)
  try {
    const r = await fetch('/api/v2/vlogs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        r2_key: initiate.key,
        original_filename: file.name,
        file_size_bytes: file.size,
        mime_type: file.type || 'application/octet-stream',
        recorded_at: recordedAt,
        archive,
      }),
    })
    if (r.status === 409) {
      const dup: any = await r.json()
      update(id, { status: 'skipped', vlog_id: dup.existing_id, message: 'Already uploaded' })
      return
    }
    if (!r.ok) throw new Error(`register ${r.status}`)
    const out: any = await r.json()
    update(id, { status: 'done', vlog_id: out.id, progress: 1 })
  } catch (err: any) {
    update(id, { status: 'failed', error: err?.message || String(err) })
  }
}

async function uploadPartWithRetry(url: string, blob: Blob, partNumber: number): Promise<string> {
  let lastErr: Error | null = null
  for (let attempt = 1; attempt <= PART_RETRIES; attempt++) {
    const ctrl = new AbortController()
    const timeoutId = setTimeout(() => ctrl.abort(), PART_TIMEOUT_MS)
    try {
      const resp = await fetch(url, { method: 'PUT', body: blob, signal: ctrl.signal })
      clearTimeout(timeoutId)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const etag = resp.headers.get('ETag')?.replace(/"/g, '') || ''
      if (!etag) throw new Error('no ETag in response')
      return etag
    } catch (err: any) {
      clearTimeout(timeoutId)
      lastErr = new Error(
        err?.name === 'AbortError'
          ? `timeout (>${PART_TIMEOUT_MS / 60000}min) on attempt ${attempt}`
          : `attempt ${attempt}: ${err?.message || String(err)}`,
      )
      // Exponential backoff: 1s, 4s, 9s
      if (attempt < PART_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * attempt * 1000))
      }
    }
  }
  throw lastErr || new Error('exhausted retries')
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 100,
  border: '1px solid var(--bone-3)',
  background: 'rgba(236,228,210,0.06)',
  color: 'var(--bone)',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
}

const secondaryBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  borderRadius: 100,
  border: '1px solid var(--line-warm)',
  background: 'rgba(236,228,210,0.02)',
  color: 'var(--bone-2)',
  fontSize: 12,
  cursor: 'pointer',
}

// ─── Filename date inference ────────────────────────────────────────────────

function inferDateFromFilename(name: string): string | null {
  // Keep in sync with PATTERNS in src/lib/recorded-at.ts. The server-side
  // fallback covers any patterns the client misses, but matching here too
  // means the API can stamp recorded_at_source='pre_extracted' without an
  // extra mvhd round-trip.
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    // 14 consecutive digits — DJI Mimo (`DJI_20260401110554_0055_D.MP4`)
    [/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
    [/(\d{4})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  ]
  for (const [re, fmt] of patterns) {
    const m = name.match(re)
    if (m) {
      const dStr = fmt(m)
      const d = new Date(dStr)
      const yr = d.getUTCFullYear()
      if (!isNaN(d.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) {
        return d.toISOString()
      }
    }
  }
  return null
}
