'use client'

/**
 * CapturePanel — inline drop-and-record panel.
 *
 * Extracted from the standalone /capture page in Phase 7.5 so the
 * upload UI lives WHERE the videos already are (inside /vlogs).
 * /capture was killed; /vlogs is the single videos-and-upload surface.
 *
 * Multi-file queue:
 *   - Operator drops N files; each pre-checked against D1 for
 *     (filename, size) dedup, duplicates silently skipped.
 *   - Files upload one at a time; parts upload 3-at-a-time within a
 *     file, 50 MB each, up-to-3 retries per part on network failure.
 *   - On register, browser captures thumbnail + audio chunks for
 *     Whisper, passing the manifest to /api/v2/vlogs POST.
 *
 * Token-rebased to canon (cobalt/black, no warm bone/ink).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

const PART_SIZE = 50 * 1024 * 1024
const PARTS_CONCURRENCY = 3
const PART_RETRIES = 3
const PART_TIMEOUT_MS = 10 * 60 * 1000

type FileStatus =
  | 'queued' | 'checking_dup' | 'skipped'
  | 'initiating' | 'uploading' | 'finalizing'
  | 'registering' | 'done' | 'failed'

interface FileEntry {
  id: string
  file: File
  status: FileStatus
  progress: number
  bytes_uploaded: number
  message: string | null
  vlog_id?: string
  error?: string
  /**
   * Data URL for a client-captured thumbnail. Set as soon as the browser
   * decodes one frame of the file — usually within a second or two of being
   * added to the queue, well before upload completes. Shows immediately in
   * the row and rides along inline to /api/v2/vlogs at register time so
   * the gallery never lands without a thumb (per CLAUDE.md ⚠️ thumbnail
   * pipeline rule — fast cascade is non-negotiable).
   */
  thumbnail_data_url?: string | null
}

export interface CapturePanelProps {
  onUploaded?: () => void
  compact?: boolean
}

