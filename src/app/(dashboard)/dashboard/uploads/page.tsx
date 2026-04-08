'use client'

export const runtime = 'edge'


import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Video as VideoIcon, FileAudio, Loader2, CheckCircle2, AlertCircle,
  Clock, Trash2, ChevronDown, ChevronUp, Play, Lightbulb,
  FolderOpen, Quote, Tag, Brain, Scissors, FileText, HelpCircle,
  Target, Users, BookOpen, Zap, Shield, MessageCircle, TrendingUp,
  AlertTriangle, X, Pause, RotateCcw, Layers, Sparkles, Grid, List, 
  Search, RefreshCw, MoreVertical, Calendar, Database, Check, ExternalLink
} from 'lucide-react'
import MediaInfoFactory from 'mediainfo.js'
import type { VideoUpload } from '@/types/database'

// --- Types ---

type UploadListItem = Pick<VideoUpload,
  'id' | 'file_name' | 'file_size_bytes' | 'mime_type' | 'duration_seconds' |
  'status' | 'tags' | 'error_message' | 'source_deleted' | 'processed_at' | 'recorded_at' | 'created_at' | 'updated_at' | 'thumbnail_url' | 'storage_provider'
> & { video_url?: string | null }

export type QueueItem = {
  id: string
  fileName: string
  fileSize: number
  fileType: string
  status: 'pending' | 'checking' | 'extracting' | 'uploading' | 'completing' | 'done' | 'error' | 'skipped'
  progress: number
  thumbnail: string | null
  recordedAt: string | null
  error?: string
  r2UploadId?: string | null
  r2Key?: string | null
  retryCount?: number
}

// --- Utilities ---

async function fetchWithRetry(url: string, options: RequestInit, maxRetries = 3): Promise<Response> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      if (i > 0) await new Promise(r => setTimeout(r, Math.min(1000 * Math.pow(2, i), 10000)));
      const response = await fetch(url, options);
      if (response.ok) return response;
      if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429) return response;
      lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
    } catch (err) { lastError = err; }
  }
  throw lastError;
}

/**
 * ROBUST THUMBNAIL GENERATION
 * Probes multiple timestamps if the frame is too black (common in HEVC/DJI).
 */
async function captureVideoThumbnail(source: File | string): Promise<string> {
  const tryCapture = (video: HTMLVideoElement, time: number): Promise<string | null> => {
    return new Promise((resolve) => {
      let resolved = false;
      const onSeeked = () => {
        if (resolved) return;
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        try {
          const w = Math.min(video.videoWidth || 640, 640);
          const h = video.videoHeight ? Math.round(w * video.videoHeight / video.videoWidth) : 360;
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return resolve(null);
          ctx.drawImage(video, 0, 0, w, h);
          const data = ctx.getImageData(0, 0, Math.min(w, 50), Math.min(h, 50)).data;
          
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i+1]; b += data[i+2];
            count++;
          }
          const avg = (r + g + b) / (count * 3);
          const isTooDark = avg < 15;
          const isTooGrey = Math.abs(r/count - g/count) < 2 && Math.abs(g/count - b/count) < 2 && avg > 110 && avg < 140;
          
          if (isTooDark || isTooGrey) return resolve(null);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch { resolve(null); }
      };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = time;
      setTimeout(() => { if (!resolved) { resolved = true; video.removeEventListener('seeked', onSeeked); resolve(null); } }, 4000);
    });
  };

  const video = document.createElement('video');
  const isUrl = typeof source === 'string';
  const url = isUrl ? source : URL.createObjectURL(source);
  
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  if (isUrl) video.crossOrigin = 'anonymous'; // Critical for CORS
  video.src = url;

  return new Promise<string>((resolve) => {
    video.onloadedmetadata = async () => {
      const dur = isFinite(video.duration) ? video.duration : 10;
      const points = [Math.min(3, dur * 0.1), Math.min(10, dur * 0.2), dur * 0.5, 0.5, 1.0, 0];
      
      for (const p of points) {
        const thumb = await tryCapture(video, p);
        if (thumb) {
          if (!isUrl) URL.revokeObjectURL(url);
          return resolve(thumb);
        }
      }
      
      if (!isUrl) URL.revokeObjectURL(url);
      const initial = (isUrl ? 'V' : (source as File).name[0] ?? 'V').toUpperCase();
      const seed = isUrl ? source : (source as File).name;
      const hue = seed.split('').reduce((a: number, c: string) => a + c.charCodeAt(0), 0) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${hue},25%,12%)"/><text x="320" y="195" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="130" fill="hsl(${hue},50%,45%)" opacity="0.35">${initial}</text></svg>`;
      resolve(`data:image/svg+xml;base64,${btoa(svg)}`);
    };
    video.onerror = (e) => {
      console.error("[captureVideoThumbnail] Media error for src:", video.src, video.error || e);
      if (!isUrl) URL.revokeObjectURL(url);
      resolve("");
    };

    // Global 10s timeout to prevent hanging the UI
    setTimeout(() => {
      console.warn("[captureVideoThumbnail] Global timeout reached for src:", video.src);
      if (!isUrl) URL.revokeObjectURL(url);
      resolve("");
    }, 10000); // 10 seconds
  });
}

