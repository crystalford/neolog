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
  'status' | 'tags' | 'error_message' | 'source_deleted' | 'processed_at' | 'recorded_at' | 'created_at' | 'updated_at'
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
  const [activeUploads, setActiveUploads] = useState<ActiveUpload[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VideoUpload | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [dragActive, setDragActive] = useState(false)
  const activeUploadsRef = useRef<ActiveUpload[]>([])
  activeUploadsRef.current = activeUploads

  const fetchUploads = useCallback(async () => {
    try {
      const res = await fetch('/api/video-upload')
      if (res.ok) {
        const data = await res.json()
        setUploads(data.uploads || [])
      }
    } catch (err) {
      console.error('Failed to fetch uploads:', err)
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
        const dateStr = hh ? `${y}-${m}-${d}T${hh}:${mm}:${ss}Z` : `${y}-${m}-${d}T12:00:00Z`;
        const inferred = new Date(dateStr);
        if (!isNaN(inferred.getTime())) {
          const iso = inferred.toISOString();
          console.log(`[Metadata] Filename extraction SUCCESS for ${name}: ${iso}`);
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
          
          const cleanVal = val.replace('UTC', '').trim();
          const d = new Date(cleanVal);
          // Standard check: is it a valid date between 1990 and 2100?
          if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
            dateCandidates.push({ key, val: cleanVal, date: d });
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
    const MAX_SIZE = 50 * 1024 * 1024 // 50MB
    for (const file of fileArray) {
      if (file.size > MAX_SIZE) {
        alert(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Supabase Standard projects have a 50MB limit. Please increase the limit in your project settings or upload a smaller file.`)
        continue
      }
      
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

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            MANAGE MEDIA
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Uploads
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Upload raw video or audio recordings. Neolog transcribes, analyzes, and extracts ideas, projects, and content.
          </p>
        </div>
        <a
          href="/dashboard/sessions"
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-medium)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-heavy)] transition-colors flex-shrink-0"
        >
          <Layers size={15} />
          Sessions
        </a>
      </div>

      {/* Upload Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all mb-6 ${
          dragActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border-medium)] hover:border-[var(--border-heavy)] bg-[var(--bg-card)]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <span className="text-4xl mx-auto mb-3 opacity-70 block text-center">📤</span>
        <p className="text-[var(--text-primary)] font-medium mb-1">
          Drop video or audio files here
        </p>
        <p className="text-sm text-[var(--text-tertiary)] mb-4">
          MP4, MOV, WebM, AVI, MP3, M4A, WAV — Max 50MB (Standard), uploads resume if interrupted
        </p>
        <label className="btn btn-primary btn-sm cursor-pointer inline-flex">
          Browse Files
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

              {/* Progress bar */}
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

      {/* Uploads List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : uploads.length === 0 && !hasActiveUploads ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <span className="text-4xl mx-auto mb-3 opacity-50 block text-center">🎬</span>
          <p className="font-medium">No uploads yet</p>
          <p className="text-sm mt-1">Upload a video to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {uploads.map(upload => {
            const status = statusConfig[upload.status] || statusConfig.uploaded
            const StatusIcon = status.icon
            const isExpanded = expandedId === upload.id
            const isAnimating = upload.status === 'transcribing' || upload.status === 'analyzing'
            const isVideo = upload.mime_type.startsWith('video/')

            return (
              <div
                key={upload.id}
                className="border border-[var(--border-medium)] rounded-xl bg-[var(--bg-card)] overflow-hidden"
              >
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                  onClick={() => upload.status === 'processed' && toggleExpand(upload.id)}
                >
                  <div className="flex-shrink-0">
                    {isVideo
                      ? <Video size={20} className="text-[var(--text-tertiary)]" />
                      : <FileAudio size={20} className="text-[var(--text-tertiary)]" />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {upload.file_name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--text-tertiary)]">{formatBytes(upload.file_size_bytes)}</span>
                      {upload.duration_seconds && (
                        <span className="text-xs text-[var(--text-tertiary)]">{formatDuration(upload.duration_seconds)}</span>
                      )}
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(upload.recorded_at || upload.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {upload.tags && upload.tags.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      {upload.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]">
                          {tag}
                        </span>
                      ))}
                      {upload.tags.length > 3 && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">+{upload.tags.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className={`flex items-center gap-1.5 flex-shrink-0 ${status.color}`}>
                    <StatusIcon size={14} className={isAnimating ? 'animate-spin' : ''} />
                    <span className="text-xs font-medium">{status.label}</span>
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

                {upload.status === 'error' && (
                  <div className="px-5 pb-4 pt-0 flex items-center gap-3">
                    <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2 flex-1">
                      {upload.error_message || 'Processing failed'}
                    </p>
                    <button
                      onClick={e => { e.stopPropagation(); handleReprocess(upload.id) }}
                      disabled={processingIds.has(upload.id)}
                      className="text-xs px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {processingIds.has(upload.id) ? 'Retrying...' : 'Retry'}
                    </button>
                  </div>
                )}

                {upload.status === 'uploaded' && (
                  <div className="px-5 pb-4 pt-0 flex items-center justify-end">
                    <button
                      onClick={e => { e.stopPropagation(); handleReprocess(upload.id) }}
                      disabled={processingIds.has(upload.id)}
                      className="text-xs px-4 py-2 rounded-lg bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium"
                    >
                      {processingIds.has(upload.id) ? (
                        <>
                           <Loader2 size={14} className="animate-spin" />
                           Queuing...
                        </>
                      ) : (
                        <>
                          <Zap size={14} />
                          Process Now
                        </>
                      )}
                    </button>
                  </div>
                )}

                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] px-5 py-5">
                    {!expandedData ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-[var(--text-tertiary)]" />
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