export function CapturePanel({ onUploaded, compact = false }: CapturePanelProps) {
  const [archive, setArchive] = useState(false)
  // Audio-only mode: extract audio in the browser as usual, but SKIP uploading
  // the video file itself. For times when the operator is on bad wifi (hotel,
  // coffee shop) and uploading 1GB+ DJI files isn't realistic. Transcription,
  // threads, extraction all still happen because they only need audio. The
  // original stays on the operator's machine; they can drop it in later from
  // a good connection (filename + size dedup attaches it).
  const [audioOnly, setAudioOnly] = useState(false)
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [dragging, setDragging] = useState(false)
  const [running, setRunning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const cancelRef = useRef(false)

  const addFiles = useCallback((files: FileList | File[] | null | undefined) => {
    if (!files) return
    const list = Array.from(files)
    if (list.length === 0) return
    const newEntries = list.map(f => ({
      id: `${f.name}__${f.size}__${Date.now()}__${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: 'queued' as FileStatus,
      progress: 0,
      bytes_uploaded: 0,
      message: null,
    }))
    setEntries(prev => [...prev, ...newEntries])
    // Kick off thumbnail capture for each in background, the moment it's
    // added to the queue. By the time upload finishes (which is the long
    // pole), the thumbnail is usually already ready and the data URL is
    // sitting on the entry waiting to ride along with /api/v2/vlogs.
    for (const e of newEntries) {
      captureThumbnail(e.file, 15000).then(dataUrl => {
        if (dataUrl) {
          setEntries(prev => prev.map(p => p.id === e.id
            ? { ...p, thumbnail_data_url: `data:image/jpeg;base64,${dataUrl}` }
            : p))
        }
      }).catch(() => {})
    }
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

  const updateEntry = useCallback((id: string, patch: Partial<FileEntry>) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e))
  }, [])

  const removeEntry = useCallback((id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id))
  }, [])

  const clearDone = useCallback(() => {
    setEntries(prev => prev.filter(e => e.status !== 'done' && e.status !== 'skipped'))
  }, [])

  const entriesRef = useRef<FileEntry[]>([])
  entriesRef.current = entries
  const getLatestEntry = useCallback((id: string) => entriesRef.current.find(e => e.id === id), [])

  const startQueue = useCallback(async () => {
    if (running) return
    setRunning(true)
    cancelRef.current = false
    try {
      while (!cancelRef.current) {
        const next = await new Promise<FileEntry | null>(resolve => {
          setEntries(prev => {
            const found = prev.find(e => e.status === 'queued')
            resolve(found || null)
            return prev
          })
        })
        if (!next) break
        await processOne(next, { archive, audioOnly }, updateEntry, () => cancelRef.current, getLatestEntry)
      }
    } finally {
      setRunning(false)
      if (onUploaded) onUploaded()
    }
  }, [running, archive, audioOnly, updateEntry, onUploaded, getLatestEntry])

  const cancelQueue = useCallback(() => { cancelRef.current = true }, [])

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
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--line-1)',
      borderRadius: 14,
      padding: compact ? 16 : 22,
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragging(false)}
        onClick={() => inputRef.current?.click()}
        style={{
          padding: compact ? '24px 20px' : '40px 24px',
          border: `2px dashed ${dragging ? 'var(--sig)' : 'var(--line-2)'}`,
          background: dragging ? 'var(--sig-soft)' : 'var(--bg-2)',
          borderRadius: 12,
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'all .15s',
        }}
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
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: compact ? 16 : 20, fontWeight: 500,
              color: 'var(--fg)', letterSpacing: '-0.3px', marginBottom: 6,
            }}>
              Drop vlogs here
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>
              Or tap to pick. Multiple at once — MP4, MOV, M4A, WAV.
            </div>
          </>
        ) : (
          <>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 16, fontWeight: 500,
              color: 'var(--fg)', letterSpacing: '-0.3px', marginBottom: 4,
            }}>
              {entries.length} file{entries.length === 1 ? '' : 's'} in queue
            </div>
            <div style={{ fontSize: 12, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)' }}>
              {(totalBytes / 1_000_000_000).toFixed(2)} GB total · tap to add more
            </div>
          </>
        )}
      </div>

      {/* Archive toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 2,
          }}>Archive mode</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
            Skip auto-extraction. Process later from the vlog page.
          </div>
        </div>
        <button
          onClick={() => setArchive(a => !a)}
          aria-pressed={archive}
          style={{
            width: 38, height: 22, borderRadius: 100,
            background: archive ? 'var(--sig)' : 'var(--bg-4)',
            border: `1px solid ${archive ? 'var(--sig)' : 'var(--line-2)'}`,
            cursor: 'pointer', position: 'relative',
            transition: 'all .15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: archive ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: archive ? '#061735' : 'var(--fg-2)',
            transition: 'left .15s',
          }}/>
        </button>
      </div>

      {/* Audio-only toggle */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px',
        background: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 8,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: 1.5,
            textTransform: 'uppercase', color: 'var(--fg-3)', marginBottom: 2,
          }}>Audio only</div>
          <div style={{ fontSize: 12, color: 'var(--fg-2)' }}>
            Extract audio in the browser, skip the video bytes. For bad wifi —
            uploads in seconds instead of GB. Drop the original later from a
            good connection to attach the video.
          </div>
        </div>
        <button
          onClick={() => setAudioOnly(a => !a)}
          aria-pressed={audioOnly}
          style={{
            width: 38, height: 22, borderRadius: 100,
            background: audioOnly ? 'var(--sig)' : 'var(--bg-4)',
            border: `1px solid ${audioOnly ? 'var(--sig)' : 'var(--line-2)'}`,
            cursor: 'pointer', position: 'relative',
            transition: 'all .15s',
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: audioOnly ? 18 : 2,
            width: 16, height: 16, borderRadius: '50%',
            background: audioOnly ? '#061735' : 'var(--fg-2)',
            transition: 'left .15s',
          }}/>
        </button>
      </div>

      {/* Queue summary + actions */}
      {entries.length > 0 && (
        <>
          <div style={{
            display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
            padding: '10px 14px',
            background: 'var(--bg-2)',
            border: '1px solid var(--line-1)',
            borderRadius: 8,
          }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-2)' }}>
              {(uploadedBytes / 1_000_000_000).toFixed(2)} / {(totalBytes / 1_000_000_000).toFixed(2)} GB ·
              <strong style={{ color: 'var(--fg)' }}> {doneCount}</strong> done ·
              <strong style={{ color: 'var(--fg)' }}> {skippedCount}</strong> skipped ·
              <strong style={{ color: 'var(--fg)' }}> {queuedCount}</strong> queued
              {failedCount > 0 && <> · <strong style={{ color: 'var(--t-terra)' }}>{failedCount} failed</strong></>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              {!running && queuedCount > 0 && (
                <button onClick={startQueue} className="canon-btn primary" style={{ fontSize: 12 }}>
                  Start · {queuedCount} file{queuedCount === 1 ? '' : 's'}
                </button>
              )}
              {running && (
                <button onClick={cancelQueue} className="canon-btn ghost" style={{ fontSize: 12 }}>Stop</button>
              )}
              {!running && (doneCount > 0 || skippedCount > 0) && (
                <button onClick={clearDone} className="canon-btn ghost" style={{ fontSize: 12 }}>Clear done</button>
              )}
            </div>
          </div>

          {/* Overall progress bar */}
          <div style={{ height: 3, background: 'var(--line-1)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              height: '100%', background: 'var(--sig)',
              boxShadow: '0 0 6px var(--sig-glow)',
              width: `${totalBytes > 0 ? (uploadedBytes / totalBytes) * 100 : 0}%`,
              transition: 'width .2s',
            }}/>
          </div>

          {/* Per-file list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 600, overflowY: 'auto' }}>
            {entries.map(e => <FileRow key={e.id} entry={e} onRemove={removeEntry} running={running}/>)}
          </div>
        </>
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
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px',
      minHeight: 52,
      flexShrink: 0,
      background: e.status === 'failed' ? 'rgba(230,99,74,0.06)' : 'var(--bg-2)',
      border: `1px solid ${e.status === 'failed' ? 'var(--t-terra)' : 'var(--line-1)'}`,
      borderRadius: 8,
      position: 'relative', overflow: 'hidden',
    }}>
      {e.status !== 'queued' && e.status !== 'skipped' && e.status !== 'done' && e.status !== 'failed' && (
        <div style={{
          position: 'absolute', inset: 0,
          width: `${pct}%`,
          background: 'var(--sig-soft)',
          pointerEvents: 'none', transition: 'width .2s',
        }}/>
      )}
      <div style={{
        width: 56, height: 32, flexShrink: 0,
        borderRadius: 4, overflow: 'hidden',
        background: 'var(--bg-3)',
        border: '1px solid var(--line-1)',
        position: 'relative',
      }}>
        {e.thumbnail_data_url ? (
          <img src={e.thumbnail_data_url} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{
          fontSize: 13, color: 'var(--fg-1)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>{e.file.name}</div>
        <div style={{ fontSize: 10.5, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
          {sizeMb} MB · {statusLabel(e)}
        </div>
      </div>
      {e.vlog_id && (e.status === 'done' || e.status === 'skipped') && (
        <a
          href={`/vlog/${e.vlog_id}`}
          style={{
            fontSize: 10, color: 'var(--fg-2)',
            fontFamily: 'var(--font-mono)', letterSpacing: 1,
            textTransform: 'uppercase',
            padding: '4px 10px',
            border: '1px solid var(--line-2)',
            borderRadius: 100,
            textDecoration: 'none', position: 'relative',
          }}
        >Open →</a>
      )}
      {removable && !running && (
        <button
          onClick={() => onRemove(e.id)}
          style={{
            background: 'transparent', color: 'var(--fg-4)',
            cursor: 'pointer', fontSize: 16, padding: 4,
            border: 'none', position: 'relative',
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
    case 'finalizing':   return e.message || 'Finalizing…'
    case 'registering':  return 'Registering vlog…'
    case 'done':         return 'Done'
    case 'failed':       return `Failed: ${e.error || 'unknown'}`
  }
}

// ─── Upload pipeline (verbatim from old /capture/page.tsx) ─────────────

async function processOne(
  entry: FileEntry,
  opts: { archive: boolean; audioOnly: boolean },
  update: (id: string, patch: Partial<FileEntry>) => void,
  isCanceled: () => boolean,
  getLatestEntry: (id: string) => FileEntry | undefined,
): Promise<void> {
  const { file, id } = entry
  const { archive, audioOnly } = opts

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
  } catch { /* fall through */ }

  if (isCanceled()) { update(id, { status: 'queued' }); return }

  update(id, { status: 'initiating', progress: 0, bytes_uploaded: 0 })
  let initiate: { uploadId: string; key: string; partUrls: string[] }
  try {
    const r = await fetch('/api/v2/upload/initiate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'application/octet-stream', fileSize: file.size }),
    })
    if (!r.ok) throw new Error(`initiate ${r.status}`)
    initiate = await r.json()
  } catch (err: any) {
    update(id, { status: 'failed', error: err?.message || String(err) })
    return
  }

  if (isCanceled()) { update(id, { status: 'queued' }); return }

  if (!audioOnly) {
    // Normal path: multipart-upload the video bytes, then complete.
    update(id, { status: 'uploading' })
    const totalParts = initiate.partUrls.length
    const partResults: { partNumber: number; etag: string }[] = new Array(totalParts)
    let completedParts = 0
    let completedBytes = 0
    let failedError: string | null = null
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
          update(id, { progress: completedParts / totalParts, bytes_uploaded: completedBytes })
        } catch (err: any) {
          failedError = `part ${partNumber}: ${err?.message || String(err)}`
          return
        }
      }
    }

    for (let i = 0; i < Math.min(PARTS_CONCURRENCY, totalParts); i++) inFlight.push(launchOne())
    await Promise.all(inFlight)

    if (isCanceled()) { update(id, { status: 'queued' }); return }
    if (failedError) { update(id, { status: 'failed', error: failedError }); return }

    update(id, { status: 'finalizing' })
    try {
      const r = await fetch('/api/v2/upload/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ uploadId: initiate.uploadId, key: initiate.key, parts: partResults }),
      })
      if (!r.ok) throw new Error(`complete ${r.status}`)
    } catch (err: any) {
      update(id, { status: 'failed', error: err?.message || String(err) })
      return
    }
  } else {
    // Audio-only: skip the multipart video upload entirely. We still keep
    // initiate.key as the per-vlog upload ULID — the audio-chunk presigner
    // uses it to derive the {operator}/uploads/{ulid}/audio/chunk_*.wav
    // paths. The video r2_key stays null on the vlog row; downstream
    // playback falls back to the stitched MP3 produced by the pipeline.
    update(id, { status: 'finalizing', message: 'audio-only: skipping video upload' })
    // Mark "progress complete" for the file-bytes meter so the UI doesn't
    // sit at 0% — none of the file bytes will be uploaded.
    update(id, { progress: 1, bytes_uploaded: file.size })
  }

  // Browser thumbnail — already captured in addFiles() and stored on the
  // entry. Read latest via getLatestEntry. Only do a last-chance capture if
  // it never landed (HEVC the browser couldn't decode, file added super
  // close to upload completion). Server-side ffmpeg cascade is the next
  // fallback after that.
  let thumbnailBase64: string | null = null
  const cached = getLatestEntry(id)?.thumbnail_data_url
  if (cached && cached.startsWith('data:image/')) {
    const i = cached.indexOf(',')
    if (i >= 0) thumbnailBase64 = cached.slice(i + 1)
  }
  if (!thumbnailBase64) {
    try { thumbnailBase64 = await captureThumbnail(file, 8000) } catch {}
  }

  // Browser audio chunks
  let audioChunksManifest: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }> | null = null
  let audioExtractError: string | null = null
  if ((file.type || '').startsWith('video/') || (file.type || '').startsWith('audio/')) {
    try {
      update(id, { status: 'finalizing', message: 'extracting audio…' })
      const { extractAudioChunks, uploadChunkToR2 } = await import('@/lib/browser-audio')
      const chunks = await extractAudioChunks(file, {
        onProgress: info => {
          if (info.phase === 'chunking' && typeof info.ratio === 'number') {
            update(id, { message: `extracting audio… ${Math.round(info.ratio * 100)}%` })
          }
        },
      })
      const manifest: Array<{ r2_key: string; start_sec: number; end_sec: number; bytes: number }> = []
      for (let i = 0; i < chunks.length; i++) {
        update(id, { message: `uploading audio chunk ${i + 1}/${chunks.length}` })
        const presign = await fetch('/api/v2/upload/audio-chunk-presign', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
          body: JSON.stringify({ key: initiate.key, chunk_index: i }),
        })
        if (!presign.ok) throw new Error(`audio presign ${presign.status}`)
        const { presigned_url, r2_key } = await presign.json() as { presigned_url: string; r2_key: string }
        await uploadChunkToR2(presigned_url, chunks[i].blob)
        manifest.push({ r2_key, start_sec: chunks[i].startSec, end_sec: chunks[i].endSec, bytes: chunks[i].bytes })
      }
      audioChunksManifest = manifest
    } catch (err: any) {
      audioExtractError = err?.message || String(err)
      update(id, { message: `audio extract skipped: ${audioExtractError}` })
    }
  }

  // Audio-only mode is a hard contract: there is NO video in R2 to fall back
  // on, so if browser audio extraction failed (HEVC the browser can't decode,
  // codec error, etc.) the pipeline has nothing to transcribe. Fail-fast
  // instead of registering a doomed row.
  if (audioOnly && (!audioChunksManifest || audioChunksManifest.length === 0)) {
    update(id, {
      status: 'failed',
      error: audioExtractError
        ? `browser couldn't extract audio: ${audioExtractError}. HEVC source? Try the normal upload from a good connection.`
        : 'no audio chunks produced. HEVC source? Try the normal upload from a good connection.',
    })
    return
  }

  update(id, { status: 'registering' })
  const recordedAt = inferDateFromFilename(file.name)
  try {
    const r = await fetch('/api/v2/vlogs', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({
        // r2_key stays the upload prefix path in both modes — audio chunks
        // live under it at /audio/chunk_*.wav whether or not the video itself
        // was uploaded. Audio-only mode is signaled by mime_type 'audio/*';
        // downstream playback/transcode code branches on that.
        r2_key: initiate.key,
        original_filename: file.name,
        // For audio-only, the source video bytes never got uploaded, so
        // file.size (the original DJI MP4 size) would be misleading.
        // Send the sum of audio chunk bytes instead.
        file_size_bytes: audioOnly && audioChunksManifest
          ? audioChunksManifest.reduce((s, c) => s + (c.bytes || 0), 0)
          : file.size,
        mime_type: audioOnly ? 'audio/mpeg' : (file.type || 'application/octet-stream'),
        recorded_at: recordedAt,
        archive,
        thumbnail_blob_base64: thumbnailBase64,
        audio_chunks_json: audioChunksManifest,
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

async function captureThumbnail(file: File, timeoutMs: number): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    let settled = false
    const video = document.createElement('video')
    const url = URL.createObjectURL(file)
    const finish = (result: string | null) => {
      if (settled) return
      settled = true
      try { URL.revokeObjectURL(url) } catch {}
      try { video.remove() } catch {}
      resolve(result)
    }
    const timer = setTimeout(() => finish(null), timeoutMs)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.style.position = 'absolute'
    video.style.left = '-99999px'
    video.src = url
    video.addEventListener('error', () => { clearTimeout(timer); finish(null) })
    video.addEventListener('loadeddata', () => {
      const dur = video.duration
      const seekTo = Math.min(Math.max(dur * 0.1, 0.5), 2.0)
      const seekHandler = () => {
        video.removeEventListener('seeked', seekHandler)
        try {
          const targetW = 320
          const ratio = video.videoWidth > 0 ? video.videoHeight / video.videoWidth : 9 / 16
          const targetH = Math.max(1, Math.round(targetW * ratio))
          const canvas = document.createElement('canvas')
          canvas.width = targetW
          canvas.height = targetH
          const ctx = canvas.getContext('2d')
          if (!ctx) { clearTimeout(timer); finish(null); return }
          ctx.drawImage(video, 0, 0, targetW, targetH)
          canvas.toBlob(blob => {
            if (!blob) { clearTimeout(timer); finish(null); return }
            const reader = new FileReader()
            reader.onload = () => {
              clearTimeout(timer)
              const result = String(reader.result || '')
              const i = result.indexOf(',')
              finish(i >= 0 ? result.slice(i + 1) : null)
            }
            reader.onerror = () => { clearTimeout(timer); finish(null) }
            reader.readAsDataURL(blob)
          }, 'image/jpeg', 0.82)
        } catch { clearTimeout(timer); finish(null) }
      }
      video.addEventListener('seeked', seekHandler)
      try { video.currentTime = seekTo } catch { clearTimeout(timer); finish(null) }
    })
    document.body.appendChild(video)
  })
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
      if (attempt < PART_RETRIES) await new Promise(r => setTimeout(r, attempt * attempt * 1000))
    }
  }
  throw lastErr || new Error('exhausted retries')
}

function inferDateFromFilename(name: string): string | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
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
      if (!isNaN(d.getTime()) && yr >= 1990 && yr <= new Date().getUTCFullYear() + 1) return d.toISOString()
    }
  }
  return null
}
