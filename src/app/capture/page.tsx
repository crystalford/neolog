/**
 * Capture — the global "record / upload" affordance.
 *
 * Per spec §4.5.8: the only entry point for new content into the graph.
 * MVP covers Upload mode (file picker / drag-drop). Record-in-app mode
 * (vlog + B-roll record) lands in a later commit.
 *
 * Flow:
 *   1. POST /api/v2/upload/initiate  -> presigned part URLs
 *   2. PUT each chunk directly to R2 (50 MB each)
 *   3. POST /api/v2/upload/complete   -> finalize multipart
 *   4. POST /api/v2/vlogs             -> register row, dispatch Workflow
 *   5. Redirect to /timeline
 *
 * Archive toggle: when on, vlogs register with pipeline_status='archived'
 * and the post-upload Workflow is NOT dispatched. Operator triggers
 * processing later from the vlog detail page.
 */

'use client'
export const runtime = 'edge'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { INK, BONE, STATE, FONT_BODY, FONT_MONO } from '@/lib/design'

interface UploadJob {
  id: string
  file: File
  status: 'pending' | 'initiating' | 'uploading' | 'completing' | 'registering' | 'done' | 'error'
  progress: number
  error?: string
  archive: boolean
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

// Best-effort recorded_at extraction from filename — backend will refine
// from the MP4 mvhd atom if not present (the LOCKED three-tier fallback).
function inferRecordedAt(name: string): string | null {
  const patterns: [RegExp, (m: RegExpMatchArray) => string][] = [
    [/DJI_(\d{4})(\d{2})(\d{2})_?(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`],
    [/IMG_(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`],
    [/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`],
    [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`],
    [/(\d{4})-(\d{2})-(\d{2})/, m => `${m[1]}-${m[2]}-${m[3]}T00:00:00`],
  ]
  for (const [regex, fmt] of patterns) {
    const m = name.match(regex)
    if (m) return fmt(m)
  }
  return null
}

function captureClientThumbnail(file: File): Promise<string | null> {
  if (!file.type.startsWith('video/')) return Promise.resolve(null)
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    const timeout = setTimeout(() => { URL.revokeObjectURL(url); resolve(null) }, 15000)
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration * 0.05)
    }
    video.onseeked = () => {
      clearTimeout(timeout)
      try {
        const canvas = document.createElement('canvas')
        const aspect = video.videoHeight > 0 ? video.videoHeight / video.videoWidth : 9 / 16
        canvas.width = 320
        canvas.height = Math.round(320 * aspect) || 180
        canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      } catch {
        URL.revokeObjectURL(url)
        resolve(null)
      }
    }
    video.onerror = () => { clearTimeout(timeout); URL.revokeObjectURL(url); resolve(null) }
    video.src = url
  })
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CapturePage() {
  const router = useRouter()
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [archiveMode, setArchiveMode] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const updateJob = useCallback((id: string, patch: Partial<UploadJob>) => {
    setJobs(prev => prev.map(j => j.id === id ? { ...j, ...patch } : j))
  }, [])

  const runUpload = useCallback(async (job: UploadJob) => {
    const abort = new AbortController()
    abortRefs.current.set(job.id, abort)
    try {
      // 1. Initiate
      updateJob(job.id, { status: 'initiating' })
      const initRes = await fetch('/api/v2/upload/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: job.file.name,
          fileSize: job.file.size,
          mimeType: job.file.type,
        }),
        signal: abort.signal,
      })
      if (!initRes.ok) throw new Error(`Initiate failed: HTTP ${initRes.status}`)
      const { uploadId, key, partUrls, totalParts, partSize } = await initRes.json()

      // 2. Upload parts
      updateJob(job.id, { status: 'uploading', progress: 5 })
      const parts: { partNumber: number; etag: string }[] = []
      for (let i = 0; i < totalParts; i++) {
        if (abort.signal.aborted) throw new Error('Aborted')
        const start = i * partSize
        const chunk = job.file.slice(start, start + partSize)
        const partRes = await fetch(partUrls[i], {
          method: 'PUT',
          body: chunk,
          signal: abort.signal,
        })
        if (!partRes.ok) throw new Error(`Part ${i + 1} failed: HTTP ${partRes.status}`)
        const etag = partRes.headers.get('ETag') ?? ''
        parts.push({ partNumber: i + 1, etag })
        updateJob(job.id, { progress: 5 + Math.round(((i + 1) / totalParts) * 80) })
      }

      // 3. Complete
      updateJob(job.id, { status: 'completing', progress: 88 })
      const completeRes = await fetch('/api/v2/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uploadId, key, parts }),
        signal: abort.signal,
      })
      if (!completeRes.ok) throw new Error(`Complete failed: HTTP ${completeRes.status}`)

      // 4. Register vlog row in D1
      updateJob(job.id, { status: 'registering', progress: 95 })
      const thumbnail = await captureClientThumbnail(job.file)
      const registerRes = await fetch('/api/v2/vlogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          r2_key: key,
          original_filename: job.file.name,
          file_size_bytes: job.file.size,
          mime_type: job.file.type,
          recorded_at: inferRecordedAt(job.file.name),
          thumbnail_url: thumbnail ?? null,
          archive: job.archive,
        }),
        signal: abort.signal,
      })
      if (!registerRes.ok) {
        const errBody = await registerRes.json().catch(() => null)
        throw new Error(errBody?.error || `Register failed: HTTP ${registerRes.status}`)
      }

      updateJob(job.id, { status: 'done', progress: 100 })
    } catch (err: any) {
      if (abort.signal.aborted) return
      updateJob(job.id, { status: 'error', error: err.message || 'Upload failed' })
    } finally {
      abortRefs.current.delete(job.id)
    }
  }, [updateJob])

  const startJobs = useCallback((files: File[]) => {
    const newJobs: UploadJob[] = files.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'pending',
      progress: 0,
      archive: archiveMode,
    }))
    setJobs(prev => [...prev, ...newJobs])
    newJobs.forEach(job => runUpload(job))
  }, [archiveMode, runUpload])

  const handleFiles = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f =>
      f.type.startsWith('video/') || f.type.startsWith('audio/'),
    )
    if (files.length) startJobs(files)
  }, [startJobs])

  // Auto-redirect once all jobs done
  useEffect(() => {
    if (jobs.length > 0 && jobs.every(j => j.status === 'done' || j.status === 'error')) {
      const allDone = jobs.every(j => j.status === 'done')
      if (allDone) {
        const t = setTimeout(() => router.push('/timeline'), 1200)
        return () => clearTimeout(t)
      }
    }
  }, [jobs, router])

  return (
    <div style={{
      minHeight: '100vh',
      background: INK.bg,
      color: BONE.bone,
      fontFamily: FONT_BODY,
      fontSize: 14,
      lineHeight: 1.5,
      padding: '24px 24px 80px',
    }}>
      <div style={{ maxWidth: 600, margin: '0 auto' }}>
        <Link
          href="/timeline"
          style={{
            display: 'inline-block',
            marginBottom: 24,
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 2,
            color: BONE.bone3,
            textTransform: 'uppercase',
            textDecoration: 'none',
          }}
        >
          ← Timeline
        </Link>

        <h1 style={{
          fontFamily: FONT_BODY,
          fontWeight: 500,
          fontSize: 22,
          color: BONE.bone,
          letterSpacing: '-0.01em',
          marginBottom: 6,
        }}>Capture</h1>
        <p style={{ fontSize: 13, color: BONE.bone2, marginBottom: 28 }}>
          Drop a vlog, voice memo, or audio file. Up to 5 GB per file, multipart upload.
        </p>

        {/* Archive toggle */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '12px 14px',
            background: archiveMode ? BONE.sigSoft : 'transparent',
            border: `1px solid ${archiveMode ? BONE.bone3 : INK.line}`,
            marginBottom: 16,
            cursor: 'pointer',
            transition: 'all 0.12s',
          }}
        >
          <input
            type="checkbox"
            checked={archiveMode}
            onChange={e => setArchiveMode(e.target.checked)}
            style={{ accentColor: BONE.bone, cursor: 'pointer' }}
          />
          <div style={{ flex: 1 }}>
            <div style={{
              fontFamily: FONT_MONO,
              fontSize: 10,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              color: archiveMode ? BONE.bone : BONE.bone2,
              marginBottom: 2,
            }}>
              Archive only
            </div>
            <div style={{ fontSize: 12, color: BONE.bone3 }}>
              Skip auto-transcribe and analyze. Process per-vlog later, on demand.
            </div>
          </div>
        </label>

        {/* Drop zone */}
        <div
          onDragOver={e => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={e => {
            e.preventDefault()
            setDragActive(false)
            handleFiles(e.dataTransfer.files)
          }}
          onClick={() => document.getElementById('file-input')?.click()}
          style={{
            border: `1px dashed ${dragActive ? BONE.bone : INK.lineBright}`,
            padding: '40px 20px',
            textAlign: 'center',
            background: dragActive ? BONE.sigSoft : 'transparent',
            cursor: 'pointer',
            transition: 'all 0.15s',
            marginBottom: 24,
          }}
        >
          <div style={{ fontSize: 24, color: BONE.bone3, marginBottom: 8 }}>↑</div>
          <div style={{ fontSize: 13, color: BONE.bone1, marginBottom: 4 }}>
            Drop files here, or click to select
          </div>
          <div style={{
            fontFamily: FONT_MONO,
            fontSize: 10,
            letterSpacing: 1.5,
            color: BONE.bone3,
            textTransform: 'uppercase',
          }}>
            MP4 · MOV · WEBM · MP3 · WAV · M4A
          </div>
        </div>
        <input
          id="file-input"
          type="file"
          multiple
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />

        {/* Active jobs */}
        {jobs.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {jobs.map(job => (
              <div
                key={job.id}
                style={{
                  padding: '10px 14px',
                  background: INK.ink,
                  border: `1px solid ${job.status === 'error' ? STATE.err : job.status === 'done' ? STATE.ok : INK.line}`,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: BONE.bone, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 360 }}>
                    {job.file.name}
                  </span>
                  <span style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 1, color: BONE.bone3, textTransform: 'uppercase' }}>
                    {job.status === 'error' ? 'ERROR' :
                      job.status === 'done' ? 'DONE' :
                      `${job.progress}%`}
                  </span>
                </div>
                {job.status === 'error' ? (
                  <div style={{ fontSize: 11, color: STATE.err }}>{job.error}</div>
                ) : (
                  <div style={{ height: 2, background: INK.ink3 }}>
                    <div style={{
                      height: '100%',
                      width: `${job.progress}%`,
                      background: job.status === 'done' ? STATE.ok : BONE.bone,
                      transition: 'width 0.25s',
                    }} />
                  </div>
                )}
                <div style={{
                  marginTop: 4,
                  fontFamily: FONT_MONO,
                  fontSize: 9,
                  letterSpacing: 1.5,
                  color: BONE.bone3,
                  textTransform: 'uppercase',
                }}>
                  {formatBytes(job.file.size)}
                  {job.archive ? ' · archive' : ''}
                  {' · '}{job.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
