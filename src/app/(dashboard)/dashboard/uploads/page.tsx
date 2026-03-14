'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import * as tus from 'tus-js-client'
import {
  Upload, Video, FileAudio, Loader2, CheckCircle2, AlertCircle,
  Clock, Trash2, ChevronDown, ChevronUp, Play, Lightbulb,
  FolderOpen, Quote, Tag, Brain, Scissors, FileText, HelpCircle,
  Target, Users, BookOpen, Zap, Shield, MessageCircle, TrendingUp,
  AlertTriangle, X, Pause, RotateCcw, Layers, Sparkles
} from 'lucide-react'
import MediaInfoFactory from 'mediainfo.js'
import type { VideoUpload } from '@/types/database'
import { SessionDetail } from '@/components/SessionDetail'

type UploadListItem = Pick<VideoUpload,
  'id' | 'file_name' | 'file_size_bytes' | 'mime_type' | 'duration_seconds' |
  'status' | 'tags' | 'error_message' | 'source_deleted' | 'processed_at' | 'recorded_at' | 'created_at' | 'updated_at' | 'thumbnail_url'
>

type ActiveUpload = {
  id: string
  file: File
  storagePath: string
  progress: number        // 0-100
  bytesUploaded: number
  bytesTotal: number
  status: 'uploading' | 'paused' | 'complete' | 'error'
  error: string | null
  tusUpload: tus.Upload | null
  recordedAt: string | null
}

