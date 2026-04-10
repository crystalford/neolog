'use client'

export const runtime = 'edge'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Upload, Video as VideoIcon, FileAudio, Loader2, CheckCircle2, AlertCircle,
  Clock, Trash2, ChevronDown, ChevronUp, Play, Lightbulb,
  FolderOpen, Quote, Tag, Brain, Scissors, FileText, HelpCircle,
  Target, Users, BookOpen, Zap, Shield, MessageCircle, TrendingUp,
  AlertTriangle, X, Pause, RotateCcw, Layers, Sparkles, Grid, List, 
  Search, RefreshCw, MoreVertical, Calendar, Database, Check, ExternalLink,
  Cpu, Radio, Terminal
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

    if (await tryBlob(blob)) return

    const headRes = await fetch(videoUrl, { method: 'HEAD' }).catch(() => null)
    const fileSize = parseInt(headRes?.headers.get('content-length') || '0')
    if (fileSize > 3145728) {
      const lastChunk = await fetchChunk(`bytes=${fileSize - 3145728}-${fileSize - 1}`)
      if (await tryBlob(lastChunk)) return
    }

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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date')
  const [searchQuery, setSearchQuery] = useState('')
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

  const handleReset = async (id: string, mode: 'thumbnail' | 'full' = 'full') => {
    try {
      if (mode === 'thumbnail') {
        setProcessingIds(prev => new Set(prev).add(id))
        try {
          const urlRes = await fetch(`/api/video-upload/${id}/signed-url`)
          if (!urlRes.ok) throw new Error('Could not get video URL')
          const { signedUrl } = await urlRes.json()
          const thumbnail = await captureFrameFromVideoUrl(signedUrl)
          if (!thumbnail) throw new Error('Frame capture failed')
          const saveRes = await fetch(`/api/video-upload/${id}/thumbnail`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ thumbnail_url: thumbnail }),
          })
          if (!saveRes.ok) throw new Error('Failed to save thumbnail')
          setUploads(prev => prev.map(u => u.id === id ? { ...u, thumbnail_url: thumbnail, status: 'processed' } : u))
        } catch (err: any) {
          console.error(err)
        } finally {
          setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next })
        }
        return
      }
      await fetch('/api/video-upload/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, mode })
      })
      fetchUploads()
    } catch (err) { console.error('Reset failed:', err) }
  }

  const handleFixAllThumbnails = async () => {
    const isBroken = (u: UploadListItem) => !u.thumbnail_url || u.thumbnail_url.startsWith('data:image/svg') || u.thumbnail_url.includes('_placeholder');
    const missing = uploads.filter(isBroken)
    for (const item of missing) await handleReset(item.id, 'thumbnail')
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Permanently remove this recording signal?')) return
    const res = await fetch(`/api/video-upload?id=${id}`, { method: 'DELETE' })
    if (res.ok) {
      setUploads(prev => prev.filter(u => u.id !== id))
      if (selectedId === id) setSelectedId(null)
    }
  }

  const handleFiles = useCallback((files: FileList | File[]) => {
    const newItems: QueueItem[] = Array.from(files).map(file => {
      const id = crypto.randomUUID(); fileMap.current.set(id, file);
      return { id, fileName: file.name, fileSize: file.size, fileType: file.type, status: 'pending', progress: 0, thumbnail: null, recordedAt: null }
    })
    setQueue(prev => [...prev, ...newItems])
  }, [])

  useEffect(() => { fetchUploads() }, [fetchUploads])

  const sortedUploads = [...uploads]
    .filter(u => u.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.recorded_at || b.created_at).getTime() - new Date(a.recorded_at || a.created_at).getTime()
      if (sortBy === 'size') return b.file_size_bytes - a.file_size_bytes
      return a.file_name.localeCompare(b.file_name)
    })

  const selectedUpload = uploads.find(u => u.id === selectedId)

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      {/* Ambience */}
      <div className="absolute top-0 right-0 w-[50%] h-[500px] bg-gradient-to-bl from-[var(--accent)]/5 to-transparent pointer-events-none" />

      <div className="max-w-[1800px] mx-auto flex flex-col h-screen">
        
        {/* Header Bar */}
        <header className="px-8 py-6 border-b border-[var(--border-light)] flex items-center justify-between shrink-0 bg-[var(--bg-card)]/50 backdrop-blur-xl z-20">
          <div className="flex items-center gap-4">
             <div className="p-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--accent)]">
                <Database size={20} />
             </div>
             <div>
                <h1 className="text-xl font-bold tracking-tight">Signal Archive</h1>
                <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Media Ingestion & Intelligence Extraction</p>
             </div>
          </div>

          <div className="flex items-center gap-3">
             <div className="hidden md:flex bg-[var(--bg-secondary)] p-1 rounded-xl border border-[var(--border-light)] mr-4">
                {(['date', 'size', 'name'] as const).map(mode => (
                  <button 
                    key={mode} 
                    onClick={() => setSortBy(mode)} 
                    className={`px-4 py-1.5 text-[9px] font-mono uppercase tracking-[0.2em] rounded-lg transition-all ${sortBy === mode ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}
                  >
                    {mode}
                  </button>
                ))}
             </div>

             <button 
               onClick={handleFixAllThumbnails}
               className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-primary)] hover:border-[var(--accent)] transition-all text-[9px] font-bold uppercase tracking-widest"
             >
               <Zap size={14} className="text-blue-400" /> Fix Broken
             </button>

             <button onClick={fetchUploads} className="p-2 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
             </button>
          </div>
        </header>

        <div className="flex-1 flex overflow-hidden">
          
          {/* Sidebar: Archive List */}
          <aside className="w-full md:w-[400px] border-r border-[var(--border-light)] flex flex-col bg-[var(--bg-card)]/30">
             
             {/* Search box */}
             <div className="p-4 border-b border-[var(--border-light)]">
                <div className="relative group">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" size={14} />
                   <input 
                     type="text" 
                     placeholder="Search signals..." 
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     className="w-full h-10 bg-[var(--bg-secondary)]/50 border border-[var(--border-light)] rounded-xl pl-9 pr-4 text-xs focus:border-[var(--accent)]/50 outline-none transition-all"
                   />
                </div>
             </div>

             {/* Upload Dragger Mini */}
             <div 
               onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
               onDragLeave={() => setDragActive(false)}
               onDrop={(e) => { e.preventDefault(); setDragActive(false); handleFiles(e.dataTransfer.files) }}
               onClick={() => document.getElementById('file-input')?.click()}
               className={`m-4 p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer flex items-center justify-center gap-3 ${dragActive ? 'border-[var(--accent)] bg-[var(--accent)]/5 scale-[0.98]' : 'border-[var(--border-light)] hover:border-[var(--text-tertiary)] bg-[var(--bg-secondary)]/30'}`}
             >
                <input id="file-input" type="file" multiple accept="video/*" className="hidden" onChange={(e) => e.target.files && handleFiles(e.target.files)} />
                <Upload size={16} className="text-[var(--text-tertiary)]" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Drop New Signal</span>
             </div>

             {/* List */}
             <div className="flex-1 overflow-y-auto custom-scrollbar">
                {sortedUploads.map((item) => (
                   <button
                     key={item.id}
                     onClick={() => setSelectedId(item.id)}
                     className={`w-full p-4 border-b border-[var(--border-light)] flex items-start gap-4 transition-all hover:bg-[var(--bg-secondary)]/50 text-left relative group ${selectedId === item.id ? 'bg-[var(--bg-secondary)] border-l-4 border-l-[var(--accent)]' : ''}`}
                   >
                     <div className="w-20 aspect-video rounded-lg bg-[var(--bg-tertiary)] overflow-hidden shrink-0 border border-[var(--border-light)]">
                        {item.thumbnail_url ? <img src={item.thumbnail_url} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center"><VideoIcon size={20} className="text-[var(--text-tertiary)]/20" /></div>}
                     </div>
                     <div className="flex-1 min-w-0 py-0.5">
                        <p className={`text-xs font-bold truncate transition-colors ${selectedId === item.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'}`}>
                          {item.file_name?.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ') || 'Untitled'}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                           <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                             item.status === 'processed' ? 'border-emerald-500/20 text-emerald-500' : 
                             item.status === 'error' ? 'border-red-500/20 text-red-500' : 'border-blue-500/20 text-blue-500'
                           }`}>
                             {item.status}
                           </span>
                           <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{item.recorded_at ? formatDate(item.recorded_at) : formatDate(item.created_at)}</span>
                        </div>
                     </div>
                   </button>
                ))}
                {loading && (
                   <div className="p-8 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] animate-pulse">Syncing...</div>
                )}
             </div>
          </aside>

          {/* Main Area: Diagnostic View */}
          <main className="flex-1 overflow-y-auto bg-[var(--bg-primary)] custom-scrollbar">
             {selectedUpload ? (
                <div className="p-12 max-w-5xl mx-auto space-y-12">
                   
                   {/* Top Info Section */}
                   <div className="flex flex-col md:flex-row gap-8 items-start">
                      <div className="w-full md:w-[480px] aspect-video rounded-2xl bg-black border border-[var(--border-light)] overflow-hidden shadow-2xl relative group">
                         {selectedUpload.thumbnail_url ? (
                           <img src={selectedUpload.thumbnail_url} className="w-full h-full object-contain" />
                         ) : (
                           <div className="w-full h-full flex items-center justify-center"><VideoIcon size={40} className="text-[var(--bg-tertiary)]" /></div>
                         )}
                         <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-white border border-white/20 px-4 py-2 rounded-xl">Preview Coming Soon</span>
                         </div>
                      </div>

                      <div className="flex-1 space-y-6">
                         <div>
                            <p className="text-[10px] font-mono uppercase tracking-[0.4em] text-[var(--accent)] mb-2">Signal Identity</p>
                            <h2 className="text-3xl font-light tracking-tight">{selectedUpload.file_name}</h2>
                         </div>

                         <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)]">
                               <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)] mb-1">Temporal Alignment</p>
                               <p className="text-sm font-medium">{formatDate(selectedUpload.recorded_at || selectedUpload.created_at)}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)]">
                               <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)] mb-1">Duration</p>
                               <p className="text-sm font-medium">{formatDuration(selectedUpload.duration_seconds) || '--:--'}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)]">
                               <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)] mb-1">Payload Size</p>
                               <p className="text-sm font-medium">{formatBytes(selectedUpload.file_size_bytes)}</p>
                            </div>
                            <div className="p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-light)]">
                               <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)] mb-1">Signal Status</p>
                               <p className={`text-sm font-bold uppercase ${selectedUpload.status === 'processed' ? 'text-emerald-500' : 'text-amber-500'}`}>{selectedUpload.status}</p>
                            </div>
                         </div>
                         
                         <div className="flex items-center gap-3">
                            <button 
                              onClick={() => handleReset(selectedUpload.id, 'thumbnail')}
                              className="px-6 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[10px] font-bold uppercase tracking-widest transition-all hover:border-blue-400/50 hover:bg-blue-400/5"
                            >
                               Recapture Frame
                            </button>
                            <button 
                              onClick={() => handleReset(selectedUpload.id, 'full')}
                              className="px-6 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[10px] font-bold uppercase tracking-widest transition-all hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/5"
                            >
                               Full Reprocess
                            </button>
                            <button 
                              onClick={() => handleDelete(selectedUpload.id)}
                              className="px-6 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-[10px] font-bold uppercase tracking-widest transition-all hover:bg-red-500/20"
                            >
                               Purge Signal
                            </button>
                         </div>
                      </div>
                   </div>

                   {/* Intelligence Extraction Status */}
                   <div className="space-y-6">
                      <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--text-secondary)] flex items-center gap-2">
                        <Sparkles size={16} /> Intelligence Manifest
                      </h3>
                      
                      <div className="grid md:grid-cols-3 gap-6">
                         {[
                           { label: 'Transcript Recovery', desc: 'Raw signal to text conversion', status: selectedUpload.status === 'processed' ? 'VERIFIED' : 'PENDING', icon: <FileText size={18} />, color: '#10b981' },
                           { label: 'Feature Extraction', desc: 'Entities, Goals, and Topics', status: selectedUpload.status === 'processed' ? 'EXTRACTED' : 'PENDING', icon: <Cpu size={18} />, color: '#8b5cf6' },
                           { label: 'Neural Mapping', desc: 'Cross-corpus synthesis ready', status: selectedUpload.status === 'processed' ? 'QUALIFIED' : 'WAITING', icon: <Radio size={18} />, color: '#3b82f6' },
                         ].map((phase, i) => (
                            <div key={i} className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] space-y-4">
                               <div className="flex items-center justify-between">
                                  <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                                     {phase.icon}
                                  </div>
                                  <span className="text-[9px] font-mono font-bold tracking-[0.1em]" style={{ color: phase.color }}>{phase.status}</span>
                               </div>
                               <div>
                                  <h4 className="text-xs font-bold text-[var(--text-primary)]">{phase.label}</h4>
                                  <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{phase.desc}</p>
                               </div>
                            </div>
                         ))}
                      </div>
                   </div>

                   {/* Technical Diagnostics */}
                   <div className="p-8 rounded-[2rem] bg-[var(--bg-card)] border border-[var(--border-light)] font-mono">
                      <div className="flex items-center justify-between mb-8">
                         <h3 className="text-[10px] font-bold uppercase tracking-[0.3em] text-[var(--text-tertiary)] flex items-center gap-2">
                            <Terminal size={14} /> System Diagnostics
                         </h3>
                         <span className="text-[9px] text-[var(--text-tertiary)]">SIGNAL_ID: {selectedUpload.id}</span>
                      </div>
                      
                      <div className="space-y-2 text-[10px]">
                         <div className="flex justify-between border-b border-[var(--border-light)]/30 py-2">
                            <span className="text-[var(--text-tertiary)] font-bold">MIME_TYPE</span>
                            <span className="text-[var(--text-secondary)]">{selectedUpload.mime_type}</span>
                         </div>
                         <div className="flex justify-between border-b border-[var(--border-light)]/30 py-2">
                            <span className="text-[var(--text-tertiary)] font-bold">STORAGE_PROVIDER</span>
                            <span className="text-[var(--text-secondary)]">{selectedUpload.storage_provider || 'R2_NEURAL_SINK'}</span>
                         </div>
                         <div className="flex justify-between border-b border-[var(--border-light)]/30 py-2">
                            <span className="text-[var(--text-tertiary)] font-bold">CREATED_AT</span>
                            <span className="text-[var(--text-secondary)]">{selectedUpload.created_at}</span>
                         </div>
                         <div className="flex justify-between border-b border-[var(--border-light)]/30 py-2">
                            <span className="text-[var(--text-tertiary)] font-bold">PROCESSED_AT</span>
                            <span className="text-[var(--text-secondary)]">{selectedUpload.processed_at || 'SIGNAL_STALLED_OR_PENDING'}</span>
                         </div>
                         {selectedUpload.error_message && (
                            <div className="mt-4 p-4 rounded-xl bg-red-500/5 border border-red-500/20 text-red-100">
                               <p className="font-bold mb-1 uppercase tracking-widest text-[9px]">Critical Exception</p>
                               <p className="leading-relaxed">{selectedUpload.error_message}</p>
                            </div>
                         )}
                      </div>
                   </div>

                </div>
             ) : (
                <div className="h-full flex flex-col items-center justify-center p-12 text-center">
                   <div className="w-16 h-16 rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center text-[var(--text-tertiary)] mb-6 animate-pulse">
                      <Search size={32} />
                   </div>
                   <h2 className="text-xl font-bold text-[var(--text-primary)]">Archive Standby</h2>
                   <p className="text-sm text-[var(--text-tertiary)] mt-2 max-w-sm">
                      Select a signal from the left archive list to perform deep diagnostics and review extracted intelligence.
                   </p>
                </div>
             )}
          </main>
        </div>

        {/* Global Progress Overlay (Queue Mini-view) */}
        {queue.length > 0 && (
          <div className="fixed bottom-8 right-8 w-[320px] bg-[var(--bg-card)] border border-[var(--border-light)] rounded-[2rem] shadow-2xl p-6 z-[100] animate-in slide-in-from-bottom-8 duration-700 backdrop-blur-3xl">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                   <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                   <h3 className="text-[10px] font-bold uppercase tracking-widest">Active Ingestion</h3>
                </div>
                <button onClick={() => setQueue([])} className="text-[var(--text-tertiary)] hover:text-white"><X size={14} /></button>
             </div>
             <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {queue.map(item => (
                   <div key={item.id} className="space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                         <span className="font-bold truncate max-w-[150px]">{item.fileName}</span>
                         <span className={item.status === 'error' ? 'text-red-500' : 'text-blue-400'}>{item.status}</span>
                      </div>
                      <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                         <div 
                           className={`h-full transition-all duration-300 ${item.status === 'error' ? 'bg-red-500' : 'bg-blue-500'}`}
                           style={{ width: `${item.progress}%` }}
                         />
                      </div>
                   </div>
                ))}
             </div>
          </div>
        )}

      </div>
      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}</style>
    </div>
  )
}
