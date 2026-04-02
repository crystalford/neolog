'use client'

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
>

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
async function captureVideoThumbnail(file: File): Promise<string> {
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
          
          // Check for "Good Frame" (not all black or solid grey)
          let r = 0, g = 0, b = 0, count = 0;
          for (let i = 0; i < data.length; i += 4) {
            r += data[i]; g += data[i+1]; b += data[i+2];
            count++;
          }
          const avg = (r + g + b) / (count * 3);
          const isTooDark = avg < 15; // Basically black
          const isTooGrey = Math.abs(r/count - g/count) < 2 && Math.abs(g/count - b/count) < 2 && avg > 110 && avg < 140; // Flat grey decoder failure
          
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
  const url = URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = url;

  return new Promise<string>((resolve) => {
    video.onloadedmetadata = async () => {
      const dur = isFinite(video.duration) ? video.duration : 10;
      const points = [Math.min(3, dur * 0.1), Math.min(10, dur * 0.2), dur * 0.5, 0.5, 1.0];
      
      for (const p of points) {
        const thumb = await tryCapture(video, p);
        if (thumb) {
          URL.revokeObjectURL(url);
          return resolve(thumb);
        }
      }
      
      // Fallback: Dynamic SVG
      URL.revokeObjectURL(url);
      const initial = (file.name[0] ?? 'V').toUpperCase();
      const hue = file.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="hsl(${hue},25%,12%)"/><text x="320" y="195" text-anchor="middle" dominant-baseline="middle" font-family="monospace" font-size="130" fill="hsl(${hue},50%,45%)" opacity="0.35">${initial}</text></svg>`;
      resolve(`data:image/svg+xml;base64,${btoa(svg)}`);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(''); // Just an empty string, let the UI handle it
    };
  });
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
  
  const fileMap = useRef<Map<string, File>>(new Map())
  const abortControllers = useRef<Map<string, AbortController>>(new Map())

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

  const handleReset = async (id: string) => {
    try {
      const res = await fetch('/api/video-upload/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      })
      if (res.ok) {
        // Optimistic update
        setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'uploaded', error_message: null } : u))
        fetchUploads()
      }
    } catch (err) {
      console.error('Reset failed:', err)
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
            {uploads.some(u => u.status !== 'processed' && u.status !== 'error') && (
              <button 
                onClick={handleResetAll}
                className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 hover:bg-red-500/20 transition-all text-xs font-black uppercase tracking-widest"
              >
                <RotateCcw className="w-4 h-4" />
                Reset Queue
              </button>
            )}
            <button onClick={fetchUploads} className="p-3 bg-zinc-900/40 border border-zinc-800/50 rounded-2xl text-zinc-500 hover:text-white transition-all shadow-lg active:scale-95"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          <div className="lg:col-span-4 space-y-8">
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
              className={`relative group cursor-pointer transition-all duration-700 rounded-[2.5rem] border-2 border-dashed ${dragActive ? 'border-blue-500 bg-blue-500/5 scale-[1.02]' : 'border-zinc-800 bg-zinc-900/10 hover:border-zinc-700'} aspect-square md:aspect-video lg:aspect-square flex flex-col items-center justify-center p-10 overflow-hidden ring-1 ring-inset ring-white/5`}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <input id="file-input" type="file" multiple accept="video/*" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
              <div className="relative mb-6 p-7 rounded-[2rem] bg-zinc-950 border border-zinc-800 group-hover:scale-110 group-hover:rotate-3 transition-all duration-700"><Upload className="w-12 h-12 text-blue-500 filter drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" /></div>
              <h3 className="text-2xl font-bold text-zinc-200 tracking-tight">Ingest Recordings</h3>
              <p className="text-zinc-500 text-sm mt-2 font-medium opacity-60">Persistent multipart ingestion</p>
            </div>

            {queue.length > 0 && (
              <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center justify-between px-4">
                  <div className="flex items-center gap-3"><Loader2 className={`w-5 h-5 text-blue-500 ${queue.some(i => !['done','skipped','error'].includes(i.status)) ? 'animate-spin' : ''}`} /><h3 className="text-xs font-black uppercase tracking-[0.2em] text-zinc-400">Processing Pipeline</h3></div>
                  <label className="flex items-center gap-2.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 cursor-pointer bg-zinc-900/80 px-3 py-1.5 rounded-xl border border-zinc-800/50 backdrop-blur-md">
                    <input type="checkbox" checked={autoSkip} onChange={e => setAutoSkip(e.target.checked)} className="accent-blue-500" />Auto-skip
                  </label>
                </div>
                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {queue.map(item => (
                    <div key={item.id} className={`p-4 rounded-[1.75rem] border backdrop-blur-3xl transition-all duration-500 ${item.status === 'error' ? 'bg-red-500/5 border-red-500/20' : item.status === 'skipped' ? 'bg-zinc-800/20 border-zinc-800/50 grayscale' : item.status === 'done' ? 'bg-green-500/5 border-green-500/20' : 'bg-zinc-900/30 border-zinc-800'}`}>
                      <div className="flex gap-5">
                        <div className="relative w-16 h-16 rounded-2xl bg-zinc-950 overflow-hidden shrink-0 border border-zinc-800/50">
                          {item.thumbnail ? <img src={item.thumbnail} className="w-full h-full object-cover" /> : <VideoIcon className="w-6 h-6 absolute inset-0 m-auto text-zinc-800" />}
                          {item.status === 'uploading' && <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 transition-all duration-1000" style={{ width: `${item.progress}%` }} />}
                          {item.status === 'done' && <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center backdrop-blur-[2px]"><Check className="w-6 h-6 text-green-400" /></div>}
                        </div>
                        <div className="flex-1 min-w-0 py-0.5">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-sm font-bold truncate text-zinc-100 pr-2" title={item.fileName}>{item.fileName}</span>
                             <span className={`text-[9px] px-2 py-0.5 rounded-lg font-black uppercase tracking-widest border ${item.status === 'error' ? 'text-red-500 border-red-500/20' : item.status === 'skipped' ? 'text-zinc-500 border-zinc-700' : item.status === 'done' ? 'text-green-400 border-green-500/20' : 'text-blue-400 border-blue-500/20'}`}>
                               {item.status}
                             </span>
                          </div>
                          {item.status === 'error' ? <p className="text-red-400/80 text-[10px] italic leading-tight">{item.error}</p> : <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-1"><span>{formatBytes(item.fileSize)}</span>{item.status === 'uploading' && <span>{item.progress}%</span>}</div>}
                        </div>
                        <button onClick={() => { abortControllers.current.get(item.id)?.abort(); setQueue(q => q.filter(i => i.id !== item.id)) }} className="pt-1 text-zinc-700 hover:text-white"><X className="w-5 h-5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-8">
            <div className="flex flex-col md:flex-row gap-5 items-center mb-10">
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
              <div className={viewMode === 'grid' ? "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8" : "space-y-6"}>
                {sortedUploads.map(item => (
                  <div key={item.id} className={`group relative overflow-hidden transition-all duration-700 rounded-[2rem] border ${item.status === 'error' ? 'border-red-500/20' : 'border-zinc-800 bg-zinc-900/10 hover:border-zinc-700'} ${viewMode === 'list' ? 'flex items-center p-5' : 'flex flex-col'}`}>
                    <div className={`relative overflow-hidden aspect-video bg-zinc-950 ${viewMode === 'list' ? 'w-56 rounded-2xl mr-8 h-32 shrink-0' : 'w-full'}`}>
                      {item.thumbnail_url ? <img src={item.thumbnail_url} className="w-full h-full object-cover transition-transform duration-[1.5s] group-hover:scale-110" /> : <div className="w-full h-full flex items-center justify-center"><VideoIcon className="w-10 h-10 text-zinc-900" /></div>}
                      <div className="absolute top-5 right-5 flex flex-col items-end gap-2">
                        <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border backdrop-blur-xl ${
                          item.status === 'processed' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 
                          item.status === 'error' ? 'bg-red-500/10 text-red-400 border-red-500/20' : 
                          'bg-blue-500/10 text-blue-400 border-blue-500/20'
                        }`}>
                          {item.status.replace(/-/g, ' ')}
                        </div>
                      </div>
                      {item.duration_seconds && <div className="absolute bottom-5 left-5 px-3 py-1.5 rounded-xl bg-black/60 text-white text-[10px] font-black tracking-widest backdrop-blur-xl border border-white/5 shadow-2xl">{formatDuration(item.duration_seconds)}</div>}
                    </div>
                    <div className="p-7">
                      <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 pr-4">
                          <h4 className="font-bold text-zinc-100 truncate text-base mb-1 group-hover:text-blue-400 transition-colors" title={item.file_name}>{item.file_name}</h4>
                          <p className="text-[10px] text-zinc-600 font-black uppercase tracking-widest opacity-60">ID: {item.id.slice(0, 8)}</p>
                        </div>
                        {item.status === 'error' ? (
                          <button 
                            onClick={() => handleReset(item.id)}
                            className="p-2 bg-red-500/20 rounded-xl text-red-400 hover:bg-red-500/30 transition-all active:scale-90"
                            title="Retry Upload"
                          >
                            <RotateCcw className="w-5 h-5" />
                          </button>
                        ) : (
                          <MoreVertical className="w-5 h-5 text-zinc-800" />
                        )}
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
