/**
 * Capture — drop in a vlog. Modes: Upload (primary), Record (coming next).
 * Archive toggle skips auto-pipeline; useful when bulk-uploading old vlogs
 * you don't want to re-extract.
 *
 * Multipart upload direct to R2 via presigned URLs. The browser:
 *   1. POST /api/v2/upload/initiate → uploadId + key
 *   2. PUT each part to its presigned URL, collect ETags
 *   3. POST /api/v2/upload/complete → finalizes the multipart
 *   4. POST /api/v2/vlogs → registers the row + dispatches Workflow (unless archive)
 */
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type Mode = 'upload' | 'record'

const PART_SIZE = 50 * 1024 * 1024 // 50 MiB — must match server /api/v2/upload/initiate

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
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ id: string } | null>(null)
  const [recent, setRecent] = useState<ThreadPreview[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/v2/threads/recent', { credentials: 'include' })
      .then(r => r.ok ? r.json() : { threads: [] })
      .then(d => setRecent(d.threads || []))
      .catch(() => {})
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) setFile(f)
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }, [])

  const onSelect = useCallback(() => inputRef.current?.click(), [])

  const upload = useCallback(async () => {
    if (!file) return
    setError(null)
    setDone(null)
    setProgress(0)
    setStatus('Initiating upload…')

    try {
      // 1. Initiate
      const init = await fetch('/api/v2/upload/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      })
      if (!init.ok) throw new Error(`initiate failed (${init.status})`)
      const { uploadId, key, partUrls } = await init.json() as {
        uploadId: string; key: string; partUrls: string[]; totalParts: number; partSize: number
      }

      // 2. PUT each part
      setStatus('Uploading…')
      const etags: { partNumber: number; etag: string }[] = []
      for (let i = 0; i < partUrls.length; i++) {
        const partNumber = i + 1
        const start = i * PART_SIZE
        const end = Math.min(start + PART_SIZE, file.size)
        const blob = file.slice(start, end)
        const resp = await fetch(partUrls[i], { method: 'PUT', body: blob })
        if (!resp.ok) throw new Error(`part ${partNumber} failed (${resp.status})`)
        const etag = resp.headers.get('ETag')?.replace(/"/g, '') || ''
        etags.push({ partNumber, etag })
        setProgress(((i + 1) / partUrls.length) * 0.9)
      }

      // 3. Complete
      setStatus('Finalizing…')
      const complete = await fetch('/api/v2/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ uploadId, key, parts: etags }),
      })
      if (!complete.ok) throw new Error(`complete failed (${complete.status})`)

      // 4. Register the vlog row
      setStatus('Registering vlog…')
      const recordedAt = inferDateFromFilename(file.name)
      const reg = await fetch('/api/v2/vlogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          r2_key: key,
          original_filename: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          recorded_at: recordedAt,
          archive,
        }),
      })
      if (reg.status === 409) {
        const dup = await reg.json()
        setStatus(null)
        setError(`Already uploaded (existing id ${dup.existing_id})`)
        return
      }
      if (!reg.ok) throw new Error(`vlog register failed (${reg.status})`)
      const out = await reg.json() as { id: string }
      setProgress(1)
      setStatus(archive ? 'Archived — process from vlog detail when ready' : 'Pipeline dispatched')
      setDone({ id: out.id })
    } catch (err: any) {
      setError(String(err.message || err))
      setStatus(null)
    }
  }, [file, archive])

  return (
    <div className="capture-stage">
      <section className="hero" style={{ padding: '32px 0 16px' }}>
        <div className="crumb reveal d2">Drop it in</div>
        <h1 className="reveal d3">Capture</h1>
        <p className="lead reveal d4">A vlog, a B-roll clip, an attachment. The pipeline transcribes, extracts threads, finds clips, and surfaces what's worth materializing.</p>
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
              hidden
              onChange={e => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <>
                <h3>{file.name}</h3>
                <p>{(file.size / 1_000_000).toFixed(1)} MB · {file.type || 'unknown type'}</p>
                <p style={{ marginTop: 12, fontFamily: 'JetBrains Mono, monospace', fontSize: 10, letterSpacing: 1.5, color: 'var(--bone-3)' }}>
                  Tap to change
                </p>
              </>
            ) : (
              <>
                <h3>Drop a vlog here</h3>
                <p>Or tap to pick a file. MP4, MOV, M4A, WAV — anything ffmpeg understands.</p>
              </>
            )}
          </div>

          <div className="options-row reveal d5">
            <div className="option">
              <div>
                <div className="label">Archive mode</div>
                <div className="sub">Skips auto-transcribe + analyze. Process later from vlog detail.</div>
              </div>
              <button className={`toggle ${archive ? 'on' : ''}`} onClick={() => setArchive(a => !a)} aria-pressed={archive} aria-label="Archive mode" />
            </div>
          </div>

          {file && !done && (
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
              <button onClick={upload} disabled={!!status && !error} className="action-upload" style={{
                padding: '12px 24px',
                borderRadius: 100,
                border: '1px solid var(--bone-3)',
                color: 'var(--bone)',
                background: 'rgba(236,228,210,0.04)',
                fontSize: 14,
                fontWeight: 500,
                cursor: status && !error ? 'wait' : 'pointer',
                opacity: status && !error ? 0.6 : 1,
              }}>
                {status && !error ? 'Uploading…' : `Upload${archive ? ' (archive)' : ' + process'}`}
              </button>
            </div>
          )}

          {(status || error) && (
            <div className="progress-row reveal d6">
              <div className="filename">{file?.name ?? ''}</div>
              <div className="track"><div className="fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
              <div className="status-line">{error ? `Error: ${error}` : status}</div>
              {done && (
                <div style={{ marginTop: 12 }}>
                  <a href={`/timeline/${done.id}`} style={{ color: 'var(--bone)', textDecoration: 'underline' }}>
                    Open vlog →
                  </a>
                </div>
              )}
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

function inferDateFromFilename(name: string): string | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`],
    [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00Z`],
  ]
  for (const [re, fmt] of patterns) {
    const m = name.match(re)
    if (m) {
      const dStr = fmt(m)
      const d = new Date(dStr)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
  }
  return null
}
