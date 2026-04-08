'use client'
export const runtime = 'edge'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format } from 'date-fns'
import {
  ArrowLeft, Loader2, AlertCircle, ChevronDown, ChevronUp,
  Film, FileEdit, Target, Lightbulb, Users, BookOpen,
  CheckSquare, Volume2
} from 'lucide-react'
import type { VideoUpload, VideoAnalysis } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

type EntityMentionRow = {
  context: string
  sentiment: string | null
  entities: {
    type: string
    name: string
    slug: string
  } | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function getRecordedDate(upload: VideoUpload): Date {
  return new Date(upload.recorded_at ?? upload.created_at)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TimelineDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const seekTo = searchParams ? Number(searchParams.get('t') ?? 0) : 0
  const supabase = createClient()
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null)

  const [upload, setUpload] = useState<VideoUpload | null>(null)
  const [mentions, setMentions] = useState<EntityMentionRow[]>([])
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const [uploadRes, mentionsRes] = await Promise.all([
      supabase
        .from('video_uploads')
        .select('*')
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single(),

      supabase
        .from('entity_mentions')
        .select('context, sentiment, entities(type, name, slug)')
        .eq('video_upload_id', id)
        .limit(20),
    ])

    if (uploadRes.error || !uploadRes.data) {
      setError('Recording not found.')
      setLoading(false)
      return
    }

    const u = uploadRes.data as VideoUpload
    setUpload(u)
    setMentions((mentionsRes.data ?? []) as unknown as EntityMentionRow[])

    // Get signed URL for video via server-side API (uses admin client, bypasses RLS)
    if (u.storage_path) {
      const res = await fetch(`/api/video-upload/${id}/signed-url`)
      if (res.ok) {
        const { signedUrl } = await res.json()
        if (signedUrl) setVideoUrl(signedUrl)
      } else {
        const { error } = await res.json().catch(() => ({ error: 'Failed to load video' }))
        console.error('[video player] signed URL error:', error)
      }
    }

    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-4 w-20 skeleton rounded" />
        </div>
        <div className="space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-full skeleton rounded" />
          <div className="h-4 w-4/5 skeleton rounded" />
          <div className="h-4 w-3/5 skeleton rounded" />
        </div>
      </div>
    )
  }

  if (error || !upload) {
    return (
      <div className="px-6 py-8 max-w-3xl mx-auto">
        <Link
          href="/dashboard/timeline"
          className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-8"
        >
          <ArrowLeft size={12} /> Timeline
        </Link>
        <div className="flex items-center gap-2 text-[var(--error)]">
          <AlertCircle size={16} />
          <p className="text-sm">{error ?? 'Not found.'}</p>
        </div>
      </div>
    )
  }

  const a = upload.analysis as VideoAnalysis | null
  const recordedDate = getRecordedDate(upload)
  const duration = formatDuration(upload.duration_seconds)

  const topics = [
    ...(a?.recurring_themes ?? []),
    ...(a?.topics ?? []),
    ...(a?.categories ?? []).map((c: any) => typeof c === 'string' ? c : (c.name ?? '')),
  ].filter((v, i, arr) => arr.findIndex(x => x.toLowerCase() === v.toLowerCase()) === i).slice(0, 8)

  const groupedMentions = mentions.reduce<Record<string, EntityMentionRow[]>>(
    (acc: Record<string, EntityMentionRow[]>, m: EntityMentionRow) => {
      const type = m.entities?.type ?? 'other'
      if (!acc[type]) acc[type] = []
      acc[type].push(m)
      return acc
    }, {}
  )

  const entityTypeIcons: Record<string, any> = {
    project:    <Film size={12} />,
    idea:       <Lightbulb size={12} />,
    person:     <Users size={12} />,
    goal:       <Target size={12} />,
    skill:      <BookOpen size={12} />,
    commitment: <CheckSquare size={12} />,
  }

  const isAudio = upload.mime_type?.startsWith('audio/')

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">

      {/* Back */}
      <Link
        href="/dashboard/timeline"
        className="flex items-center gap-1.5 text-[11px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-8 w-fit"
      >
        <ArrowLeft size={12} /> Timeline
      </Link>

      {/* Header */}
      <div className="mb-6">
        <p className="text-[10px] font-mono uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-1">
          {format(recordedDate, 'EEEE, MMMM d · yyyy')}
        </p>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
          {isAudio ? 'Voice Recording' : 'Recording'}
          {duration && <span className="text-[var(--text-tertiary)] font-normal ml-2 text-base">· {duration}</span>}
        </h1>
        <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-1">
          {format(recordedDate, 'h:mm a')}
          {upload.status !== 'processed' && (
            <span className="ml-3 text-[var(--accent)] animate-pulse">
              {upload.status === 'error' ? '· Error' : '· Processing…'}
            </span>
          )}
        </p>
      </div>

      {/* Video / Audio Player */}
      {videoUrl && (
        <div className="mb-8 rounded-xl overflow-hidden border border-[var(--border-light)] bg-black/60">
          {isAudio ? (
            <div className="flex items-center gap-3 px-5 py-4">
              <Volume2 size={18} className="text-[var(--accent)] flex-shrink-0" />
              <audio
                ref={mediaRef as React.RefObject<HTMLAudioElement>}
                controls
                src={videoUrl}
                className="w-full h-8 accent-[var(--accent)]"
                onLoadedMetadata={() => {
                  if (seekTo > 0 && mediaRef.current) mediaRef.current.currentTime = seekTo
                }}
              />
            </div>
          ) : (
            <video
              ref={mediaRef as React.RefObject<HTMLVideoElement>}
              controls
              src={videoUrl}
              className="w-full max-h-[420px] object-contain"
              onLoadedMetadata={() => {
                if (seekTo > 0 && mediaRef.current) mediaRef.current.currentTime = seekTo
              }}
              onError={(e) => {
                const code = (e.target as HTMLVideoElement).error?.code
                const msgs: Record<number, string> = {
                  2: 'Network error loading video.',
                  3: 'Could not decode video. If this is a MOV/HEVC file, install HEVC Video Extensions on Windows.',
                  4: 'Video format not supported in this browser. MOV/HEVC files require HEVC Video Extensions on Windows.',
                }
                setVideoError(msgs[code ?? 0] ?? 'Video could not be loaded.')
              }}
            />
          )}
        </div>
      )}

      {/* Video error + download fallback */}
      {videoError && (
        <div className="mb-6 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[12px]">
          <span className="mt-0.5 flex-shrink-0">⚠</span>
          <span>{videoError} <a href={videoUrl ?? ''} download className="underline hover:no-underline ml-1">Download video</a> to play in VLC or QuickTime.</span>
        </div>
      )}

      {/* Not yet processed */}
      {!a && upload.status !== 'error' && (
        <div className="flex items-center gap-2 py-8 text-[var(--text-tertiary)]">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-sm">Analysis in progress…</span>
        </div>
      )}

      {a && (
        <div className="space-y-8">

          {/* Narrative summary */}
          {a.summary && (
            <section>
              <p className="text-[15px] leading-relaxed text-[var(--text-primary)]">
                {a.summary}
              </p>
            </section>
          )}

          {/* Topics */}
          {topics.length > 0 && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Topics</p>
              <div className="flex flex-wrap gap-2">
                {topics.map(t => (
                  <span
                    key={t}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Signals */}
          {(a.mood || a.energy_level) && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Signals</p>
              <div className="flex items-center gap-4 text-sm text-[var(--text-secondary)]">
                {a.mood && <span>{a.mood}</span>}
                {a.energy_level && (
                  <span className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                    a.energy_level === 'high'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : a.energy_level === 'medium'
                      ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    {a.energy_level} energy
                  </span>
                )}
              </div>
            </section>
          )}

          {/* Key quotes */}
          {a.key_quotes && a.key_quotes.length > 0 && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">Key Moments</p>
              <div className="space-y-3">
                {a.key_quotes.slice(0, 4).map((q, i) => (
                  <blockquote key={i} className="border-l-2 border-[var(--accent)]/40 pl-4">
                    <p className="text-[13.5px] italic leading-relaxed text-[var(--text-secondary)]">"{q}"</p>
                  </blockquote>
                ))}
              </div>
            </section>
          )}

          {/* Ideas */}
          {a.ideas && a.ideas.length > 0 && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Ideas</p>
              <ul className="space-y-1.5">
                {a.ideas.slice(0, 6).map((idea, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
                    <span className="text-[var(--accent)] mt-0.5 flex-shrink-0">·</span>
                    <span>{idea.text}</span>
                    <span className="ml-auto flex-shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--bg-secondary)] px-1.5 py-0.5 rounded">
                      {idea.type}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Action items */}
          {a.action_items && a.action_items.length > 0 && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Actions</p>
              <ul className="space-y-1.5">
                {a.action_items.slice(0, 8).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--text-secondary)]">
                    <CheckSquare size={12} className="text-[var(--text-tertiary)] mt-0.5 flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Reflections */}
          {a.reflections && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-2">Reflections</p>
              <p className="text-[13.5px] text-[var(--text-secondary)] leading-relaxed">{a.reflections}</p>
            </section>
          )}

          {/* Entities mentioned */}
          {mentions.length > 0 && (
            <section>
              <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] mb-3">
                Entities Mentioned
              </p>
              <div className="space-y-2">
                {(Object.entries(groupedMentions) as [string, EntityMentionRow[]][]).map(([type, items]) => (
                  <div key={type} className="flex items-start gap-2 flex-wrap">
                    <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider pt-0.5 min-w-[70px]">
                      {entityTypeIcons[type] ?? null} {type}
                    </span>
                    {items.map((m, i) => (
                      m.entities && (
                        <Link
                          key={i}
                          href={m.entities.type === 'project'
                              ? `/dashboard/projects/${m.entities.slug}`
                              : `/dashboard/brain`}
                          className="px-2 py-0.5 rounded-md text-[11px] font-mono bg-[var(--bg-secondary)] text-[var(--text-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                        >
                          {m.entities.name}
                        </Link>
                      )
                    ))}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Transcript */}
          {upload.transcript && (
            <section>
              <button
                onClick={() => setTranscriptOpen((v: boolean) => !v)}
                className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors mb-2 w-full text-left"
              >
                <span>Transcript</span>
                {transcriptOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {transcriptOpen && (
                <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl p-4 max-h-[400px] overflow-y-auto">
                  <p className="text-[12px] font-mono text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                    {upload.transcript}
                  </p>
                </div>
              )}
            </section>
          )}

        </div>
      )}

    </div>
  )
}
