'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import {
  Video, FileText, Plus, ChevronDown, ChevronRight,
  ExternalLink, Clock, Tag, Dumbbell, Heart
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

type EntryType = 'session' | 'video' | 'capture' | 'note' | 'idea' | 'health' | string

type TimelineEntry = {
  id: string
  entry_type: EntryType
  title: string
  body?: string | null
  logged_at: string
  software_tags?: string[] | null
  is_public: boolean
  source_upload_id?: string | null
  thumbnail_url?: string | null
  meta?: Record<string, any> | null
  video_upload?: {
    file_name: string | null
    duration_seconds: number | null
    status: string | null
    thumbnail_url: string | null
  } | null
}

type View = 'all' | 'videos' | 'notes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return ''
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function cleanFilename(name: string | null | undefined): string {
  if (!name) return ''
  return name.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ').trim()
}

function formatDayHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d · yyyy').toUpperCase()
}

function isVideoEntry(e: TimelineEntry) {
  return e.entry_type === 'session' || e.entry_type === 'video'
}

function isNoteEntry(e: TimelineEntry) {
  return e.entry_type === 'capture' || e.entry_type === 'note' || e.entry_type === 'idea'
}

// ─── Video Card ───────────────────────────────────────────────────────────────

function VideoCard({ entry }: { entry: TimelineEntry }) {
  const filename = cleanFilename(entry.video_upload?.file_name || entry.title)
  const duration = formatDuration(entry.video_upload?.duration_seconds)
  const time = format(new Date(entry.logged_at), 'h:mm a')
  const tags = entry.meta?.categories || entry.software_tags || []

  return (
    <div className="group flex items-stretch gap-0 hover:bg-white/[0.015] transition-colors">
      {/* Thumbnail */}
      {entry.thumbnail_url ? (
        <div className="flex-shrink-0 w-[72px] overflow-hidden border-r border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <img
            src={entry.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            style={{ minHeight: '64px' }}
          />
        </div>
      ) : (
        <div className="flex-shrink-0 w-[72px] border-r border-[var(--border-light)] bg-[var(--bg-secondary)]/50 flex items-center justify-center" style={{ minHeight: '64px' }}>
          <Video size={16} className="text-[var(--text-tertiary)]/40" />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-w-0 px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Activity label */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
              Video
            </span>
            {duration && (
              <>
                <span className="text-[var(--border-medium)] text-[10px]">·</span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{duration}</span>
              </>
            )}
          </div>

          {/* Filename as title */}
          <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug truncate">
            {filename || 'Untitled video'}
          </p>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
              {(tags as string[]).slice(0, 4).map((tag: string) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Time + link */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <time className="text-[10px] font-mono text-[var(--text-tertiary)]">{time}</time>
          {entry.source_upload_id && (
            <Link
              href={`/dashboard/uploads?id=${entry.source_upload_id}`}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-mono text-[var(--accent)] flex items-center gap-1"
            >
              View <ExternalLink size={9} />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Note Card ────────────────────────────────────────────────────────────────

function NoteCard({ entry }: { entry: TimelineEntry }) {
  const time = format(new Date(entry.logged_at), 'h:mm a')
  const body = entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').replace(/\nMood:.*$/m, '').trim()

  return (
    <div className="group flex items-start gap-3 px-4 py-3 hover:bg-white/[0.015] transition-colors">
      <div className="flex-shrink-0 w-5 h-5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center mt-0.5">
        <FileText size={10} className="text-[var(--text-tertiary)]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            {entry.entry_type === 'idea' ? 'Idea' : 'Note'}
          </span>
        </div>

        {body ? (
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {body.length > 200 ? body.slice(0, 200) + '…' : body}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {entry.title}
          </p>
        )}
      </div>

      <time className="flex-shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">{time}</time>
    </div>
  )
}

// ─── Health Card ──────────────────────────────────────────────────────────────

function HealthCard({ entry }: { entry: TimelineEntry }) {
  const time = format(new Date(entry.logged_at), 'h:mm a')
  const energy = entry.meta?.energy_level || entry.meta?.energy
  const sleep = entry.meta?.sleep_hours
  const workout = entry.meta?.workout_done

  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-white/[0.015] transition-colors">
      <div className="flex-shrink-0 w-5 h-5 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
        <Heart size={10} className="text-emerald-400" />
      </div>

      <div className="flex-1 flex items-center gap-4 text-[12px] text-[var(--text-secondary)]">
        <span className="font-medium text-[var(--text-primary)]">Health check</span>
        {energy && <span className="font-mono text-[var(--text-tertiary)]">Energy {energy}/10</span>}
        {sleep && <span className="font-mono text-[var(--text-tertiary)]">{sleep}h sleep</span>}
        {workout && (
          <span className="flex items-center gap-1 text-emerald-400 text-[11px]">
            <Dumbbell size={10} /> Workout
          </span>
        )}
      </div>

      <time className="flex-shrink-0 text-[10px] font-mono text-[var(--text-tertiary)]">{time}</time>
    </div>
  )
}

// ─── Video Group (3+ videos on same day) ─────────────────────────────────────

function VideoGroup({ entries }: { entries: TimelineEntry[] }) {
  const [expanded, setExpanded] = useState(false)
  const count = entries.length

  return (
    <div className="border-b border-[var(--border-light)] last:border-b-0">
      {/* Group header */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.015] transition-colors text-left group"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
          <span className="text-[13px] font-medium text-[var(--text-primary)]">
            {count} videos shot
          </span>
          <span className="text-[11px] text-[var(--text-tertiary)] font-mono">
            {entries.map(e => formatDuration(e.video_upload?.duration_seconds)).filter(Boolean).join(' + ') || ''}
          </span>
        </div>
        {expanded
          ? <ChevronDown size={13} className="text-[var(--text-tertiary)] flex-shrink-0" />
          : <ChevronRight size={13} className="text-[var(--text-tertiary)] flex-shrink-0" />
        }
      </button>

      {/* Expanded list */}
      {expanded && (
        <div className="border-t border-[var(--border-light)] divide-y divide-[var(--border-light)]">
          {entries.map(entry => (
            <VideoCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      {/* Collapsed preview: show filenames inline */}
      {!expanded && (
        <div className="px-4 pb-3 flex flex-col gap-0.5">
          {entries.map(e => {
            const filename = cleanFilename(e.video_upload?.file_name || e.title)
            const duration = formatDuration(e.video_upload?.duration_seconds)
            const time = format(new Date(e.logged_at), 'h:mm a')
            return (
              <div key={e.id} className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                <span className="w-1 h-1 rounded-full bg-[var(--border-medium)] flex-shrink-0" />
                <span className="truncate font-mono">{filename || 'Untitled'}</span>
                {duration && <span className="flex-shrink-0 opacity-60">{duration}</span>}
                <span className="flex-shrink-0 opacity-40 ml-auto">{time}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Day Section ─────────────────────────────────────────────────────────────

type DaySection = {
  date: Date
  label: string
  items: Array<
    | { kind: 'video'; entry: TimelineEntry }
    | { kind: 'video-group'; entries: TimelineEntry[] }
    | { kind: 'note'; entry: TimelineEntry }
    | { kind: 'health'; entry: TimelineEntry }
  >
  totalEntries: number
}

function buildDaySections(entries: TimelineEntry[], view: View): DaySection[] {
  const filtered = entries.filter(e => {
    if (view === 'videos') return isVideoEntry(e)
    if (view === 'notes') return isNoteEntry(e)
    return true
  })

  // Group by day
  const byDay = new Map<string, TimelineEntry[]>()
  for (const e of filtered) {
    const key = format(new Date(e.logged_at), 'yyyy-MM-dd')
    if (!byDay.has(key)) byDay.set(key, [])
    byDay.get(key)!.push(e)
  }

  const sections: DaySection[] = []

  for (const [, dayEntries] of byDay) {
    const date = new Date(dayEntries[0].logged_at)
    const label = formatDayHeader(date)
    const items: DaySection['items'] = []

    // Separate videos from non-videos
    const videos = dayEntries.filter(isVideoEntry)
    const nonVideos = dayEntries.filter(e => !isVideoEntry(e))

    // Videos: group if ≥3, else individual
    if (videos.length >= 3) {
      items.push({ kind: 'video-group', entries: videos })
    } else {
      for (const v of videos) {
        items.push({ kind: 'video', entry: v })
      }
    }

    // Non-video entries
    for (const e of nonVideos) {
      if (e.entry_type === 'health') {
        items.push({ kind: 'health', entry: e })
      } else {
        items.push({ kind: 'note', entry: e })
      }
    }

    sections.push({ date, label, items, totalEntries: dayEntries.length })
  }

  return sections
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VIEWS: { id: View; label: string }[] = [
  { id: 'all',    label: 'All'    },
  { id: 'videos', label: 'Videos' },
  { id: 'notes',  label: 'Notes'  },
]

export default function TimelinePage() {
  const [entries, setEntries] = useState<TimelineEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('all')
  const router = useRouter()
  const supabase = createClient()

  const loadEntries = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data } = await supabase
      .from('log_entries')
      .select(`
        id, entry_type, title, body, logged_at, software_tags,
        is_public, source_upload_id, thumbnail_url, meta,
        video_upload:video_uploads!source_upload_id(file_name, duration_seconds, status, thumbnail_url)
      `)
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })
      .limit(500)

    const all = (data || []) as unknown as TimelineEntry[]

    // Resolve thumbnail: prefer log_entries.thumbnail_url, fall back to video_uploads.thumbnail_url
    for (const e of all) {
      if (!e.thumbnail_url && e.video_upload?.thumbnail_url) {
        e.thumbnail_url = e.video_upload.thumbnail_url
      }
    }

    // Generate signed URLs for thumbnails stored as storage paths (not already http URLs)
    const thumbPaths = all
      .filter(e => e.thumbnail_url && !e.thumbnail_url.startsWith('http'))
      .map(e => e.thumbnail_url!)

    if (thumbPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('videos')
        .createSignedUrls(thumbPaths, 3600)
      if (signed) {
        const signedMap: Record<string, string> = {}
        for (const s of signed) {
          if (s.signedUrl) signedMap[s.path] = s.signedUrl
        }
        for (const e of all) {
          if (e.thumbnail_url && signedMap[e.thumbnail_url]) {
            e.thumbnail_url = signedMap[e.thumbnail_url]
          }
        }
      }
    }

    setEntries(all)
    setLoading(false)
  }, [])

  useEffect(() => { loadEntries() }, [loadEntries])

  const sections = buildDaySections(entries, view)
  const videoCount = entries.filter(isVideoEntry).length
  const noteCount = entries.filter(isNoteEntry).length

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">
            Everything · All Time
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-1">
            Timeline
          </h1>
          <p className="text-[11px] font-mono text-[var(--text-tertiary)]">
            {videoCount} sessions · {noteCount} notes
          </p>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <Link href="/dashboard/log/new" className="btn btn-primary btn-sm flex items-center gap-1.5">
            <Plus size={13} />
            New
          </Link>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 mb-8 p-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl w-fit">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
              view === v.id
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-light)] shadow-sm'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-16 skeleton rounded-xl" style={{ opacity: 1 - i * 0.12 }} />
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className="text-center py-24 opacity-40">
          <p className="text-[10px] font-mono uppercase tracking-widest">Nothing yet</p>
          <p className="text-xs mt-2 text-[var(--text-tertiary)]">Upload a video or add a note to begin.</p>
          <div className="flex gap-3 items-center justify-center mt-6">
            <Link href="/dashboard/uploads" className="btn btn-primary btn-sm">Upload Video</Link>
            <Link href="/dashboard/log/new" className="btn btn-secondary btn-sm">Add Note</Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          {sections.map((section) => (
            <div key={section.label}>

              {/* Day header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                  {section.label}
                </span>
                <div className="flex-1 h-px bg-[var(--border-light)]" />
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-40">
                  {section.totalEntries} {section.totalEntries === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {/* Cards */}
              <div className="rounded-xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-card)] divide-y divide-[var(--border-light)]">
                {section.items.map((item, i) => {
                  if (item.kind === 'video') return <VideoCard key={item.entry.id} entry={item.entry} />
                  if (item.kind === 'video-group') return <VideoGroup key={`group-${i}`} entries={item.entries} />
                  if (item.kind === 'note') return <NoteCard key={item.entry.id} entry={item.entry} />
                  if (item.kind === 'health') return <HealthCard key={item.entry.id} entry={item.entry} />
                  return null
                })}
              </div>

            </div>
          ))}

          <div className="py-10 text-center">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-30">
              End of timeline
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
