'use client'

export const runtime = 'edge'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { VideoUpload } from '@/types/database'

const C = {
  bg:           '#070706',
  bgSurface:    '#0e0d0b',
  bgRaised:     '#141210',
  border:       '#1e1b16',
  borderBright: '#2c2820',
  amber:        '#C8902A',
  amberDim:     '#7a5618',
  amberBright:  '#E8A840',
  amberGlow:    'rgba(200,144,42,0.09)',
  textPrimary:  '#EDE3CC',
  textSecond:   '#9A8E78',
  textDim:      '#5A5040',
  textDimmer:   '#2e2820',
  green:        '#4A8A60',
  blue:         '#4870A8',
  red:          '#8A4040',
}

const PART_SIZE = 50 * 1024 * 1024 // 50MB — matches server

type UploadJob = {
  id: string
  file: File
  status: 'pending' | 'uploading' | 'completing' | 'done' | 'error'
  progress: number
  error?: string
}

function Tag({ children, color = C.amber }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      fontSize: 9, letterSpacing: 2, color,
      background: `${color}12`, border: `1px solid ${color}25`,
      padding: '2px 8px', borderRadius: 2,
      textTransform: 'uppercase', whiteSpace: 'nowrap', fontWeight: 500,
    }}>
      {children}
    </span>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, letterSpacing: 3, color: C.amberDim, textTransform: 'uppercase' }}>
      {children}
    </div>
  )
}

