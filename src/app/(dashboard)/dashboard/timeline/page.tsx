'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, isToday, isYesterday } from 'date-fns'
import {
  Video, FileText, Loader2, Heart, Dumbbell,
  ChevronRight, Film, FileEdit
} from 'lucide-react'
import type { VideoAnalysis } from '@/types/database'

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadItem = {
  id: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  duration_seconds: number | null
  status: string
  tags: string[]
  analysis: VideoAnalysis | null
  thumbnail_url: string | null
  recorded_at: string | null
  created_at: string
  generated_clips: any[] | null
  generated_posts: any[] | null
}

type NoteItem = {
  id: string
  entry_type: string
  title: string
  body: string | null
  logged_at: string
  software_tags: string[] | null
  meta: Record<string, any> | null
  thumbnail_url: string | null
}

type Session = {
  id: string
  uploads: UploadItem[]
  startTime: Date
  endTime: Date
  totalDuration: number
  topics: string[]
  mood: string | null
  energy: string | null
  summary: string | null
  keyQuote: string | null
  clipCount: number
  postCount: number
  thumbnailUrl: string | null
  isProcessing: boolean
  isError: boolean
}

type DayGroup = {
  label: string
  date: Date
  sessions: Session[]
  notes: NoteItem[]
}

type View = 'all' | 'videos' | 'notes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getUploadTime(u: UploadItem): number {
  return new Date(u.recorded_at ?? u.created_at).getTime()
}