// Capture a thumbnail from a remote video URL.
// Fetches the first 3MB as a blob to sidestep canvas CORS restrictions entirely.
// Capture a thumbnail from a remote video URL.
// Fetches chunks from the start and end (to handle MOOV position) to bypass CORS restrictions.
async function captureFrameFromVideoUrl(videoUrl: string): Promise<string | null> {
  const fetchChunk = async (range: string) => {
    try {
      const res = await fetch(videoUrl, { headers: { Range: range } })
      if (!res.ok && res.status !== 206) return null
      return await res.blob()
    } catch (e) {
      return null
    }
  }

  // Strategy 1: First 3MB (Fast Start files)
  let blob = await fetchChunk('bytes=0-3145727')
  
  return new Promise(async (resolve) => {
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'

    let resolved = false
    const done = (val: string | null) => {
      if (resolved) return
      resolved = true
      resolve(val)
    }

    const tryBlob = async (currentBlob: Blob | null) => {
      if (!currentBlob) return false
      const url = URL.createObjectURL(currentBlob)
      
      return new Promise<boolean>((res) => {
        let seeked = false
        const timeout = setTimeout(() => {
          if (!seeked) {
            URL.revokeObjectURL(url)
            res(false)
          }
        }, 5000)

        video.onloadedmetadata = () => {
          video.currentTime = Math.min(1, video.duration > 0 ? video.duration * 0.05 : 1)
        }
        video.onseeked = () => {
          if (seeked) return
          seeked = true
          clearTimeout(timeout)
          try {
            const canvas = document.createElement('canvas')
            canvas.width = Math.min(video.videoWidth || 640, 640)
            canvas.height = video.videoHeight ? Math.round(canvas.width * video.videoHeight / video.videoWidth) : 360
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
              const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
              URL.revokeObjectURL(url)
              res(true)
              done(dataUrl)
            } else {
              URL.revokeObjectURL(url)
              res(false)
            }
          } catch { 
            URL.revokeObjectURL(url)
            res(false) 
          }
        }
        video.onerror = () => {
          clearTimeout(timeout)
          URL.revokeObjectURL(url)
          res(false)
        }
        video.src = url
      })
    }

    // Attempt 1: First 3MB
    if (await tryBlob(blob)) return

    // Attempt 2: Last 3MB (for files with MOOV at end)
    console.log('[captureFrameFromVideoUrl] Strategy 1 failed, trying end of file...')
    const headRes = await fetch(videoUrl, { method: 'HEAD' }).catch(() => null)
    const fileSize = parseInt(headRes?.headers.get('content-length') || '0')
    if (fileSize > 3145728) {
      const lastChunk = await fetchChunk(`bytes=${fileSize - 3145728}-${fileSize - 1}`)
      if (await tryBlob(lastChunk)) return
    }

    // Attempt 3: Larger first chunk (10MB)
    console.log('[captureFrameFromVideoUrl] Strategy 2 failed, trying larger start chunk...')
    const bigChunk = await fetchChunk('bytes=0-10485759')
    if (await tryBlob(bigChunk)) return

    done(null)
  })
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