export default function UploadsPage() {
  const [uploads, setUploads] = useState<UploadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VideoUpload | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [reanalyzingIds, setReanalyzingIds] = useState<Set<string>>(new Set())
  const [reanalyzeAllState, setReanalyzeAllState] = useState<'idle' | 'running' | 'done'>('idle')
  const [dragActive, setDragActive] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [filterType, setFilterType] = useState<'all' | 'video' | 'audio'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'size' | 'name'>('date')
  const activeUploadsRef = useRef<ActiveUpload[]>([])
  activeUploadsRef.current = activeUploads

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/video-upload')
      if (res.ok) {
        const data = await res.json()
        setUploads(data.uploads || [])
        setFetchError(null)
      } else {
        const errData = await res.json().catch(() => ({ error: res.statusText }))
        const msg = errData.details || errData.error || `HTTP ${res.status}`
        console.error('Uploads fetch failed:', msg)
        setFetchError(msg)
      }
    } catch (err: any) {
      console.error('Failed to fetch uploads:', err)
      setFetchError(err.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchUploads() }, [fetchUploads])

  // Auto-expand based on ?id=... URL parameter
  useEffect(() => {
    if (loading || uploads.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const id = params.get('id')
    if (id && uploads.some(u => u.id === id)) {
      setExpandedId(id)
      // Clear the param after expansion to prevent multiple triggers if desired, 
      // but keeping it is fine for bookmarkability.
    }
  }, [loading, uploads])

  // Poll for processing status
  useEffect(() => {
    if (processingIds.size === 0) return
    const interval = setInterval(async () => {
      await fetchUploads()
      setProcessingIds(prev => {
        const next = new Set(prev)
        for (const id of prev) {
          const upload = uploads.find(u => u.id === id)
          if (upload && (upload.status === 'processed' || upload.status === 'error')) {
            next.delete(id)
          }
        }
        return next
      })
    }, 5000)
    return () => clearInterval(interval)
  }, [processingIds, uploads, fetchUploads])

  const extractVideoDate = async (file: File): Promise<string | null> => {
    let mediainfo: any;
    console.log(`[Metadata] Starting raw extraction for: ${file.name}`);
    
    // 1. FAST PATH: Filename inference
    const name = file.name;
    const dateMatches = [
      /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/, // 20240128_123456
      /(\d{4})-(\d{2})-(\d{2})/,                    // 2024-01-28
      /(\d{4})(\d{2})(\d{2})/,                       // 20240128
    ];

    for (const regex of dateMatches) {
      const match = name.match(regex);
      if (match) {
        const [_, y, m, d, hh, mm, ss] = match;
        // CRITICAL: Construct as a LOCAL date object by using number arguments
        const inferred = new Date(
          parseInt(y),
          parseInt(m) - 1,
          parseInt(d),
          parseInt(hh || "12"),
          parseInt(mm || "0"),
          parseInt(ss || "0")
        );
        
        if (!isNaN(inferred.getTime())) {
          const iso = inferred.toISOString();
          console.log(`[Metadata] Filename extraction SUCCESS for ${name}: ${iso} (interpreted as Local)`);
          return iso;
        }
      }
    }

    // 2. SLOW PATH: Binary metadata extraction
    try {
      // Use explicit version and ensure WASM is reachable
      const wasmUrl = "https://unpkg.com/mediainfo.js@0.2.1/dist/MediaInfoModule.wasm";
      console.log(`[Metadata] Fetching MediaInfo WASM from: ${wasmUrl}`);
      
      mediainfo = await (MediaInfoFactory as any)({ 
        format: 'object',
        locateFile: (path: string) => path.endsWith('.wasm') ? wasmUrl : path
      });
      
      if (!mediainfo) {
        throw new Error("MediaInfoFactory returned null");
      }

      const getSize = () => file.size;
      const readChunk = (chunkSize: number, offset: number) =>
        new Promise<Uint8Array>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(new Uint8Array(e.target?.result as ArrayBuffer));
          reader.onerror = reject;
          reader.readAsArrayBuffer(file.slice(offset, offset + chunkSize));
        });

      console.log(`[Metadata] Analyzing binary header for ${file.name}...`);
      const info = await mediainfo.analyzeData(getSize, readChunk);
      
      if (!info?.media?.track) {
        console.warn("[Metadata] Binary analysis found zero tracks.");
        return null;
      }

      const dateCandidates: { key: string; val: string; date: Date }[] = [];
      const priorityKeys = [
        'Encoded_Date', 
        'Tagged_Date', 
        'Encoded_Date_Original', 
        'Creation_Date', 
        'Media_Create_Date',
        'com.apple.quicktime.creationdate'
      ];
      
      for (const track of info.media.track) {
        for (const [key, val] of Object.entries(track)) {
          if (typeof val !== 'string' || val.length < 8) continue;
          
          // MediaInfo often gives "UTC 2026-03-01 21:16:00"
          // If we pass this directly to new Date(), it usually handles it correctly as UTC.
          // If it lacks UTC, we check if it's a priority key (usually UTC in MP4).
          const d = new Date(val);
          if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
            dateCandidates.push({ key, val, date: d });
          }
        }
      }

      if (dateCandidates.length > 0) {
        let finalDate: string | null = null;
        let finalKey: string | null = null;

        // Priority find
        for (const pk of priorityKeys) {
          const match = dateCandidates.find(c => c.key === pk);
          if (match) {
            finalDate = match.date.toISOString();
            finalKey = pk;
            break;
          }
        }
        
        if (!finalDate) {
          dateCandidates.sort((a, b) => a.date.getTime() - b.date.getTime());
          finalDate = dateCandidates[0].date.toISOString();
          finalKey = `earliest (${dateCandidates[0].key})`;
        }

        console.log(`[Metadata] Binary extraction SUCCESS for ${file.name}: ${finalDate} (via ${finalKey})`);
        return finalDate;
      }

      console.warn(`[Metadata] NO DATE FOUND in ${file.name}. Falling back to upload date.`);
      return null;
    } catch (error: any) {
      console.error(`[Metadata] EXTRACTION ERROR for ${file.name}:`, error);
      return null;
    } finally {
      if (mediainfo) mediainfo.close();
    }
  };

  const startTusUpload = useCallback(async (file: File, sessionId?: string, preextractedDate?: string | null) => {
    // Ensure bucket exists and has correct fileSizeLimit (updates on every call)
    await fetch('/api/video-upload/prepare').catch(() => {/* non-fatal */})

    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const timestamp = Date.now()
    const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${session.user.id}/videos/${timestamp}_${sanitizedName}`
    const uploadId = crypto.randomUUID()

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const projectId = supabaseUrl.replace('https://', '').replace('.supabase.co', '')

    const activeUpload: ActiveUpload = {
      id: uploadId,
      file,
      storagePath,
      progress: 0,
      bytesUploaded: 0,
      bytesTotal: file.size,
      status: 'uploading',
      error: null,
      tusUpload: null,
      recordedAt: preextractedDate || null,
    }

    setActiveUploads(prev => [...prev, activeUpload])

    const updateUpload = (patch: Partial<ActiveUpload>) => {
      setActiveUploads(prev => prev.map(u => u.id === uploadId ? { ...u, ...patch } : u))
    }

    const tusUpload = new tus.Upload(file, {
      endpoint: `https://${projectId}.supabase.co/storage/v1/upload/resumable`,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        'x-upsert': 'true',
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'videos',
        objectName: storagePath,
        contentType: file.type,
        cacheControl: '86400',
      },
      chunkSize: 6 * 1024 * 1024, // 6MB — Supabase TUS requirement
      onError: (error) => {
        console.error('TUS upload error:', error)
        updateUpload({ status: 'error', error: error.message })
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        const progress = Math.round((bytesUploaded / bytesTotal) * 100)
        updateUpload({ progress, bytesUploaded, bytesTotal })
      },
      onSuccess: async () => {
        updateUpload({ status: 'complete', progress: 100 })

        // Register with backend → creates DB record + fires Inngest
        try {
          const payload = {
            storage_path: storagePath,
            file_name: file.name,
            file_size_bytes: file.size,
            mime_type: file.type,
            recorded_at: preextractedDate || null,
            ...(sessionId ? { session_id: sessionId } : {}),
          };
          console.log('[Upload] Registering with payload:', payload);

          const res = await fetch('/api/video-upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            const data = await res.json()
            setProcessingIds(prev => new Set(prev).add(data.id))
            await fetchUploads()

            // Remove from active uploads after a short delay ONLY if successful
            setTimeout(() => {
              setActiveUploads(prev => prev.filter(u => u.id !== uploadId))
            }, 2000)
          } else if (res.status === 409) {
            // Duplicate file
            const errData = await res.json().catch(() => ({ message: 'Duplicate file' }))
            const proceed = confirm(`${errData.message}\n\nClick OK to upload anyway, Cancel to skip.`)
            if (proceed) {
              // Re-POST with force flag to bypass duplicate check
              const res2 = await fetch('/api/video-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payload, force: true }),
              })
              if (res2.ok) {
                const data = await res2.json()
                setProcessingIds(prev => new Set(prev).add(data.id))
                await fetchUploads()
                setTimeout(() => {
                  setActiveUploads(prev => prev.filter(u => u.id !== uploadId))
                }, 2000)
              } else {
                const e2 = await res2.json().catch(() => ({ error: res2.statusText }))
                updateUpload({ status: 'error', error: e2.error || 'Failed' })
              }
            } else {
              // User chose to skip — remove from active uploads cleanly
              setActiveUploads(prev => prev.filter(u => u.id !== uploadId))
            }
          } else {
            // Display error and leave it in activeUploads so user can see it
            const errData = await res.json().catch(() => ({ error: res.statusText }));
            console.error('API Error:', res.status, errData);
            updateUpload({ status: 'error', error: errData.error || `Failed with status ${res.status}` });
          }
        } catch (err: any) {
          console.error('Failed to register upload:', err)
          updateUpload({ status: 'error', error: err.message || 'Network error occurred' });
        }
      },
    })

    updateUpload({ tusUpload })

    // Resume any previous upload for this file
    tusUpload.findPreviousUploads().then(previous => {
      if (previous.length) tusUpload.resumeFromPreviousUpload(previous[0])
      tusUpload.start()
    })
  }, [fetchUploads])

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    for (const file of fileArray) {
      // NEW: Extract metadata in browser first
      const recordedAt = await extractVideoDate(file);
      console.log(`Detected date for ${file.name}:`, recordedAt);
      
      startTusUpload(file, undefined, recordedAt)
    }
  }, [startTusUpload])

  const handlePauseResume = (upload: ActiveUpload) => {
    if (!upload.tusUpload) return
    if (upload.status === 'uploading') {
      upload.tusUpload.abort()
      setActiveUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'paused' } : u))
    } else if (upload.status === 'paused') {
      upload.tusUpload.start()
      setActiveUploads(prev => prev.map(u => u.id === upload.id ? { ...u, status: 'uploading' } : u))
    }
  }

  const handleCancelUpload = (upload: ActiveUpload) => {
    if (upload.tusUpload) upload.tusUpload.abort()
    setActiveUploads(prev => prev.filter(u => u.id !== upload.id))
  }

  const handleReprocess = async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id))
    const res = await fetch('/api/video-upload/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_upload_id: id }),
    })
    if (!res.ok) {
      setProcessingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  const handleReanalyze = async (id: string) => {
    setReanalyzingIds(prev => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/video-upload/${id}/reanalyze`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Re-analysis failed')
      }
    } catch {}
    finally {
      setReanalyzingIds(prev => { const next = new Set(prev); next.delete(id); return next })
    }
  }

  const handleReanalyzeAll = async () => {
    if (!confirm('Re-analyze all processed uploads with the updated AI prompt? This will extract new entity types (decisions, values, tools, principles, etc.) from your existing transcripts. May take a few minutes.')) return
    setReanalyzeAllState('running')
    try {
      const res = await fetch('/api/video-upload/reanalyze-all', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        setReanalyzeAllState('done')
      } else {
        alert(data.error || 'Failed to trigger re-analysis')
        setReanalyzeAllState('idle')
      }
    } catch {
      setReanalyzeAllState('idle')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this upload and all its data?')) return
    const res = await fetch(`/api/video-upload/${id}`, { method: 'DELETE' })
    if (res.ok) {
      setUploads(prev => prev.filter(u => u.id !== id))
      if (expandedId === id) { setExpandedId(null); setExpandedData(null) }
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedData(null); return }
    setExpandedId(id)
    setExpandedData(null)
    const res = await fetch(`/api/video-upload/${id}`)
    if (res.ok) {
      const data = await res.json()
      setExpandedData(data.upload)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const statusConfig: Record<string, { label: string; icon: typeof Loader2; color: string }> = {
    uploaded:    { label: 'Uploaded',       icon: Clock,        color: 'text-[var(--text-tertiary)]' },
    transcribing:{ label: 'Transcribing...', icon: Loader2,      color: 'text-blue-400' },
    analyzing:   { label: 'Analyzing...',    icon: Brain,        color: 'text-purple-400' },
    processed:   { label: 'Processed',       icon: CheckCircle2, color: 'text-green-400' },
    error:       { label: 'Error',           icon: AlertCircle,  color: 'text-red-400' },
    deleting:    { label: 'Deleting...',     icon: Loader2,      color: 'text-[var(--text-tertiary)]' },
    deleted:     { label: 'Deleted',         icon: Trash2,       color: 'text-[var(--text-tertiary)]' },
  }

  const hasActiveUploads = activeUploads.length > 0

  const filteredUploads = uploads
    .filter(u => {
      if (filterType === 'video') return u.mime_type.startsWith('video/')
      if (filterType === 'audio') return u.mime_type.startsWith('audio/')
      return true
    })
    .filter(u => u.file_name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === 'date') return new Date(b.recorded_at || b.created_at).getTime() - new Date(a.recorded_at || a.created_at).getTime()
      if (sortBy === 'size') return b.file_size_bytes - a.file_size_bytes
      return a.file_name.localeCompare(b.file_name)
    })

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12">
      {/* Header */}
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-light tracking-tight text-[var(--text-primary)] mb-2">
            Uploads
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] max-w-lg leading-relaxed">
            All your videos and audio — drop files to upload, then view what was extracted.
          </p>
        </div>
        <button
          onClick={handleReanalyzeAll}
          disabled={reanalyzeAllState === 'running'}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium border border-[var(--border-light)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/5 transition-all disabled:opacity-50 whitespace-nowrap"
        >
          {reanalyzeAllState === 'running' ? (
            <><Loader2 size={13} className="animate-spin" /> Re-analyzing...</>
          ) : reanalyzeAllState === 'done' ? (
            <><Sparkles size={13} className="text-green-400" /> Queued</>
          ) : (
            <><Brain size={13} /> Re-analyze all</>
          )}
        </button>
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row gap-4 mb-8 bg-[var(--bg-card)] p-4 rounded-2xl border border-[var(--border-light)] shadow-sm">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
             <input 
               type="text" 
               placeholder="Search files..."
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="w-full bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl py-2 pl-9 pr-4 text-sm focus:outline-none focus:border-[var(--accent)] transition-all"
             />
             <Layers size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          </div>
          <select 
            value={sortBy} 
            onChange={e => setSortBy(e.target.value as any)}
            className="bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)]"
          >
            <option value="date">Sort: Date</option>
            <option value="size">Sort: Size</option>
            <option value="name">Sort: Name</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)]">
           <button 
             onClick={() => setFilterType('all')}
             className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'all' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
           >
             All
           </button>
           <button 
             onClick={() => setFilterType('video')}
             className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'video' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
           >
             Video
           </button>
           <button 
             onClick={() => setFilterType('audio')}
             className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${filterType === 'audio' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
           >
             Audio
           </button>
        </div>

        <div className="flex items-center gap-1.5 p-1 bg-[var(--bg-primary)] rounded-xl border border-[var(--border-light)]">
           <button 
             onClick={() => setViewMode('grid')}
             className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-tertiary)]'}`}
           >
             <Layers size={14} />
           </button>
           <button 
             onClick={() => setViewMode('list')}
             className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-[var(--accent)] text-white shadow-md' : 'text-[var(--text-tertiary)]'}`}
           >
             <X size={14} className="rotate-45" />
           </button>
        </div>
      </div>

      {/* Upload Zone */}
      <div
        className={`relative border-2 border-dashed rounded-3xl p-12 text-center transition-all mb-10 ${
          dragActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/5 shadow-inner'
            : 'border-[var(--border-light)] hover:border-[var(--accent)]/50 bg-[var(--bg-card)]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <div className="w-16 h-16 bg-[var(--accent)]/5 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[var(--accent)]/10">
          <Upload size={32} className="text-[var(--accent)]" />
        </div>
        <p className="text-[var(--text-primary)] text-lg font-light tracking-tight mb-1">
          Drop files to ingest
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mb-6 opacity-60">
          MP4, MOV, MP3, M4A — up to 5GB
        </p>
        <label className="btn btn-primary px-8 rounded-xl cursor-pointer inline-flex shadow-lg shadow-[var(--accent)]/20">
          Select Files
          <input
            type="file"
            className="hidden"
            accept="video/*,audio/*"
            multiple
            onChange={e => e.target.files && handleFiles(e.target.files)}
          />
        </label>
      </div>

      {/* Active Uploads */}
      {hasActiveUploads && (
        <div className="mb-6 space-y-3">
          {activeUploads.map(upload => (
            <div
              key={upload.id}
              className="border border-[var(--border-medium)] rounded-xl bg-[var(--bg-card)] px-5 py-4"
            >
              <div className="flex items-center gap-3 mb-3">
                <Video size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
                <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">
                  {upload.file.name}
                </span>
                <span className="text-xs text-[var(--text-tertiary)] flex-shrink-0">
                  {formatBytes(upload.bytesUploaded)} / {formatBytes(upload.bytesTotal)}
                </span>
                <button
                  onClick={() => handlePauseResume(upload)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  title={upload.status === 'uploading' ? 'Pause' : 'Resume'}
                >
                  {upload.status === 'uploading' ? <Pause size={14} /> : <RotateCcw size={14} />}
                </button>
                <button
                  onClick={() => handleCancelUpload(upload)}
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                  title="Cancel"
                >
                  <X size={14} />
                </button>
              </div>

              <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    upload.status === 'complete' ? 'bg-green-400' :
                    upload.status === 'error' ? 'bg-red-400' :
                    upload.status === 'paused' ? 'bg-[var(--text-tertiary)]' :
                    'bg-[var(--accent)]'
                  }`}
                  style={{ width: `${upload.progress}%` }}
                />
              </div>

              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                  {upload.status === 'complete' ? 'Upload complete — queued for processing' :
                   upload.status === 'error' ? upload.error :
                   upload.status === 'paused' ? 'Paused' :
                   `${upload.progress}%`}
                  {upload.recordedAt && (
                    <span className="flex items-center gap-1 text-[var(--accent)] ml-2">
                      <Sparkles size={10} /> Recorded: {new Date(upload.recordedAt).toLocaleDateString()}
                    </span>
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main List/Grid */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 size={32} className="animate-spin text-[var(--accent)] opacity-40" />
          <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Loading...</p>
        </div>
      ) : fetchError ? (
        <div className="text-center py-32 bg-[var(--bg-card)] rounded-3xl border border-red-400/20 border-dashed">
          <div className="w-16 h-16 bg-red-400/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={32} className="text-red-400/60" />
          </div>
          <p className="text-[var(--text-primary)] font-medium">Could not load uploads</p>
          <p className="text-xs font-mono text-red-400/70 mt-2 max-w-md mx-auto px-4">{fetchError}</p>
          <button
            onClick={() => { setLoading(true); fetchUploads() }}
            className="mt-6 px-4 py-2 rounded-lg text-sm border border-[var(--border-light)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 transition-all"
          >
            Retry
          </button>
        </div>
      ) : filteredUploads.length === 0 && !hasActiveUploads ? (
        <div className="text-center py-32 bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] border-dashed">
          <div className="w-16 h-16 bg-[var(--bg-secondary)] rounded-full flex items-center justify-center mx-auto mb-4 opacity-50">
             <Video size={32} className="text-[var(--text-tertiary)]" />
          </div>
          <p className="text-[var(--text-primary)] font-medium">No uploads yet</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">Drop files above to get started.</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" : "space-y-3"}>
          {filteredUploads.map(upload => {
            const status = statusConfig[upload.status] || statusConfig.uploaded
            const StatusIcon = status.icon
            const isExpanded = expandedId === upload.id
            const isAnimating = upload.status === 'transcribing' || upload.status === 'analyzing'
            const isVideo = upload.mime_type.startsWith('video/')

            if (viewMode === 'grid') {
              return (
                <div 
                  key={upload.id}
                  className={`group relative bg-[var(--bg-card)] border rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-xl hover:shadow-[var(--accent)]/5 ${isExpanded ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/20 shadow-md' : 'border-[var(--border-light)]'}`}
                >
                  <div className="aspect-video relative bg-[var(--bg-secondary)] overflow-hidden cursor-pointer" onClick={() => upload.status === 'processed' && toggleExpand(upload.id)}>
                    {upload.thumbnail_url ? (
                      <img src={upload.thumbnail_url} alt="" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-30 group-hover:opacity-50 transition-opacity">
                         {isVideo ? <Video size={32} /> : <FileAudio size={32} />}
                         <span className="text-[10px] font-mono tracking-widest uppercase">{isVideo ? 'Video' : 'Audio'}</span>
                      </div>
                    )}
                    
                    <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-black/40 backdrop-blur-md border border-white/10 text-white text-[10px] font-medium transition-all">
                      <StatusIcon size={11} className={isAnimating ? 'animate-spin' : ''} />
                      {status.label}
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-between text-white">
                       <span className="text-[10px] font-mono shadow-sm">{formatBytes(upload.file_size_bytes)}</span>
                       {upload.duration_seconds && (
                         <span className="text-[10px] font-mono shadow-sm">{formatDuration(upload.duration_seconds)}</span>
                       )}
                    </div>
                  </div>

                  <div className="p-4">
                     <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate mb-2 group-hover:text-[var(--accent)] transition-colors" title={upload.file_name}>
                        {upload.file_name}
                     </h3>
                     
                     <div className="flex items-center justify-between text-[11px] text-[var(--text-tertiary)] mb-4">
                        <span className="flex items-center gap-1">
                           <Clock size={10} />
                           {new Date(upload.recorded_at || upload.created_at).toLocaleDateString()}
                        </span>
                        {upload.tags && upload.tags.length > 0 && (
                          <span className="px-1.5 py-0.5 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-medium">
                            {upload.tags[0]}
                          </span>
                        )}
                     </div>

                     <div className="flex items-center gap-2">
                        {upload.status === 'processed' ? (
                          <>
                            <button
                              onClick={() => toggleExpand(upload.id)}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase border border-[var(--border-light)] hover:border-[var(--accent)]/30 hover:bg-[var(--accent)]/5 transition-all"
                            >
                              {isExpanded ? 'Collapse' : 'Details'}
                            </button>
                            <button
                              onClick={() => handleReanalyze(upload.id)}
                              disabled={reanalyzingIds.has(upload.id)}
                              title="Re-run AI analysis to extract new entity types"
                              className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)] transition-all border border-transparent hover:border-[var(--accent)]/20 disabled:opacity-40"
                            >
                              {reanalyzingIds.has(upload.id)
                                ? <Loader2 size={13} className="animate-spin" />
                                : <Brain size={13} />}
                            </button>
                          </>
                        ) : upload.status === 'error' ? (
                           <button 
                              onClick={() => handleReprocess(upload.id)}
                              disabled={processingIds.has(upload.id)}
                              className="flex-1 py-1.5 rounded-lg text-[10px] font-bold tracking-widest uppercase bg-red-400/10 text-red-500 hover:bg-red-400/20 transition-all border border-red-400/20"
                           >
                              {processingIds.has(upload.id) ? 'Retrying...' : 'Retry'}
                           </button>
                        ) : (
                          <div className="flex-1 py-1.5 text-center text-[10px] font-mono text-[var(--text-tertiary)] italic">
                            Processing...
                          </div>
                        )}
                        <button 
                          onClick={() => handleDelete(upload.id)}
                          className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-red-400/10 hover:text-red-400 transition-all border border-transparent hover:border-red-400/20"
                        >
                          <Trash2 size={14} />
                        </button>
                     </div>
                  </div>

                  {isExpanded && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-10 bg-black/60 backdrop-blur-sm shadow-2xl" onClick={() => setExpandedId(null)}>
                       <div className="bg-[var(--bg-primary)] w-full max-w-4xl max-h-full rounded-3xl overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-between p-6 border-b border-[var(--border-light)] bg-[var(--bg-secondary)]">
                             <div>
                               <h2 className="text-xl font-medium text-[var(--text-primary)]">{upload.file_name}</h2>
                               <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest mt-1">{new Date(upload.recorded_at || upload.created_at).toLocaleDateString()}</p>
                             </div>
                             <button onClick={() => setExpandedId(null)} className="p-2 rounded-full hover:bg-[var(--bg-tertiary)] transition-all">
                               <X size={20} className="text-[var(--text-secondary)]" />
                             </button>
                          </div>
                          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                             {!expandedData ? (
                               <div className="flex flex-col items-center justify-center py-20 gap-4">
                                 <Loader2 size={32} className="animate-spin text-[var(--accent)] opacity-40" />
                                 <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Loading...</p>
                               </div>
                             ) : (
                               <SessionDetail upload={expandedData} />
                             )}
                          </div>
                       </div>
                    </div>
                  )}
                </div>
              )
            }

            return (
              <div
                key={upload.id}
                className={`border rounded-xl bg-[var(--bg-card)] overflow-hidden transition-all ${isExpanded ? 'border-[var(--accent)] ring-1 ring-[var(--accent)]/10' : 'border-[var(--border-light)]'}`}
              >
                <div
                  className="flex items-center gap-4 px-5 py-3 cursor-pointer hover:bg-[var(--bg-tertiary)]/50 transition-colors"
                  onClick={() => upload.status === 'processed' && toggleExpand(upload.id)}
                >
                  <div className="w-10 h-10 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center flex-shrink-0 border border-[var(--border-light)]">
                    {isVideo ? <Video size={18} className="text-[var(--text-tertiary)]" /> : <FileAudio size={18} className="text-[var(--text-tertiary)]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">{upload.file_name}</p>
                    <div className="flex items-center gap-3 mt-0.5 opacity-60">
                      <span className="text-[10px] font-mono">{formatBytes(upload.file_size_bytes)}</span>
                      <span className="text-[10px] font-mono">{new Date(upload.recorded_at || upload.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  <div className={`hidden sm:flex items-center gap-1.5 flex-shrink-0 ${status.color}`}>
                    <StatusIcon size={12} className={isAnimating ? 'animate-spin' : ''} />
                    <span className="text-[10px] font-mono uppercase tracking-[0.1em]">{status.label}</span>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {upload.status === 'processed' && (
                      <button className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(upload.id) }}
                      className="p-1.5 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] p-8 bg-[var(--bg-primary)]">
                    {!expandedData ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-[var(--accent)]" />
                      </div>
                    ) : (
                      <SessionDetail upload={expandedData} />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

