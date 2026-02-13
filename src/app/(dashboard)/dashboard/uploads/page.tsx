'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Upload, Video, FileAudio, Loader2, CheckCircle2, AlertCircle,
  Clock, Trash2, ChevronDown, ChevronUp, Play, Lightbulb,
  FolderOpen, Quote, Tag, Brain, Scissors, FileText
} from 'lucide-react'
import type { VideoUpload } from '@/types/database'

type UploadListItem = Pick<VideoUpload,
  'id' | 'file_name' | 'file_size_bytes' | 'mime_type' | 'duration_seconds' |
  'status' | 'tags' | 'error_message' | 'source_deleted' | 'processed_at' | 'created_at' | 'updated_at'
>

export default function UploadsPage() {
  const [uploads, setUploads] = useState<UploadListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<VideoUpload | null>(null)
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
  const [dragActive, setDragActive] = useState(false)

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

  useEffect(() => {
    fetchUploads()
  }, [fetchUploads])

  // Poll for processing status updates
  useEffect(() => {
    if (processingIds.size === 0) return

    const interval = setInterval(async () => {
      await fetchUploads()

      // Check if any processing items are done
      setProcessingIds((prev: Set<string>) => {
        const next = new Set(prev)
        for (const id of prev) {
          const upload = uploads.find((u: UploadListItem) => u.id === id)
          if (upload && (upload.status === 'processed' || upload.status === 'error')) {
            next.delete(id)
          }
        }
        return next
      })
    }, 5000)

    return () => clearInterval(interval)
  }, [processingIds, uploads, fetchUploads])

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setUploading(true)

    for (const file of Array.from(files)) {
      try {
        setUploadProgress(`Uploading ${file.name}...`)

        const formData = new FormData()
        formData.append('file', file)

        const uploadRes = await fetch('/api/video-upload', {
          method: 'POST',
          body: formData,
        })

        if (!uploadRes.ok) {
          const err = await uploadRes.json()
          alert(`Upload failed: ${err.error}`)
          continue
        }

        const uploadData = await uploadRes.json()

        // Start processing
        setUploadProgress(`Processing ${file.name}...`)
        setProcessingIds((prev: Set<string>) => new Set(prev).add(uploadData.id))

        fetch('/api/video-upload/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_upload_id: uploadData.id }),
        }).catch(err => {
          console.error('Processing request failed:', err)
        })

        await fetchUploads()
      } catch (err) {
        console.error('Upload error:', err)
        alert('Upload failed. Please try again.')
      }
    }

    setUploading(false)
    setUploadProgress(null)
    await fetchUploads()
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this upload and all its data?')) return

    try {
      const res = await fetch(`/api/video-upload/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setUploads((prev: UploadListItem[]) => prev.filter((u: UploadListItem) => u.id !== id))
        if (expandedId === id) {
          setExpandedId(null)
          setExpandedData(null)
        }
      }
    } catch (err) {
      console.error('Delete error:', err)
    }
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
      return
    }

    setExpandedId(id)
    setExpandedData(null)

    try {
      const res = await fetch(`/api/video-upload/${id}`)
      if (res.ok) {
        const data = await res.json()
        setExpandedData(data.upload)
      }
    } catch (err) {
      console.error('Failed to fetch detail:', err)
    }
  }

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
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
    uploaded: { label: 'Uploaded', icon: Clock, color: 'text-[var(--text-tertiary)]' },
    transcribing: { label: 'Transcribing...', icon: Loader2, color: 'text-blue-400' },
    analyzing: { label: 'Analyzing...', icon: Brain, color: 'text-purple-400' },
    processed: { label: 'Processed', icon: CheckCircle2, color: 'text-green-400' },
    error: { label: 'Error', icon: AlertCircle, color: 'text-red-400' },
    deleting: { label: 'Deleting...', icon: Loader2, color: 'text-[var(--text-tertiary)]' },
    deleted: { label: 'Deleted', icon: Trash2, color: 'text-[var(--text-tertiary)]' },
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-2">
          Video Uploads
        </h2>
        <p className="text-[var(--text-secondary)]">
          Upload raw video or audio recordings. Neolog will transcribe, analyze, and extract ideas, projects, and shareable content.
        </p>
      </div>

      {/* Upload Zone */}
      <div
        className={`relative border-2 border-dashed rounded-xl p-10 text-center transition-all mb-8 ${
          dragActive
            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
            : 'border-[var(--border-medium)] hover:border-[var(--border-heavy)] bg-[var(--bg-card)]'
        }`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
            <p className="text-sm text-[var(--text-secondary)]">{uploadProgress}</p>
          </div>
        ) : (
          <>
            <Upload size={32} className="mx-auto mb-3 text-[var(--text-tertiary)]" />
            <p className="text-[var(--text-primary)] font-medium mb-1">
              Drop video or audio files here
            </p>
            <p className="text-sm text-[var(--text-tertiary)] mb-4">
              MP4, MOV, WebM, AVI, MP3, M4A, WAV — up to 500MB
            </p>
            <label className="btn btn-primary btn-sm cursor-pointer inline-flex">
              Browse Files
              <input
                type="file"
                className="hidden"
                accept="video/*,audio/*"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
              />
            </label>
          </>
        )}
      </div>

      {/* Uploads List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : uploads.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Video size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No uploads yet</p>
          <p className="text-sm mt-1">Upload a video to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {uploads.map((upload) => {
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
                {/* Row */}
                <div
                  className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                  onClick={() => upload.status === 'processed' && toggleExpand(upload.id)}
                >
                  {/* Icon */}
                  <div className="flex-shrink-0">
                    {isVideo ? (
                      <Video size={20} className="text-[var(--text-tertiary)]" />
                    ) : (
                      <FileAudio size={20} className="text-[var(--text-tertiary)]" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {upload.file_name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {formatBytes(upload.file_size_bytes)}
                      </span>
                      {upload.duration_seconds && (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          {formatDuration(upload.duration_seconds)}
                        </span>
                      )}
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {new Date(upload.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  {/* Tags */}
                  {upload.tags && upload.tags.length > 0 && (
                    <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                      {upload.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]"
                        >
                          {tag}
                        </span>
                      ))}
                      {upload.tags.length > 3 && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          +{upload.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Status */}
                  <div className={`flex items-center gap-1.5 flex-shrink-0 ${status.color}`}>
                    <StatusIcon size={14} className={isAnimating ? 'animate-spin' : ''} />
                    <span className="text-xs font-medium">{status.label}</span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {upload.status === 'processed' && (
                      <button className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDelete(upload.id)
                      }}
                      className="p-1.5 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Error message */}
                {upload.status === 'error' && upload.error_message && (
                  <div className="px-5 pb-4 pt-0">
                    <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                      {upload.error_message}
                    </p>
                  </div>
                )}

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] px-5 py-5">
                    {!expandedData ? (
                      <div className="flex items-center justify-center py-6">
                        <Loader2 size={18} className="animate-spin text-[var(--text-tertiary)]" />
                      </div>
                    ) : (
                      <UploadDetail upload={expandedData} />
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

function UploadDetail({ upload }: { upload: VideoUpload }) {
  const [activeTab, setActiveTab] = useState<'analysis' | 'transcript' | 'clips' | 'posts'>('analysis')

  const tabs = [
    { key: 'analysis', label: 'Analysis', icon: Brain },
    { key: 'transcript', label: 'Transcript', icon: FileText },
    { key: 'clips', label: 'Clips', icon: Scissors, count: upload.generated_clips?.length || 0 },
    { key: 'posts', label: 'Posts', icon: FileText, count: upload.generated_posts?.length || 0 },
  ] as const

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-5 border-b border-[var(--border-light)] pb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-lg transition-colors ${
                activeTab === tab.key
                  ? 'text-[var(--accent)] border-b-2 border-[var(--accent)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={13} />
              {tab.label}
              {'count' in tab && tab.count > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[10px]">
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Analysis Tab */}
      {activeTab === 'analysis' && upload.analysis && (
        <div className="space-y-5">
          {/* Summary */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Summary</h4>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{upload.analysis.summary}</p>
          </div>

          {/* Mood */}
          {upload.analysis.mood && (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[var(--bg-tertiary)] border border-[var(--border-light)]">
              <span className="text-xs text-[var(--text-tertiary)]">Mood:</span>
              <span className="text-xs font-medium text-[var(--text-primary)]">{upload.analysis.mood}</span>
            </div>
          )}

          {/* Categories */}
          {upload.analysis.categories && upload.analysis.categories.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <Tag size={12} /> Categories
              </h4>
              <div className="flex flex-wrap gap-2">
                {upload.analysis.categories.map((cat, i) => (
                  <span
                    key={i}
                    className="px-2.5 py-1 rounded-lg text-xs font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border border-[var(--border-light)]"
                  >
                    {cat.name}
                    <span className="ml-1 text-[var(--text-tertiary)]">
                      {Math.round(cat.confidence * 100)}%
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ideas */}
          {upload.analysis.ideas && upload.analysis.ideas.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <Lightbulb size={12} /> Ideas
              </h4>
              <ul className="space-y-1.5">
                {upload.analysis.ideas.map((idea, i) => (
                  <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">-</span>
                    {idea}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Projects */}
          {upload.analysis.projects && upload.analysis.projects.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <FolderOpen size={12} /> Projects
              </h4>
              <ul className="space-y-1.5">
                {upload.analysis.projects.map((project, i) => (
                  <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                    <span className="text-[var(--accent)] mt-1">-</span>
                    {project}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Items */}
          {upload.analysis.action_items && upload.analysis.action_items.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Action Items</h4>
              <ul className="space-y-1.5">
                {upload.analysis.action_items.map((item, i) => (
                  <li key={i} className="text-sm text-[var(--text-secondary)] flex items-start gap-2">
                    <CheckCircle2 size={14} className="text-[var(--text-tertiary)] mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Key Quotes */}
          {upload.analysis.key_quotes && upload.analysis.key_quotes.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2 flex items-center gap-1.5">
                <Quote size={12} /> Key Quotes
              </h4>
              <div className="space-y-2">
                {upload.analysis.key_quotes.map((quote, i) => (
                  <blockquote
                    key={i}
                    className="border-l-2 border-[var(--accent)] pl-3 py-1 text-sm text-[var(--text-secondary)] italic"
                  >
                    "{quote}"
                  </blockquote>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transcript Tab */}
      {activeTab === 'transcript' && (
        <div>
          {upload.transcript ? (
            <div className="max-h-[400px] overflow-y-auto">
              {upload.transcript_segments && upload.transcript_segments.length > 0 ? (
                <div className="space-y-2">
                  {upload.transcript_segments.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-[10px] text-[var(--text-tertiary)] font-mono pt-0.5 flex-shrink-0 w-14 text-right">
                        {formatTimestamp(seg.start)}
                      </span>
                      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{seg.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                  {upload.transcript}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No transcript available</p>
          )}
        </div>
      )}

      {/* Clips Tab */}
      {activeTab === 'clips' && (
        <div>
          {upload.generated_clips && upload.generated_clips.length > 0 ? (
            <div className="space-y-3">
              {upload.generated_clips.map((clip, i) => (
                <div
                  key={i}
                  className="border border-[var(--border-light)] rounded-lg p-4 bg-[var(--bg-primary)]"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h5 className="text-sm font-medium text-[var(--text-primary)]">{clip.title}</h5>
                    <span className="text-[10px] text-[var(--text-tertiary)] font-mono flex-shrink-0">
                      {formatTimestamp(clip.start)} - {formatTimestamp(clip.end)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{clip.transcript}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No clips suggested</p>
          )}
        </div>
      )}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <div>
          {upload.generated_posts && upload.generated_posts.length > 0 ? (
            <div className="space-y-3">
              {upload.generated_posts.map((post, i) => (
                <div
                  key={i}
                  className="border border-[var(--border-light)] rounded-lg p-4 bg-[var(--bg-primary)]"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[var(--accent)]/10 text-[var(--accent)]">
                      {post.type.replace('_', ' ')}
                    </span>
                  </div>
                  <h5 className="text-sm font-medium text-[var(--text-primary)] mb-1">{post.title}</h5>
                  <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{post.content}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">No posts generated</p>
          )}
        </div>
      )}
    </div>
  )
}

function formatTimestamp(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