const formatDate = (date: string | null) => {
  if (!date) return 'Unknown date'
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const formatDuration = (seconds: number | null) => {
  if (!seconds) return null
  const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`
}

// --- Main Page Component ---

export default function UploadsPage() {
  const [uploads, setUploads] = useState<UploadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date')
  const [autoSkip, setAutoSkip] = useState(true)
  
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const fileMap = useRef<Map<string, File>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/video-upload')
      if (res.ok) {
        const data = await res.json()
        setUploads(data.uploads || [])
      }
    } catch (err) { console.error('History fetch failed:', err) }
    finally { setLoading(false) }
  }, [])

  const handleReset = async (id: string, mode: 'thumbnail' | 'full' = 'full') => {
    try {
      const item = uploads.find(u => u.id === id)
      
      // FAST PATH: Browser-side thumbnail capture
      // Uses blob-fetch approach to completely sidestep CORS restrictions
      if (mode === 'thumbnail') {
        setProcessingIds(prev => new Set(prev).add(id))
        setMenuOpenId(null)
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'capturing' as any } : u))
        try {
          // Step 1: Get a signed video URL from our own server
          console.log(`[Fix Thumbnail] Getting signed URL for ${id}...`)
          const urlRes = await fetch(`/api/video-upload/${id}/signed-url`)
          if (!urlRes.ok) throw new Error('Could not get video URL')
          const { signedUrl } = await urlRes.json()

          // Step 2: Capture a frame in the browser (fetches first 3MB as blob — no CORS issues)
          console.log(`[Fix Thumbnail] Capturing frame from blob...`)
          const thumbnail = await captureFrameFromVideoUrl(signedUrl)
          if (!thumbnail) throw new Error('Frame capture failed — video may use unsupported codec (HEVC on Chrome)')

          // Step 3: Save directly to DB via the dedicated thumbnail endpoint
          console.log(`[Fix Thumbnail] Saving thumbnail to DB...`)
          const saveRes = await fetch(`/api/video-upload/${id}/thumbnail`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail_url: thumbnail }),
          })
          if (!saveRes.ok) throw new Error('Failed to save thumbnail')

          // Step 4: Update UI immediately with the data URL
          console.log(`[Fix Thumbnail] Success!`)
          setUploads(prev => prev.map(u => u.id === id ? { ...u, thumbnail_url: thumbnail, status: 'processed' } : u))
          setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next })
          return
        } catch (err: any) {
          console.error('[Fix Thumbnail] Failed:', err.message)
          // Don't fall through to full reprocess — just show the error and stop
          setUploads(prev => prev.map(u => u.id === id ? { ...u, status: item?.status || 'error' as any, error_message: err.message } : u))
          setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next })
          return
        }
      }

      // Fallback: Trigger Inngest pipeline (the "Slow Path" which I've also fixed)
      setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'starting' as any, error_message: null } : u))
      setProcessingIds(prev => new Set(prev).add(id)) // Show loading state early
      const res = await fetch('/api/video-upload/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, mode })
      })
      if (res.ok) {
        setMenuOpenId(null)
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'starting' as any, error_message: null } : u))
        fetchUploads()
      }
      setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    } catch (err) {
      console.error('Reset failed:', err)
    }
  }

  const handleFixAllThumbnails = async () => {
    // Inclusive check for missing or placeholder thumbnails
    const isBroken = (u: UploadListItem) => !u.thumbnail_url || 
      u.thumbnail_url.startsWith('data:image/svg') || 
      u.thumbnail_url.includes('_placeholder') ||
      (u.status === 'error' && !u.thumbnail_url);

    const missing = uploads.filter(isBroken)
    if (missing.length === 0) {
      alert("No missing thumbnails detected.")
      return
    }
    
    if (!confirm(`Fix ${missing.length} broken thumbnails using the high-reliability browser capture?`)) return
    
    // Process sequentially to avoid network congestion
    for (const item of missing) {
      await handleReset(item.id, 'thumbnail')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently remove this recording signal?')) return
    try {
      const res = await fetch(`/api/video-upload?id=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setMenuOpenId(null)
        setUploads(prev => prev.filter(u => u.id !== id))
      }
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }

  const handleResetAll = async () => {
    const stuck = uploads.filter(u => u.status !== 'processed' && u.status !== 'error')
    if (stuck.length === 0) return
    if (!confirm(`Reset processing for ${stuck.length} uploads?`)) return
    
    for (const item of stuck) {
      await handleReset(item.id)
    }
  }

  // Initial load
  useEffect(() => { 
    fetchUploads() 
    const saved = localStorage.getItem('neolog_upload_queue')
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as QueueItem[]
        setQueue(parsed.map(item => ({
          ...item,
          status: fileMap.current.has(item.id) ? item.status : 
                  (['done', 'skipped', 'error'].includes(item.status) ? item.status : 'error'),
          error: fileMap.current.has(item.id) ? item.error : 'Connection lost. Please re-add.'
        })))
      } catch {}
    }
  }, [fetchUploads])

  // Separate polling effect — always runs a 5s interval, only fetches when there are active uploads
  useEffect(() => {
    const interval = setInterval(() => {
      const hasActive = uploads.some(u => {
        const s = u.status as string
        return s !== 'processed' && s !== 'error' && s !== 'deleted' && s !== 'deleting'
      })
      if (hasActive) {
        console.log('[Polling] Active uploads detected, refreshing...')
        fetchUploads()
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [uploads, fetchUploads])

  useEffect(() => {
    const serializable = queue.map(({ id, fileName, fileSize, fileType, status, progress, thumbnail, recordedAt, error, r2UploadId, r2Key }) => ({
      id, fileName, fileSize, fileType, status, progress, thumbnail, recordedAt, error, r2UploadId, r2Key
    }))
    localStorage.setItem('neolog_upload_queue', JSON.stringify(serializable))
  }, [queue])

  const extractVideoDate = async (file: File): Promise<string | null> => {
    let mediainfo: any;
    const name = file.name;
    const dateMatches = [/(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, /(\d{4})-(\d{2})-(\d{2})/, /(\d{4})(\d{2})(\d{2})/];
    for (const regex of dateMatches) {
      const match = name.match(regex);
      if (match) {
        const [_, y, m, d, hh, mm, ss] = match;
        const inferred = new Date(parseInt(y), parseInt(m) - 1, parseInt(d), parseInt(hh || "12"), parseInt(mm || "0"), parseInt(ss || "0"));
        if (!isNaN(inferred.getTime())) return inferred.toISOString();
      }
    }
    try {
      const wasmUrl = "https://unpkg.com/mediainfo.js@0.2.1/dist/MediaInfoModule.wasm";
      mediainfo = await (MediaInfoFactory as any)({ format: 'object', locateFile: (path: string) => path.endsWith('.wasm') ? wasmUrl : path });
      const getSize = () => file.size;
      const readChunk = (chunkSize: number, offset: number) =>
        new Promise<Uint8Array>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
          reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        });
      const info = await mediainfo.analyzeData(getSize, readChunk);
      if (info?.media?.track) {
        for (const track of info.media.track) {
          if (track.Encoded_Date) {
            const d = new Date(track.Encoded_Date);
            if (!isNaN(d.getTime())) return d.toISOString();
          }
        }
      }
    } catch {} finally { if (mediainfo) mediainfo.close(); }
    return null;
  };

  const updateQueueItem = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(item => item.id === id ? { ...item, ...patch } : item))
  }, [])

  const startR2UploadRaw = useCallback(async (item: QueueItem) => {
    const file = fileMap.current.get(item.id)
    if (!file) return updateQueueItem(item.id, { status: 'error', error: 'File handle lost' })

    const localKey = `r2upload_${file.name}_${file.size}`
    const CONCURRENCY = 2
    const PART_SIZE = 50 * 1024 * 1024

    let resumeState: any = null
    try {
      const stored = localStorage.getItem(localKey)
      if (stored) resumeState = JSON.parse(stored)
    } catch {}

    const controller = new AbortController()
    abortControllers.current.set(item.id, controller)
    updateQueueItem(item.id, { status: 'uploading' })

    try {
      let r2UploadId: string; let r2Key: string; let totalParts: number; let partSize: number
      const etags: Record<string, string> = resumeState?.etags || {}
      let remainingPartUrls: Array<{ partNumber: number; url: string }> = []

      if (resumeState) {
        r2UploadId = resumeState.uploadId; r2Key = resumeState.key; totalParts = resumeState.totalParts; partSize = resumeState.partSize
        const doneParts = new Set(Object.keys(etags).map(Number))
        const remaining = Array.from({ length: totalParts }, (_, i) => i + 1).filter(p => !doneParts.has(p))
        if (remaining.length > 0) {
          const res = await fetchWithRetry(`/api/upload/resume?uploadId=${encodeURIComponent(r2UploadId)}&key=${encodeURIComponent(r2Key)}&fromPart=${Math.min(...remaining)}&totalParts=${totalParts}`, { signal: controller.signal })
          const data = await res.json()
          remaining.forEach((partNum, idx) => remainingPartUrls.push({ partNumber: partNum, url: data.partUrls[idx] }))
        }
      } else {
        const res = await fetchWithRetry('/api/upload/initiate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, fileSize: file.size, mimeType: file.type }),
          signal: controller.signal,
        })
        const init = await res.json()
        r2UploadId = init.uploadId; r2Key = init.key; totalParts = init.totalParts; partSize = init.partSize
        localStorage.setItem(localKey, JSON.stringify({ uploadId: r2UploadId, key: r2Key, partSize, totalParts, etags: {} }))
        updateQueueItem(item.id, { r2UploadId, r2Key })
        remainingPartUrls = init.partUrls.map((url: string, i: number) => ({ partNumber: i + 1, url }))
      }

      for (let i = 0; i < remainingPartUrls.length; i += CONCURRENCY) {
        if (controller.signal.aborted) break
        const batch = remainingPartUrls.slice(i, i + CONCURRENCY)
        await Promise.all(batch.map(async ({ partNumber, url }) => {
          const start = (partNumber - 1) * partSize
          const chunk = file.slice(start, Math.min(start + partSize, file.size))
          const putRes = await fetchWithRetry(url, { method: 'PUT', body: chunk, signal: controller.signal })
          if (!putRes.ok) throw new Error(`Part ${partNumber} failed (${putRes.status})`)
          const etag = putRes.headers.get('ETag')
          if (!etag) throw new Error(`Missing ETag (Check R2 CORS)`)
          etags[String(partNumber)] = etag
          const completedBytes = Math.min(Object.keys(etags).length * partSize, file.size)
          updateQueueItem(item.id, { progress: Math.round((completedBytes / file.size) * 100) })
          try {
            const s = JSON.parse(localStorage.getItem(localKey) || '{}')
            s.etags = etags; localStorage.setItem(localKey, JSON.stringify(s))
          } catch {}
        }))
      }

      if (controller.signal.aborted) return
      updateQueueItem(item.id, { status: 'completing', progress: 100 })
      const res = await fetchWithRetry('/api/upload/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: r2UploadId, key: r2Key, fileName: file.name, fileSizeBytes: file.size, mimeType: file.type,
          recordedAt: item.recordedAt, thumbnailUrl: item.thumbnail,
          parts: Object.entries(etags).map(([n, ETag]) => ({ PartNumber: parseInt(n), ETag })).sort((a, b) => a.PartNumber - b.PartNumber),
          force: true
        }),
        signal: controller.signal
      })

      if (res.ok) {
        const data = await res.json()
        localStorage.removeItem(localKey)
        updateQueueItem(item.id, { status: 'done' })
        setProcessingIds(prev => new Set(prev).add(data.id))
        fetchUploads()
        setTimeout(() => setQueue(q => q.filter(it => it.id !== item.id)), 3000)
      } else throw new Error((await res.json().catch(() => ({}))).error || 'Completion failed')
    } catch (err: any) {
      if (err.name === 'AbortError') return
      updateQueueItem(item.id, { status: 'error', error: err.message })
    } finally { abortControllers.current.delete(item.id) }
  }, [updateQueueItem, fetchUploads])

  useEffect(() => {
    const activeCount = queue.filter(it => ['checking', 'extracting', 'uploading', 'completing'].includes(it.status)).length
    if (activeCount >= 2) return
    const next = queue.find(it => it.status === 'pending')
    if (!next) return
    (async () => {
      const file = fileMap.current.get(next.id)
      if (!file) return updateQueueItem(next.id, { status: 'error', error: 'File handle expired' })
      updateQueueItem(next.id, { status: 'checking' })
      try {
        const checkRes = await fetch(`/api/video-upload?file_name=${encodeURIComponent(next.fileName)}&file_size_bytes=${next.fileSize}&limit=1`)
        if ((await checkRes.json()).uploads?.length > 0 && autoSkip) {
          updateQueueItem(next.id, { status: 'skipped' })
          setTimeout(() => setQueue(q => q.filter(it => it.id !== next.id)), 5000)
          return
        }
      } catch {}
      updateQueueItem(next.id, { status: 'extracting' })
      try {
        const [recordedAt, thumbnail] = await Promise.all([extractVideoDate(file), captureVideoThumbnail(file).catch(() => null)])
        updateQueueItem(next.id, { recordedAt, thumbnail })
      } catch {}
      startR2UploadRaw({ ...next, status: 'uploading' })
    })()
  }, [queue, autoSkip, updateQueueItem, startR2UploadRaw])

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = Array.from(files).map(file => {
      const id = crypto.randomUUID(); fileMap.current.set(id, file);
      return { id, fileName: file.name, fileSize: file.size, fileType: file.type, status: 'pending', progress: 0, thumbnail: null, recordedAt: null }
    })
    setQueue(prev => [...prev, ...newItems])
  }, [])

  const sortedUploads = [...uploads]
    .filter(u => u.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.recorded_at || b.created_at).getTime() - new Date(a.recorded_at || a.created_at).getTime()
      if (sortBy === 'size') return b.file_size_bytes - a.file_size_bytes
      return a.file_name.localeCompare(b.file_name)
    })

  return (
    <div className="min-h-screen bg-[#020203] text-zinc-100 pb-20 selection:bg-blue-500/30">
      <div className="max-w-[1600px] mx-auto px-6 pt-12">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div className="space-y-1">
            <h1 className="text-6xl font-black tracking-tighter bg-gradient-to-b from-white to-zinc-500 bg-clip-text text-transparent">Upload Center</h1>
            <p className="text-zinc-500 text-lg font-medium flex items-center gap-2"><Zap className="w-5 h-5 text-blue-500 fill-blue-500" />Fault-tolerant media ingestion.</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 bg-zinc-900/40 p-1.5 rounded-2xl border border-zinc-800/50 backdrop-blur-xl">
              <button onClick={() => setViewMode('grid')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-zinc-800' : 'text-zinc-600'}`}><Grid className="w-5 h-5" /></button>
              <button onClick={() => setViewMode('list')} className={`p-2.5 rounded-xl transition-all ${viewMode === 'list' ? 'bg-zinc-800' : 'text-zinc-600'}`}><List className="w-5 h-5" /></button>
            </div>
            {uploads.length > 0 && (
              <button 
                onClick={handleFixAllThumbnails}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl transition-all text-xs font-black uppercase tracking-widest ${
                  uploads.some(u => !u.thumbnail_url || u.thumbnail_url.startsWith('data:image/svg') || u.thumbnail_url.includes('_placeholder'))
                    ? 'bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 shadow-[0_0_20px_rgba(59,130,246,0.1)]'
                    : 'bg-zinc-900/50 border border-zinc-800/50 text-zinc-600 cursor-not-allowed opacity-50'
                }`}
              >
                <Zap className={`w-4 h-4 ${uploads.some(u => !u.thumbnail_url || u.thumbnail_url.startsWith('data:image/svg')) ? 'fill-blue-500/20 animate-pulse' : ''}`} />
                Fix All Missing
              </button>
            )}
            {uploads.some(u => u.status !== 'processed' && u.status !== 'error') && (
              <button 
                onClick={() => handleResetAll()}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 hover:bg-red-500/20 transition-all text-xs font-black uppercase tracking-widest"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Stuck Queue
              </button>
            )}
            <button onClick={fetchUploads} className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-2xl text-zinc-500 hover:text-white transition-all shadow-lg active:scale-95"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        <div className="space-y-12">
          {/* Header Actions & Dropzone Row */}
          <div className="flex flex-col lg:flex-row gap-8 items-start">
            {/* Upload Dropzone - Now more compact and integrated */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
              className={`relative group cursor-pointer transition-all duration-700 rounded-[2rem] border-2 border-dashed ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[1.01]' : 'border-zinc-800 bg-zinc-900/10 hover:border-zinc-700'} flex items-center gap-6 p-8 min-w-[320px] ring-1 ring-inset ring-white/5 shadow-2xl`}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input id="file-input" type="file" multiple accept="video/*" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <div className="p-4 rounded-2xl bg-zinc-950 border border-zinc-800 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700"><Upload className="w-6 h-6 text-blue-500" /></div>
              <div>
                <h3 className="text-lg font-bold text-zinc-200">Ingest Recordings</h3>
                <p className="text-zinc-500 text-xs mt-1 font-medium opacity-60">Persistent multipart ingestion</p>
              </div>
            </div>

            {/* Active Pipeline Stats / Queue Mini-view (if active) */}
            {queue.length > 0 && (
              <div className="flex-1 w-full space-y-4 animate-in slide-in-from-top-4 duration-700 overflow-hidden">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3"><Loader2 className="w-5 h-5 text-blue-500 animate-spin" /><h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Processing Pipeline</h3></div>
                  <button onClick={() => setQueue([])} className="text-[10px] uppercase font-black tracking-widest text-zinc-600 hover:text-white">Clear Queue</button>
                </div>
                <div className="flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
                  {queue.map(item => (
                    <div key={item.id} className={`min-w-[280px] p-4 rounded-2xl border backdrop-blur-3xl transition-all duration-500 ${item.status === 'error' ? 'bg-red-500/5 border-red-500/20' : item.status === 'done' ? 'bg-green-500/5 border-green-500/20' : 'bg-zinc-900/40 border-zinc-800'}`}>
                      <div className="flex gap-4 items-center">
                        <div className="relative w-12 h-12 rounded-xl bg-zinc-950 overflow-hidden shrink-0 border border-zinc-800/50">
                          {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : <VideoIcon className="w-5 h-5 absolute inset-0 m-auto text-zinc-800" />}
                          {item.status === 'uploading' && <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500" style={{ width: `${item.progress}%` }} />}
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="text-xs font-bold truncate text-zinc-100">{item.fileName}</p>
                          <p className={`text-[9px] font-black uppercase tracking-widest mt-1 ${item.status === 'error' ? 'text-red-500' : 'text-blue-400'}`}>{item.status}</p>
                        </div>
                        <button onClick={() => { abortControllers.current.get(item.id)?.abort(); setQueue(q => q.filter(i => i.id !== item.id)) }} className="text-zinc-700 hover:text-white"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Library Section */}
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row gap-5 items-center">
              <div className="relative flex-1 group w-full">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-600 group-focus-within:text-blue-500 transition-all duration-500" />
                <input type="text" placeholder="Scan library signals..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-zinc-900/20 border border-zinc-800/50 rounded-[1.75rem] py-4.5 pl-14 pr-6 focus:border-blue-500/30 outline-none text-base transition-all backdrop-blur-xl" />
              </div>
              <div className="flex bg-zinc-900/40 p-1.5 rounded-[1.25rem] border border-zinc-800/50 backdrop-blur-xl shrink-0">
                {(['date', 'size', 'name'] as const).map(mode => <button key={mode} onClick={() => setSortBy(mode)} className={`px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${sortBy === mode ? 'bg-zinc-800 text-white' : 'text-zinc-600'}`}>{mode}</button>)}
              </div>
            </div>

            {loading && uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-48 bg-zinc-900/5 rounded-[3rem] border border-zinc-900/50 border-dashed"><RefreshCw className="w-16 h-16 text-zinc-800 animate-spin mb-8" /><p className="text-zinc-700 font-black uppercase tracking-[0.3em] text-xs">Syncing Archive...</p></div>
            ) : (
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8" : "space-y-6"}>
                {sortedUploads.map(item => (
                  <div 
                    key={item.id} 
                    className={`group relative transition-all duration-700 rounded-[2.5rem] border ${item.status === 'error' ? 'border-red-500/20' : 'border-zinc-800 bg-zinc-900/10 hover:border-zinc-700 shadow-xl'} ${viewMode === 'list' ? 'flex items-center p-5' : 'flex flex-col'} ${menuOpenId === item.id ? 'z-[100]' : 'z-0'}`}
                  >
                    <div className={`relative overflow-hidden aspect-video bg-zinc-950 ${viewMode === 'list' ? 'w-56 rounded-2xl mr-8 h-32 shrink-0' : 'w-full'}`}>
                      {item.thumbnail_url ? <img src={item.thumbnail_url} className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110" /> : <div className="w-full h-full flex items-center justify-center"><VideoIcon className="w-10 h-10 text-zinc-900" /></div>}
                      
                      {/* Quick Fix Button for broken thumbnails */}
                      {(!item.thumbnail_url || item.thumbnail_url.startsWith('data:image/svg') || item.thumbnail_url?.includes('_placeholder')) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleReset(item.id, 'thumbnail') }}
                          className="absolute inset-0 m-auto w-12 h-12 bg-blue-500/80 hover:bg-blue-500 text-white rounded-full flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-95 z-20"
                          title="Quick Fix Thumbnail"
                        >
                          {processingIds.has(item.id) ? <Loader2 className="w-6 h-6 animate-spin" /> : <Zap className="w-4 h-4 fill-current" />}
                        </button>
                      )}

                      <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border backdrop-blur-xl flex items-center gap-1.5 ${
                          item.status === 'processed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                          item.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                          'bg-blue-500/10 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]'
                        }`}>
                          {!(item.status === 'processed' || item.status === 'error') && (
                            <span className="flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                          )}
                          {item.status.replace(/-/g, ' ')}
                        </div>
                      </div>
                      {item.duration_seconds && <div className="absolute bottom-5 left-5 px-3 py-1.5 rounded-xl bg-black/60 text-white text-[10px] font-black tracking-widest backdrop-blur-xl border border-white/5 shadow-2xl">{formatDuration(item.duration_seconds)}</div>}
                    </div>
                    <div className="p-7">
                      <div className="flex items-start justify-between mb-4">
                        <div className="min-w-0 pr-4">
                          <h4 className="font-bold text-zinc-100 truncate text-base mb-1 group-hover:text-blue-400 transition-colors" title={item.file_name}>{item.file_name}</h4>
                          <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest opacity-60">ID: {item.id.slice(0, 8)}</p>
                        </div>
                        <div className="relative">
                          <button 
                            onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === item.id ? null : item.id) }} 
                            className={`p-2 rounded-xl transition-all ${menuOpenId === item.id ? 'bg-zinc-800 text-white' : 'text-zinc-600 hover:text-white'}`}
                          >
                            <MoreVertical className={`w-5 h-5 ${processingIds.has(item.id) ? 'animate-spin' : ''}`} />
                          </button>
                          
                          {menuOpenId === item.id && (
                            <div 
                              ref={menuRef}
                              className="absolute right-0 top-12 w-56 bg-zinc-900 border border-zinc-800 rounded-2xl p-2 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[100] animate-in fade-in zoom-in-95 duration-200"
                            >
                              <button 
                                onClick={() => handleReset(item.id, 'thumbnail')}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-300 hover:bg-zinc-800 hover:text-white rounded-xl transition-all"
                              >
                                <Zap className="w-4 h-4 text-blue-500" />
                                Fix Thumbnail (Fast Fix)
                              </button>
                              <button 
                                onClick={() => handleReset(item.id, 'full')}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-zinc-400 hover:bg-zinc-800 hover:text-white rounded-xl transition-all"
                              >
                                <RotateCcw className="w-4 h-4 text-zinc-600" />
                                Full Reprocess
                              </button>
                              <button 
                                onClick={() => handleDelete(item.id)}
                                className="w-full flex items-center gap-3 px-4 py-3 text-xs font-bold text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                                Remove Signal
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      {item.status === 'error' && item.error_message && (
                        <div className="mb-4 p-3 bg-red-500/5 rounded-2xl border border-red-500/10 overflow-hidden">
                          <p className="text-[10px] text-red-400/80 font-medium italic line-clamp-2 leading-relaxed">{item.error_message}</p>
                        </div>
                      )}
                      <div className="flex items-center gap-6 border-t border-zinc-800/50 pt-5 mt-2">
                        <div className="flex items-center gap-2.5 text-[10px] text-zinc-400 font-black tracking-[0.15em]"><Calendar className="w-3.5 h-3.5 text-blue-500/50" />{formatDate(item.recorded_at || item.created_at)}</div>
                        <div className="flex items-center gap-2.5 text-[10px] text-zinc-400 font-black tracking-[0.15em]"><Database className="w-3.5 h-3.5 text-blue-500/50" />{formatBytes(item.file_size_bytes)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #18181b; border-radius: 10px; }
      `}</style>
    </div>
  )
}