function formatTotalDuration(seconds: number): string {
  if (seconds <= 0) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${Math.floor(seconds)}s`
}

function formatTimeRange(start: Date, end: Date): string {
  const startStr = format(start, 'h:mm a')
  if (start.getTime() === end.getTime()) return startStr
  const endStr = format(end, 'h:mm a')
  return `${startStr} – ${endStr}`
}

function formatDayHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d · yyyy').toUpperCase()
}

function extractTopics(uploads: UploadItem[]): string[] {
  const seen = new Set<string>()
  const topics: string[] = []
  for (const u of uploads) {
    if (!u.analysis) continue
    const a = u.analysis
    const candidates = [
      ...(a.recurring_themes ?? []),
      ...(a.topics ?? []),
      ...(a.categories ?? []).map((c: any) => typeof c === 'string' ? c : (c.name ?? '')),
    ]
    for (const t of candidates) {
      const key = t.toLowerCase().trim()
      if (key && !seen.has(key) && topics.length < 8) {
        seen.add(key)
        topics.push(t)
      }
    }
  }
  return topics.slice(0, 6)
}

function buildSessionFromGroup(uploads: UploadItem[]): Session {
  const sorted = [...uploads].sort((a, b) => getUploadTime(a) - getUploadTime(b))
  const startTime = new Date(getUploadTime(sorted[0]))
  const endTime = new Date(getUploadTime(sorted[sorted.length - 1]))

  const totalDuration = sorted.reduce((sum, u) => sum + (u.duration_seconds ?? 0), 0)
  const clipCount = sorted.reduce((sum, u) => sum + (u.generated_clips?.length ?? 0), 0)
  const postCount = sorted.reduce((sum, u) => sum + (u.generated_posts?.length ?? 0), 0)

  const firstProcessed = sorted.find(u => u.status === 'processed' && u.analysis)
  const summary = firstProcessed?.analysis?.summary ?? null
  const mood = firstProcessed?.analysis?.mood ?? null
  const energy = firstProcessed?.analysis?.energy_level ?? null
  const keyQuote = firstProcessed?.analysis?.key_quotes?.[0] ?? null
  const thumbnailUrl = sorted.find(u => u.thumbnail_url)?.thumbnail_url ?? null

  const topics = extractTopics(sorted)

  const isProcessing = sorted.some(
    u => u.status === 'transcribing' || u.status === 'analyzing' || u.status === 'uploaded'
  )
  const isError = !isProcessing && sorted.every(u => u.status === 'error')

  return {
    id: sorted[0].id,
    uploads: sorted,
    startTime,
    endTime,
    totalDuration,
    topics,
    mood,
    energy,
    summary,
    keyQuote,
    clipCount,
    postCount,
    thumbnailUrl,
    isProcessing,
    isError,
  }
}

function buildSessions(uploads: UploadItem[], windowMinutes = 90): Session[] {
  if (uploads.length === 0) return []

  const sorted = [...uploads].sort((a, b) => getUploadTime(a) - getUploadTime(b))
  const groups: UploadItem[][] = []
  let current: UploadItem[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const prev = current[current.length - 1]
    const gap = (getUploadTime(sorted[i]) - getUploadTime(prev)) / 60000
    if (gap <= windowMinutes) {
      current.push(sorted[i])
    } else {
      groups.push(current)
      current = [sorted[i]]
    }
  }
  groups.push(current)

  return groups.map(buildSessionFromGroup).reverse()
}

function buildDayGroups(sessions: Session[], notes: NoteItem[], view: View): DayGroup[] {
  const dayMap = new Map<string, DayGroup>()

  if (view !== 'notes') {
    for (const s of sessions) {
      const key = format(s.startTime, 'yyyy-MM-dd')
      if (!dayMap.has(key)) {
        dayMap.set(key, { label: formatDayHeader(s.startTime), date: s.startTime, sessions: [], notes: [] })
      }
      dayMap.get(key)!.sessions.push(s)
    }
  }

  if (view !== 'videos') {
    for (const n of notes) {
      const date = new Date(n.logged_at)
      const key = format(date, 'yyyy-MM-dd')
      if (!dayMap.has(key)) {
        dayMap.set(key, { label: formatDayHeader(date), date, sessions: [], notes: [] })
      }
      dayMap.get(key)!.notes.push(n)
    }
  }

  return [...dayMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v)
}

// ─── SessionCard ──────────────────────────────────────────────────────────────

function SessionCard({ session }: { session: Session }) {
  const count = session.uploads.length
  const isMulti = count > 1
  const timeLabel = formatTimeRange(session.startTime, session.endTime)
  const durationLabel = formatTotalDuration(session.totalDuration)

  return (
    <Link
      href={`/dashboard/timeline/${session.id}`}
      className="block group hover:bg-white/[0.018] transition-colors"
    >
      <div className="flex items-stretch gap-0">
        {/* Thumbnail or icon */}
        {session.thumbnailUrl ? (
          <div className="flex-shrink-0 w-[80px] overflow-hidden border-r border-[var(--border-light)] bg-[var(--bg-secondary)]">
            <img
              src={session.thumbnailUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ minHeight: '72px' }}
            />
          </div>
        ) : (
          <div
            className="flex-shrink-0 w-[80px] border-r border-[var(--border-light)] bg-[var(--bg-secondary)]/40 flex items-center justify-center"
            style={{ minHeight: '72px' }}
          >
            <Video size={18} className="text-[var(--text-tertiary)]/30" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3.5">

          {/* Meta row */}
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] flex-shrink-0" />
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">
              {isMulti ? `Recording Session · ${count} clips` : 'Recording'}
            </span>
            {durationLabel && (
              <>
                <span className="text-[var(--border-medium)] text-[9px]">·</span>
                <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{durationLabel}</span>
              </>
            )}
            <span className="ml-auto text-[10px] font-mono text-[var(--text-tertiary)] opacity-60">{timeLabel}</span>
          </div>

          {/* Summary / processing state */}
          {session.isError ? (
            <p className="text-[13px] text-[var(--text-tertiary)] italic">Processing failed.</p>
          ) : session.isProcessing && !session.summary ? (
            <div className="flex items-center gap-2 text-[13px] text-[var(--text-tertiary)]">
              <Loader2 size={12} className="animate-spin" />
              <span>Transcribing and analyzing…</span>
            </div>
          ) : session.summary ? (
            <p className="text-[13.5px] leading-relaxed text-[var(--text-secondary)] mb-2">
              {session.summary.length > 280 ? session.summary.slice(0, 280) + '…' : session.summary}
            </p>
          ) : (
            <p className="text-[13px] text-[var(--text-tertiary)] italic">No analysis yet.</p>
          )}

          {/* Topics */}
          {session.topics.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {session.topics.map(t => (
                <span
                  key={t}
                  className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/15"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Signals */}
          {(session.mood || session.energy) && (
            <p className="text-[11px] font-mono text-[var(--text-tertiary)] mb-2">
              {[session.mood, session.energy ? `${session.energy} energy` : null]
                .filter(Boolean)
                .join('  ·  ')}
            </p>
          )}

          {/* Key quote */}
          {session.keyQuote && (
            <blockquote className="border-l-2 border-[var(--accent)]/30 pl-3 mb-2">
              <p className="text-[12px] italic text-[var(--text-tertiary)] leading-relaxed">
                "{session.keyQuote.length > 160 ? session.keyQuote.slice(0, 160) + '…' : session.keyQuote}"
              </p>
            </blockquote>
          )}

          {/* Artifact counts + chevron */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-3">
              {session.clipCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-tertiary)]">
                  <Film size={10} />
                  {session.clipCount} clip{session.clipCount !== 1 ? 's' : ''}
                </span>
              )}
              {session.postCount > 0 && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-tertiary)]">
                  <FileEdit size={10} />
                  {session.postCount} post{session.postCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ChevronRight
              size={13}
              className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0"
            />
          </div>
        </div>
      </div>
    </Link>
  )
}

// ─── NoteCard ─────────────────────────────────────────────────────────────────

function NoteCard({ note }: { note: NoteItem }) {
  const time = format(new Date(note.logged_at), 'h:mm a')
  const isHealth = note.entry_type === 'health'
  const body = note.body?.slice(0, 200)

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-white/[0.015] transition-colors">
      <div className={`flex-shrink-0 w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 ${
        isHealth
          ? 'bg-emerald-500/10 border-emerald-500/20'
          : 'bg-[var(--bg-secondary)] border-[var(--border-light)]'
      }`}>
        {isHealth
          ? <Heart size={10} className="text-emerald-400" />
          : <FileText size={10} className="text-[var(--text-tertiary)]" />
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
            {note.entry_type === 'idea' ? 'Idea' : note.entry_type === 'health' ? 'Health' : 'Note'}
          </span>
        </div>
        {body ? (
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {body}{note.body && note.body.length > 200 ? '…' : ''}
          </p>
        ) : (
          <p className="text-[13px] text-[var(--text-secondary)]">{note.title}</p>
        )}
        {note.meta?.energy_level && (
          <p className="text-[11px] font-mono text-[var(--text-tertiary)] mt-1">
            Energy {note.meta.energy_level}/10
            {note.meta.sleep_hours ? ` · ${note.meta.sleep_hours}h sleep` : ''}
          </p>
        )}
      </div>

      <time className="flex-shrink-0 text-[10px] font-mono text-[var(--text-tertiary)] mt-0.5">{time}</time>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VIEWS: { id: View; label: string }[] = [
  { id: 'all',    label: 'All'    },
  { id: 'videos', label: 'Videos' },
  { id: 'notes',  label: 'Notes'  },
]

export default function TimelinePage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('all')
  const router = useRouter()
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    // Fetch uploads + notes in parallel
    const [uploadsRes, notesRes] = await Promise.all([
      supabase
        .from('video_uploads')
        .select(`
          id, file_name, file_size_bytes, mime_type, duration_seconds,
          status, tags, analysis, thumbnail_url,
          recorded_at, created_at, generated_clips, generated_posts
        `)
        .eq('user_id', session.user.id)
        .neq('status', 'deleted')
        .neq('status', 'deleting')
        .order('recorded_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200),

      supabase
        .from('log_entries')
        .select('id, entry_type, title, body, logged_at, software_tags, meta, thumbnail_url')
        .eq('user_id', session.user.id)
        .in('entry_type', ['capture', 'note', 'idea', 'health'])
        .order('logged_at', { ascending: false })
        .limit(100),
    ])

    if (uploadsRes.error) console.error('[Timeline] video_uploads query error:', uploadsRes.error)
    const uploads = (uploadsRes.data ?? []) as UploadItem[]

    // Resolve thumbnail signed URLs (only non-http paths)
    const thumbPaths = uploads
      .filter(u => u.thumbnail_url && !u.thumbnail_url.startsWith('http'))
      .map(u => u.thumbnail_url!)

    if (thumbPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('videos')
        .createSignedUrls(thumbPaths, 3600)
      if (signed) {
        const map: Record<string, string> = {}
        for (const s of signed) {
          if (s.signedUrl) map[s.path] = s.signedUrl
        }
        for (const u of uploads) {
          if (u.thumbnail_url && map[u.thumbnail_url]) {
            u.thumbnail_url = map[u.thumbnail_url]
          }
        }
      }
    }

    setSessions(buildSessions(uploads))
    setNotes((notesRes.data ?? []) as NoteItem[])
    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const dayGroups = buildDayGroups(sessions, notes, view)
  const totalEvents = sessions.length + notes.length

  return (
    <div className="px-6 py-8 max-w-3xl mx-auto">

      {/* Header */}
      <div className="mb-8">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">
          The Log · All Time
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] mb-1">
          Timeline
        </h1>
        {!loading && (
          <p className="text-[11px] font-mono text-[var(--text-tertiary)]">
            {sessions.length} recording{sessions.length !== 1 ? 's' : ''}
            {notes.length > 0 ? ` · ${notes.length} note${notes.length !== 1 ? 's' : ''}` : ''}
          </p>
        )}
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
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 skeleton rounded-xl" style={{ opacity: 1 - i * 0.15 }} />
          ))}
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="text-center py-24 opacity-40">
          <p className="text-[10px] font-mono uppercase tracking-widest">Nothing yet</p>
          <p className="text-xs mt-2 text-[var(--text-tertiary)]">
            {view === 'notes'
              ? 'No notes yet. Chat on the log page to create notes.'
              : 'Upload a video to begin your log.'}
          </p>
          {view !== 'notes' && (
            <div className="flex gap-3 items-center justify-center mt-6">
              <Link href="/dashboard/uploads" className="btn btn-primary btn-sm">Upload Video</Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-10">
          {dayGroups.map(day => (
            <div key={day.label}>
              {/* Day header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                  {day.label}
                </span>
                <div className="flex-1 h-px bg-[var(--border-light)]" />
                <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-40">
                  {day.sessions.length + day.notes.length} {day.sessions.length + day.notes.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {/* Cards */}
              <div className="rounded-xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-card)] divide-y divide-[var(--border-light)]">
                {day.sessions.map(s => (
                  <SessionCard key={s.id} session={s} />
                ))}
                {day.notes.map(n => (
                  <NoteCard key={n.id} note={n} />
                ))}
              </div>
            </div>
          ))}

          <div className="py-10 text-center">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-30">
              End of log
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