function Btn({
  children, onClick, primary, small, danger,
}: {
  children: React.ReactNode
  onClick?: () => void
  primary?: boolean
  small?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: primary ? C.amber : danger ? `${C.red}22` : 'none',
        border: `1px solid ${primary ? C.amber : danger ? C.red : C.borderBright}`,
        color: primary ? C.bg : danger ? '#cc8888' : C.textSecond,
        fontSize: small ? 9 : 10,
        letterSpacing: 2,
        fontWeight: primary ? 700 : 400,
        padding: small ? '4px 10px' : '8px 18px',
        transition: 'all 0.12s',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {children}
    </button>
  )
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatDuration(secs: number | null) {
  if (!secs) return null
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatDate(ts: string) {
  const d = new Date(ts)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return `Today · ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const PROCESSING_STATUSES = new Set([
  'uploaded', 'starting', 'extracting-audio', 'generating-thumbnail',
  'extracting-metadata', 'metadata-extracted', 'transcoding-video',
  'transcribing-media', 'transcribed-media', 'analyzing', 'processing', 'transcribing',
])

function statusColor(status: string) {
  if (status === 'processed' || status === 'ready') return C.green
  if (status === 'error') return C.red
  if (PROCESSING_STATUSES.has(status)) return C.blue
  return C.textDim
}

function statusLabel(status: string) {
  switch (status) {
    case 'processed':            return 'READY'
    case 'uploaded':             return 'QUEUED'
    case 'starting':             return 'STARTING'
    case 'extracting-audio':     return 'EXTRACTING AUDIO'
    case 'generating-thumbnail': return 'GENERATING THUMBNAIL'
    case 'extracting-metadata':  return 'READING METADATA'
    case 'metadata-extracted':   return 'TRANSCRIBING'
    case 'transcoding-video':    return 'TRANSCODING'
    case 'transcribing-media':   return 'TRANSCRIBING'
    case 'transcribed-media':    return 'ANALYZING'
    case 'analyzing-media':      return 'ANALYZING'
    case 'analyzing':            return 'ANALYZING'
    case 'processing':           return 'PROCESSING'
    case 'transcribing':         return 'TRANSCRIBING'
    case 'error':                return 'ERROR'
    default:                     return status.toUpperCase()
  }
}

function isStuck(upload: any): boolean {
  if (!upload.updated_at) return false
  const age = Date.now() - new Date(upload.updated_at).getTime()
  if (upload.status === 'uploaded') return age > 5 * 60 * 1000
  if (PROCESSING_STATUSES.has(upload.status)) return age > 20 * 60 * 1000
  return false
}

// Core multipart upload — direct browser → R2 using presigned URLs

function extractRecordedAt(file: File): string | null {
  const name = file.name
  // DJI: DJI_YYYYMMDDHHMMSS_NNNN.MP4 or DJI_YYYYMMDD_HHMMSS_NNNN.MP4
  const dji = name.match(/DJI_(\d{4})(\d{2})(\d{2})_?(\d{2})(\d{2})(\d{2})/)
  if (dji) return `${dji[1]}-${dji[2]}-${dji[3]}T${dji[4]}:${dji[5]}:${dji[6]}`
  // iPhone: IMG_YYYYMMDD_HHMMSS or IMG_YYYY-MM-DD-HH-MM-SS
  const iphone = name.match(/IMG_(\d{4})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})[-_]?(\d{2})/)
  if (iphone) return `${iphone[1]}-${iphone[2]}-${iphone[3]}T${iphone[4]}:${iphone[5]}:${iphone[6]}`
  // GoPro: GH/GX/GO YYMMDD files
  const gopro = name.match(/G[HXO]\d+_(\d{2})(\d{2})(\d{2})/)
  if (gopro) return `20${gopro[1]}-${gopro[2]}-${gopro[3]}T00:00:00`
  // ISO-like date+time: YYYY-MM-DD HH-MM-SS, YYYY-MM-DD_HH-MM-SS, YYYY-MM-DD HH:MM:SS
  const isoDateTime = name.match(/(\d{4})-(\d{2})-(\d{2})[\s_T](\d{2})[-:](\d{2})[-:](\d{2})/)
  if (isoDateTime) return `${isoDateTime[1]}-${isoDateTime[2]}-${isoDateTime[3]}T${isoDateTime[4]}:${isoDateTime[5]}:${isoDateTime[6]}`
  // Voice Memo / Recording: "Voice Memo 2026-04-27" or "Recording 2026-04-15"
  const voiceMemo = name.match(/(\d{4})-(\d{2})-(\d{2})/)
  if (voiceMemo) return `${voiceMemo[1]}-${voiceMemo[2]}-${voiceMemo[3]}T00:00:00`
  // Concatenated: YYYYMMDD_HHMMSS or YYYYMMDDHHMMSS
  const concat = name.match(/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/)
  if (concat) return `${concat[1]}-${concat[2]}-${concat[3]}T${concat[4]}:${concat[5]}:${concat[6]}`
  // No reliable filename pattern — let the backend extract from video metadata
  return null
}

// Capture a JPEG thumbnail from the video file in the browser (instant, no server round-trip).
// Returns a data: URL or null if the browser can't decode the video (e.g. HEVC on Chrome).
function captureVideoThumbnail(file: File): Promise<string | null> {
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

async function runMultipartUpload(
  file: File,
  onProgress: (pct: number) => void,
  signal: AbortSignal,
  thumbnailPromise: Promise<string | null>,
): Promise<{ key: string }> {
  // Step 1: Initiate and get presigned part URLs
  const initRes = await fetch('/api/upload/initiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
    signal,
  })
  if (!initRes.ok) {
    const body = await initRes.json().catch(() => null)
    const detail = body?.detail || body?.error || `${initRes.status}`
    throw new Error(`Initiate failed: ${detail}`)
  }
  const { uploadId, key, partUrls, totalParts } = await initRes.json()

  // Step 2: Upload each part directly to R2
  const parts: Array<{ PartNumber: number; ETag: string }> = []
  let uploadedParts = 0

  for (let i = 0; i < totalParts; i++) {
    if (signal.aborted) throw new Error('Aborted')
    const start = i * PART_SIZE
    const chunk = file.slice(start, start + PART_SIZE)
    const res = await fetch(partUrls[i], {
      method: 'PUT',
      body: chunk,
      signal,
    })
    if (!res.ok) throw new Error(`Part ${i + 1} upload failed: ${res.status}`)
    const etag = res.headers.get('ETag') ?? ''
    parts.push({ PartNumber: i + 1, ETag: etag })
    uploadedParts++
    onProgress(Math.round((uploadedParts / totalParts) * 90))
  }

  // Step 3: Complete
  const completeRes = await fetch('/api/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId, key, parts }),
    signal,
  })
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => null)
    const detail = body?.detail || body?.error || `${completeRes.status}`
    throw new Error(`Complete failed: ${detail}`)
  }
  onProgress(95)

  // Step 4: Register with Supabase + trigger Inngest pipeline
  // Thumbnail should be ready by now (captured in parallel with the upload)
  const thumbnail = await thumbnailPromise
  const regRes = await fetch('/api/video-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storage_path: key,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type,
      recorded_at: extractRecordedAt(file),
      thumbnail_url: thumbnail ?? undefined,
    }),
    signal,
  })
  if (!regRes.ok) throw new Error(`Register failed: ${regRes.status}`)
  onProgress(100)

  return { key }
}

export default function VideosPage() {
  const router = useRouter()
  const [uploads, setUploads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [jobs, setJobs] = useState<UploadJob[]>([])
  const [dragActive, setDragActive] = useState(false)
  const abortRefs = useRef<Map<string, AbortController>>(new Map())

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/video-upload')
      if (res.ok) {
        const data = await res.json()
        setUploads(data.uploads ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUploads() }, [fetchUploads])

  // Poll while any uploads are processing
  useEffect(() => {
    const hasProcessing = uploads.some(u =>
      u.status === 'uploaded' || PROCESSING_STATUSES.has(u.status)
    )
    if (!hasProcessing) return
    const t = setInterval(fetchUploads, 8000)
    return () => clearInterval(t)
  }, [uploads, fetchUploads])

  const startJobs = useCallback((files: File[]) => {
    const newJobs: UploadJob[] = files.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      status: 'pending',
      progress: 0,
    }))
    setJobs(prev => [...prev, ...newJobs])

    newJobs.forEach(job => {
      const abort = new AbortController()
      abortRefs.current.set(job.id, abort)

      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'uploading' } : j))

      // Start thumbnail capture immediately in parallel — usually finishes well before upload
      const thumbnailPromise = captureVideoThumbnail(job.file)

      runMultipartUpload(
        job.file,
        pct => setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: pct } : j)),
        abort.signal,
        thumbnailPromise,
      )
        .then(() => {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'done', progress: 100 } : j))
          fetchUploads()
        })
        .catch(err => {
          if (abort.signal.aborted) return
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: err.message } : j))
        })
        .finally(() => {
          abortRefs.current.delete(job.id)
        })
    })
  }, [fetchUploads])

  const handleFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter(f => f.type.startsWith('video/') || f.type.startsWith('audio/'))
    if (files.length) startJobs(files)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this recording?')) return
    const res = await fetch(`/api/video-upload?id=${id}`, { method: 'DELETE' })
    if (res.ok) setUploads(prev => prev.filter(u => u.id !== id))
  }

  const totalDuration = uploads.reduce((acc, u) => acc + (u.duration_seconds ?? 0), 0)
  const totalMins = Math.round(totalDuration / 60)

  const activeJobs = jobs.filter(j => j.status !== 'done')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '24px 40px 20px',
        borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Syne', sans-serif", fontSize: 20, fontWeight: 700, color: C.textPrimary }}>
            Videos
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 3, letterSpacing: 1 }}>
            {uploads.length} sessions · {totalMins} minutes total
          </div>
        </div>
        <Btn primary onClick={() => document.getElementById('file-input-main')?.click()}>
          + UPLOAD
        </Btn>
        <input
          id="file-input-main"
          type="file"
          multiple
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragActive(true) }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => document.getElementById('file-input-drop')?.click()}
        style={{
          margin: '20px 40px 0',
          border: `1px dashed ${dragActive ? C.amber : C.borderBright}`,
          padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 16,
          background: dragActive ? C.amberGlow : C.bgSurface,
          flexShrink: 0, cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <input
          id="file-input-drop"
          type="file"
          multiple
          accept="video/*,audio/*"
          style={{ display: 'none' }}
          onChange={e => e.target.files && handleFiles(e.target.files)}
        />
        <div style={{ fontSize: 18, color: C.textDim }}>↑</div>
        <div>
          <div style={{ fontSize: 12, color: C.textSecond, marginBottom: 2 }}>Drop videos here</div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>Multipart upload · up to 5 GB · MP4, MOV, WEBM</div>
        </div>
      </div>

      {/* Active upload jobs */}
      {activeJobs.length > 0 && (
        <div style={{ margin: '12px 40px 0', flexShrink: 0 }}>
          {activeJobs.map(job => (
            <div key={job.id} style={{
              padding: '10px 14px',
              background: C.bgSurface,
              border: `1px solid ${job.status === 'error' ? C.red : C.amberDim}`,
              marginBottom: 4,
              display: 'flex', alignItems: 'center', gap: 14,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.textPrimary, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.file.name}
                </div>
                {job.status === 'error' ? (
                  <div style={{ fontSize: 10, color: C.red }}>{job.error}</div>
                ) : (
                  <div style={{ height: 2, background: C.bgRaised, borderRadius: 1 }}>
                    <div style={{
                      height: '100%',
                      width: `${job.progress}%`,
                      background: C.amber,
                      borderRadius: 1,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}
              </div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, flexShrink: 0 }}>
                {job.status === 'error' ? 'ERROR' : `${job.progress}%`}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 40px 40px' }}>
        {loading ? (
          <div style={{ padding: '32px 0', fontSize: 10, color: C.textDimmer, letterSpacing: 2 }}>LOADING…</div>
        ) : uploads.length === 0 ? (
          <div style={{ padding: '48px 0', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: C.textDimmer, letterSpacing: 2 }}>NO UPLOADS YET</div>
            <div style={{ fontSize: 10, color: C.textDimmer, marginTop: 8 }}>Drop your first vlog above to start.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 12 }}>
            {uploads.map((v: any) => (
              <VideoRow
                key={v.id}
                upload={v}
                onOpenStudio={() => router.push(`/dashboard/studio?v=${v.id}`)}
                onOpenDetail={() => router.push(`/dashboard/timeline/${v.id}`)}
                onDelete={() => handleDelete(v.id)}
                onReanalyzed={fetchUploads}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VideoRow({
  upload,
  onOpenStudio,
  onOpenDetail,
  onDelete,
  onReanalyzed,
}: {
  upload: any
  onOpenStudio: () => void
  onOpenDetail: () => void
  onDelete: () => void
  onReanalyzed: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const isReady = upload.status === 'processed' || upload.status === 'ready'
  const isProcessing = PROCESSING_STATUSES.has(upload.status)
  const stuck = isStuck(upload)
  const title = upload.analysis?.title ?? upload.file_name?.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ') ?? 'Untitled'

  const showFeedback = (msg: string, ms = 5000) => {
    setFeedback(msg)
    setTimeout(() => setFeedback(null), ms)
  }

  const handleReanalyze = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setReanalyzing(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/video-upload/${upload.id}/reanalyze`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Reanalysis failed')
      showFeedback(data.message ?? 'Done')
      onReanalyzed()
    } catch (e: any) {
      showFeedback(e.message)
    } finally {
      setReanalyzing(false)
    }
  }

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setRetrying(true)
    setFeedback(null)
    try {
      const res = await fetch(`/api/video-upload/${upload.id}/retry`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Retry failed')
      showFeedback('Queued for processing')
      onReanalyzed()
    } catch (e: any) {
      showFeedback(e.message)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 18,
        padding: '14px 18px',
        background: C.bgSurface,
        border: `1px solid ${hovered ? C.borderBright : C.border}`,
        transition: 'all 0.12s',
      }}
    >
      {/* Thumbnail */}
      <div
        onClick={isReady ? onOpenDetail : undefined}
        style={{
          width: 72, height: 44, flexShrink: 0,
          background: C.bgRaised,
          border: `1px solid ${C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden',
          cursor: isReady ? 'pointer' : 'default',
        }}
      >
        {upload.thumbnail_url ? (
          <img
            src={upload.thumbnail_url}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span style={{ fontSize: 14, color: C.textDimmer }}>▶</span>
        )}
      </div>

      {/* Info */}
      <div
        onClick={isReady ? onOpenDetail : undefined}
        style={{ flex: 1, minWidth: 0, cursor: isReady ? 'pointer' : 'default' }}
      >
        <div style={{
          fontSize: 12, color: hovered && isReady ? C.amberBright : C.textPrimary, marginBottom: 3,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          transition: 'color 0.12s',
        }}>
          {title}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>
          {formatDate(upload.recorded_at ?? upload.created_at)}
          {formatDuration(upload.duration_seconds) && ` · ${formatDuration(upload.duration_seconds)}`}
          {upload.file_size_bytes && ` · ${formatBytes(upload.file_size_bytes)}`}
          {upload.analysis?.content_ideas?.length > 0 && ` · ${upload.analysis.content_ideas.length + (upload.analysis.strong_opinions?.length ?? 0)} ideas`}
        </div>
      </div>

      {/* Status + actions */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
            background: stuck ? C.amberDim : statusColor(upload.status),
            animation: isProcessing && !stuck ? 'pulse 2s ease-in-out infinite' : 'none',
            flexShrink: 0,
          }} />
          {!isReady && (
            <Tag color={stuck ? C.amberDim : statusColor(upload.status)}>
              {stuck ? 'STUCK' : statusLabel(upload.status)}
            </Tag>
          )}
          {feedback && (
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 0.5, maxWidth: 200 }}>{feedback}</div>
          )}
          {isReady && !feedback && (
            <>
              <Btn small onClick={onOpenStudio}>STUDIO</Btn>
              {hovered && (
                <Btn small onClick={handleReanalyze}>
                  {reanalyzing ? '…' : 'REANALYZE'}
                </Btn>
              )}
            </>
          )}
          {(upload.status === 'error' || stuck) && hovered && !feedback && (
            <Btn small onClick={handleRetry}>
              {retrying ? '…' : 'RETRY'}
            </Btn>
          )}
          {hovered && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              style={{
                background: 'none', border: 'none',
                color: C.textDimmer, cursor: 'pointer', fontSize: 12, padding: '2px 4px',
              }}
            >
              ✕
            </button>
          )}
        </div>
        {upload.status === 'error' && upload.error_message && (
          <div style={{ fontSize: 9, color: C.red, letterSpacing: 0.5, maxWidth: 260, textAlign: 'right' }}>
            {upload.error_message}
          </div>
        )}
      </div>
    </div>
  )
}
