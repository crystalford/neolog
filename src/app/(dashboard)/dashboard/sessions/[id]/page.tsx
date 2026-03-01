'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, CheckCircle2, AlertCircle, Clock, Video,
  FileAudio, Sparkles, Scissors, Download, Play, ChevronDown,
  ChevronUp, Brain, Zap, Tag, TrendingUp, Film,
} from 'lucide-react'
import type { ClipSession, VideoUpload, EditPlan, ClipSynthesis } from '@/types/database'

type SessionClip = Pick<VideoUpload,
  'id' | 'file_name' | 'file_size_bytes' | 'mime_type' | 'duration_seconds' |
  'status' | 'tags' | 'analysis' | 'processed_at' | 'created_at'
>

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [session, setSession] = useState<ClipSession | null>(null)
  const [clips, setClips] = useState<SessionClip[]>([])
  const [loading, setLoading] = useState(true)
  const [synthesizing, setSynthesizing] = useState(false)
  const [assembling, setAssembling] = useState<string | null>(null) // edit_plan_id being assembled
  const [expandedPlan, setExpandedPlan] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')

  const fetchSession = useCallback(async () => {
    const res = await fetch(`/api/clip-sessions/${id}`)
    if (res.ok) {
      const data = await res.json()
      setSession(data.session)
      setClips(data.clips || [])
      setTitleInput(data.session.title || '')
    }
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // Poll while processing
  useEffect(() => {
    if (!session) return
    if (session.status !== 'processing') return
    const interval = setInterval(fetchSession, 4000)
    return () => clearInterval(interval)
  }, [session, fetchSession])

  const allProcessed = clips.length > 0 && clips.every(c => c.status === 'processed')
  const processedCount = clips.filter(c => c.status === 'processed').length

  const handleSynthesize = async () => {
    setSynthesizing(true)
    await fetch(`/api/clip-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'synthesize' }),
    })
    await fetchSession()
    setSynthesizing(false)
  }

  const handleAssemble = async (planId: string) => {
    setAssembling(planId)
    await fetch(`/api/clip-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'assemble', edit_plan_id: planId }),
    })
    setAssembling(null)
  }

  const handleDownload = async (planId: string) => {
    const res = await fetch(`/api/clip-sessions/${id}/download?plan_id=${planId}`)
    if (res.ok) {
      const data = await res.json()
      const a = document.createElement('a')
      a.href = data.url
      a.download = `${data.title}.mp4`
      a.click()
    }
  }

  const handleSaveTitle = async () => {
    await fetch(`/api/clip-sessions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput }),
    })
    setEditingTitle(false)
    await fetchSession()
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    )
  }

  if (!session) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-[var(--text-tertiary)]">Session not found.</p>
      </div>
    )
  }

  const synthesis = session.synthesis as ClipSynthesis | null
  const editPlans = (session.edit_plans as EditPlan[]) || []

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/sessions"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mb-4 transition-colors"
        >
          <ArrowLeft size={14} />
          Sessions
        </Link>

        <div className="flex items-start gap-3">
          <div className="flex-1">
            {editingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={e => setTitleInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
                  className="input text-xl font-bold flex-1"
                  autoFocus
                />
                <button onClick={handleSaveTitle} className="btn btn-primary btn-sm">Save</button>
                <button onClick={() => setEditingTitle(false)} className="btn btn-sm">Cancel</button>
              </div>
            ) : (
              <h2
                className="text-2xl font-display font-bold text-[var(--text-primary)] cursor-pointer hover:text-[var(--accent)] transition-colors"
                onClick={() => setEditingTitle(true)}
                title="Click to rename"
              >
                {session.title || `Session — ${new Date(session.created_at).toLocaleDateString()}`}
              </h2>
            )}
            <p className="text-sm text-[var(--text-tertiary)] mt-1">
              {clips.length} clip{clips.length !== 1 ? 's' : ''} · {processedCount} processed
              {session.total_duration_seconds && ` · ${Math.round(session.total_duration_seconds / 60)} min total`}
            </p>
          </div>

          {/* Synthesize button */}
          {session.status === 'collecting' && allProcessed && clips.length >= 2 && (
            <button
              onClick={handleSynthesize}
              disabled={synthesizing}
              className="btn btn-primary flex items-center gap-2 flex-shrink-0"
            >
              {synthesizing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
              Synthesize
            </button>
          )}
          {session.status === 'processing' && (
            <div className="flex items-center gap-2 text-sm text-blue-400 flex-shrink-0">
              <Loader2 size={15} className="animate-spin" />
              Synthesizing...
            </div>
          )}
          {session.status === 'synthesized' && (
            <div className="flex items-center gap-2 text-sm text-green-400 flex-shrink-0">
              <CheckCircle2 size={15} />
              Synthesized
            </div>
          )}
        </div>

        {session.status === 'collecting' && clips.length > 0 && !allProcessed && (
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            Waiting for {clips.length - processedCount} clip{clips.length - processedCount !== 1 ? 's' : ''} to finish processing before you can synthesize.
          </p>
        )}
        {session.status === 'collecting' && clips.length < 2 && (
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            Add at least 2 clips to enable synthesis. <Link href="/dashboard/uploads" className="text-[var(--accent)] hover:underline">Upload clips</Link>
          </p>
        )}
      </div>

      {/* Synthesis Results */}
      {session.status === 'synthesized' && synthesis && (
        <div className="mb-8 space-y-6">
          {/* Themes */}
          {synthesis.themes.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
                <TrendingUp size={12} /> Themes Across All Clips
              </h3>
              <div className="flex flex-wrap gap-2">
                {synthesis.themes.map((theme, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-full text-xs font-medium bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20">
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Narrative Arcs */}
          {synthesis.narrative_arcs.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
                <Brain size={12} /> Narrative Arcs Found
              </h3>
              <div className="space-y-2">
                {synthesis.narrative_arcs.map((arc, i) => (
                  <div key={i} className="border border-[var(--border-light)] rounded-lg p-4 bg-[var(--bg-card)]">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{arc.title}</span>
                      <span className="text-xs text-[var(--text-tertiary)]">
                        {Math.round(arc.strength * 100)}% confidence · {arc.clip_ids.length} clips
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{arc.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Edit Plans */}
          {editPlans.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
                <Scissors size={12} /> Edit Plans ({editPlans.length})
              </h3>
              <div className="space-y-3">
                {editPlans.map(plan => {
                  const isExpanded = expandedPlan === plan.id
                  const isAssembling = assembling === plan.id
                  const hasVideo = !!plan.assembled_storage_path
                  const totalSecs = plan.segments.reduce((sum, s) => sum + (s.end - s.start), 0)

                  const platformBadge = {
                    short_form: { label: 'Short Form', color: 'text-pink-400 bg-pink-400/10 border-pink-400/20' },
                    long_form:  { label: 'Long Form',  color: 'text-blue-400 bg-blue-400/10 border-blue-400/20' },
                    general:    { label: 'General',    color: 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)] border-[var(--border-light)]' },
                  }[plan.platform] || { label: plan.platform, color: '' }

                  return (
                    <div key={plan.id} className="border border-[var(--border-medium)] rounded-xl bg-[var(--bg-card)] overflow-hidden">
                      <div className="px-5 py-4">
                        <div className="flex items-start gap-3">
                          <Film size={18} className="text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">{plan.title}</span>
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium border ${platformBadge.color}`}>
                                {platformBadge.label}
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-secondary)] leading-relaxed mb-2">{plan.narrative_summary}</p>
                            <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                              <span className="flex items-center gap-1"><Play size={10} /> {formatTime(Math.round(totalSecs))}</span>
                              <span>{plan.segments.length} segments</span>
                              <span>from {new Set(plan.segments.map(s => s.source_upload_id)).size} clips</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            {hasVideo ? (
                              <button
                                onClick={() => handleDownload(plan.id)}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-400/10 text-green-400 text-xs font-medium hover:bg-green-400/20 transition-colors"
                              >
                                <Download size={13} />
                                Download
                              </button>
                            ) : (
                              <button
                                onClick={() => handleAssemble(plan.id)}
                                disabled={!!assembling}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-medium hover:bg-[var(--accent)]/20 transition-colors disabled:opacity-50"
                              >
                                {isAssembling
                                  ? <><Loader2 size={13} className="animate-spin" />Assembling...</>
                                  : <><Scissors size={13} />Assemble</>}
                              </button>
                            )}
                            <button
                              onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                              className="p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                              {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Segment timeline */}
                      {isExpanded && (
                        <div className="border-t border-[var(--border-light)] px-5 py-4">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3">
                            Cut Sequence
                          </h4>
                          <div className="space-y-2">
                            {plan.segments.map((seg, i) => {
                              const clip = clips.find(c => c.id === seg.source_upload_id)
                              return (
                                <div key={i} className="flex items-start gap-3 py-2 border-b border-[var(--border-light)] last:border-0">
                                  <span className="text-[10px] font-mono text-[var(--text-tertiary)] flex-shrink-0 pt-0.5 w-4 text-right">{i + 1}</span>
                                  <span className="text-[10px] font-mono text-[var(--text-tertiary)] flex-shrink-0 pt-0.5 w-24">
                                    {formatTime(seg.start)} – {formatTime(seg.end)}
                                    <span className="block text-[9px] opacity-60">+{formatTime(seg.end - seg.start)}</span>
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5 truncate">
                                      {clip?.file_name || seg.source_file_name}
                                    </p>
                                    <p className="text-xs text-[var(--text-secondary)] leading-relaxed italic">
                                      &ldquo;{seg.transcript_excerpt}&rdquo;
                                    </p>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Clips in session */}
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-3 flex items-center justify-between">
          <span className="flex items-center gap-1.5"><Video size={12} /> Clips in Session</span>
          <Link href="/dashboard/uploads" className="text-[var(--accent)] hover:underline normal-case font-normal text-xs">
            + Add clips
          </Link>
        </h3>

        {clips.length === 0 ? (
          <div className="text-center py-10 border border-dashed border-[var(--border-medium)] rounded-xl">
            <p className="text-sm text-[var(--text-tertiary)]">No clips yet.</p>
            <Link href="/dashboard/uploads" className="text-sm text-[var(--accent)] hover:underline mt-1 inline-block">
              Upload clips and assign them to this session
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {clips.map(clip => {
              const isVideo = clip.mime_type.startsWith('video/')
              const statusColors: Record<string, string> = {
                processed:    'text-green-400',
                transcribing: 'text-blue-400',
                analyzing:    'text-purple-400',
                error:        'text-red-400',
                uploaded:     'text-[var(--text-tertiary)]',
                deleting:     'text-[var(--text-tertiary)]',
                deleted:      'text-[var(--text-tertiary)]',
              }
              const statusColor = statusColors[clip.status] || 'text-[var(--text-tertiary)]'

              return (
                <div key={clip.id} className="flex items-center gap-3 px-4 py-3 border border-[var(--border-light)] rounded-lg bg-[var(--bg-card)]">
                  {isVideo
                    ? <Video size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />
                    : <FileAudio size={16} className="text-[var(--text-tertiary)] flex-shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--text-primary)] truncate">{clip.file_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {clip.duration_seconds && (
                        <span className="text-xs text-[var(--text-tertiary)]">{formatDuration(clip.duration_seconds)}</span>
                      )}
                      {clip.tags && clip.tags.length > 0 && (
                        <span className="text-xs text-[var(--text-tertiary)]">{clip.tags.slice(0, 2).join(', ')}</span>
                      )}
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${statusColor} flex-shrink-0`}>
                    {clip.status === 'processed' ? '✓ Ready' :
                     clip.status === 'transcribing' ? 'Transcribing...' :
                     clip.status === 'analyzing' ? 'Analyzing...' :
                     clip.status === 'error' ? 'Error' : 'Queued'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
