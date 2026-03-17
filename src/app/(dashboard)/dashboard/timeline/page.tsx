'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { format, isToday, isYesterday } from 'date-fns'
import { 
  Plus, ExternalLink, Loader2, Video, FileText, ChevronRight
} from 'lucide-react'
import { LogCard, type LogEntry } from '@/components/LogCard'

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadItem = {
  id: string
  file_name: string
  file_size_bytes: number
  mime_type: string
  duration_seconds: number | null
  status: string
  tags: string[]
  analysis: any | null
  thumbnail_url: string | null
  storage_path: string | null
  playback_path?: string | null
  video_url?: string | null
  recorded_at: string | null
  created_at: string
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
  is_public: boolean
}

type DayGroup = {
  label: string
  date: Date
  entries: LogEntry[]
}

type View = 'all' | 'videos' | 'notes'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDayHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d · yyyy')
}

function mapToLogEntry(item: any, type: 'upload' | 'note'): LogEntry {
  if (type === 'upload') {
    return {
      id: item.id,
      entry_type: 'session',
      title: item.file_name,
      body: item.analysis?.summary || null,
      logged_at: item.recorded_at || item.created_at,
      thumbnail_url: item.thumbnail_url,
      is_public: false, // Default for uploads for now
      meta: item.analysis,
      source_upload_id: item.id
    }
  } else {
    return {
      id: item.id,
      entry_type: item.entry_type,
      title: item.title,
      body: item.body,
      logged_at: item.logged_at,
      software_tags: item.software_tags || undefined,
      meta: item.meta || undefined,
      is_public: item.is_public ?? false,
      thumbnail_url: item.thumbnail_url,
    }
  }
}

function buildDayGroups(uploads: UploadItem[], notes: NoteItem[], view: View): DayGroup[] {
  const dayMap = new Map<string, DayGroup>()

  const allEntries: LogEntry[] = []

  if (view !== 'notes') {
    uploads.forEach(u => allEntries.push(mapToLogEntry(u, 'upload')))
  }
  if (view !== 'videos') {
    notes.forEach(n => allEntries.push(mapToLogEntry(n, 'note')))
  }

  allEntries.forEach(entry => {
    const date = new Date(entry.logged_at)
    const key = format(date, 'yyyy-MM-dd')
    if (!dayMap.has(key)) {
      dayMap.set(key, { label: formatDayHeader(date), date, entries: [] })
    }
    dayMap.get(key)!.entries.push(entry)
  })

  // Sort entries within each day by time descending
  dayMap.forEach(group => {
    group.entries.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime())
  })

  return [...dayMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([, v]) => v)
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const VIEWS: { id: View; label: string }[] = [
  { id: 'all',    label: 'All'    },
  { id: 'videos', label: 'Videos' },
  { id: 'notes',  label: 'Notes'  },
]

export default function TimelinePage() {
  const [uploads, setUploads] = useState<UploadItem[]>([])
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<View>('all')
  const [username, setUsername] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    // Fetch user profile for username
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()
    
    if (profile) setUsername(profile.username)

    // Fetch uploads + notes in parallel
    const [uploadsRes, notesRes] = await Promise.all([
      supabase
        .from('video_uploads')
        .select(`
          id, file_name, file_size_bytes, mime_type, duration_seconds,
          status, tags, analysis, thumbnail_url, storage_path, playback_path,
          recorded_at, created_at
        `)
        .eq('user_id', session.user.id)
        .neq('status', 'deleted')
        .neq('status', 'deleting')
        .order('recorded_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(200),

      supabase
        .from('log_entries')
        .select('id, entry_type, title, body, logged_at, software_tags, meta, thumbnail_url, is_public')
        .eq('user_id', session.user.id)
        .in('entry_type', ['capture', 'note', 'idea', 'health'])
        .order('logged_at', { ascending: false })
        .limit(100),
    ])

    const fetchedUploads = (uploadsRes.data ?? []) as UploadItem[]
    const fetchedNotes = (notesRes.data ?? []) as NoteItem[]

    // Resolve thumbnail signed URLs for legacy paths
    const thumbPaths = fetchedUploads
      .filter(u => u.thumbnail_url && !u.thumbnail_url.startsWith('http') && !u.thumbnail_url.startsWith('data:'))
      .map(u => u.thumbnail_url!)

    if (thumbPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from('videos')
        .createSignedUrls(thumbPaths, 3600)
      if (signed) {
        const map: Record<string, string> = {}
        signed.forEach(s => { if (s.signedUrl) map[s.path] = s.signedUrl })
        fetchedUploads.forEach(u => {
          if (u.thumbnail_url && map[u.thumbnail_url]) {
            u.thumbnail_url = map[u.thumbnail_url]
          }
        })
      }
    }

    setUploads(fetchedUploads)
    setNotes(fetchedNotes)
    setLoading(false)
  }, [supabase, router])

  useEffect(() => { loadData() }, [loadData])

  const dayGroups = buildDayGroups(uploads, notes, view)

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 md:py-20 animate-fade-in dashboard-surface">
      <div className="bloom-top-right scale-75 opacity-50" />
      
      {/* Header */}
      <div className="relative z-10 flex items-end justify-between mb-16 border-b border-[var(--border-light)] pb-8">
        <div>
          <p className="font-mono text-[10px] tracking-[0.2em] text-[var(--text-tertiary)] mb-3 uppercase font-bold opacity-60">
            Archive · Chronological
          </p>
          <h1 className="font-serif text-5xl font-medium tracking-tight text-[var(--text-primary)] mb-4">
            The Log
          </h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-md leading-relaxed">
            A comprehensive record of state and synthesis. Every session, capture, and insight, preserved in the sequence it occurred.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {username && (
            <Link
              href={`/${username}/log`}
              target="_blank"
              className="btn btn-secondary btn-sm flex items-center gap-2 group transition-all"
            >
              <ExternalLink size={12} className="group-hover:text-[var(--accent)]" />
              Public View
            </Link>
          )}
          <Link href="/dashboard/log/new" className="btn btn-primary btn-sm flex items-center gap-2 shadow-lg shadow-[var(--accent)]/20 hover:shadow-[var(--accent)]/40 transition-all">
            <Plus size={14} />
            Add Entry
          </Link>
        </div>
      </div>

      {/* View tabs */}
      <div className="relative z-10 flex items-center gap-1 mb-12 p-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl w-fit">
        {VIEWS.map(v => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`px-6 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all ${
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
        <div className="space-y-4 relative z-10">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 skeleton rounded-2xl opacity-20" />
          ))}
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="relative z-10 text-center py-40">
          <div className="w-20 h-20 bg-[var(--bg-card)] rounded-3xl border border-[var(--border-light)] flex items-center justify-center mx-auto mb-8 shadow-xl">
             <span className="text-3xl">📋</span>
          </div>
          <p className="font-mono text-[11px] tracking-[0.2em] uppercase text-[var(--text-tertiary)] font-bold mb-3">
            The log is empty
          </p>
          <p className="text-sm text-[var(--text-tertiary)] opacity-60 max-w-xs mx-auto mb-10 leading-relaxed">
            Record a session or capture a thought to begin your life ingestion.
          </p>
          <div className="flex gap-4 items-center justify-center">
            <Link href="/dashboard/log/new" className="btn btn-primary">
              <Plus size={14} /> New Entry
            </Link>
            <Link href="/dashboard/uploads" className="btn btn-secondary">
              Upload Session
            </Link>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Vertical Thread Line */}
          <div className="absolute left-[2.5rem] top-0 bottom-0 w-px bg-[var(--timeline-thread)] z-0 opacity-50" />

          {dayGroups.map((group) => (
            <div key={group.label} className="relative z-10 mb-12 last:mb-0">
              {/* Day header - Glassmorphic Sticky */}
              <div className="sticky top-[-1px] z-30 transition-all py-4 -mx-6 px-6">
                <div className="glass-heavy border-y border-[var(--border-light)] -mx-6 px-10 py-3 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-4">
                    <span className="font-mono text-[11px] font-bold tracking-[0.2em] text-[var(--accent)] uppercase">
                      {group.label}
                    </span>
                    <div className="h-4 w-px bg-[var(--border-light)]" />
                    <span className="font-mono text-[10px] text-[var(--text-tertiary)] opacity-60 uppercase tracking-widest">
                      {group.entries.length} {group.entries.length === 1 ? 'event' : 'events'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Cards Container */}
              <div className="relative mt-4">
                {group.entries.map((entry) => (
                  <LogCard
                    key={entry.id}
                    entry={entry}
                    username={username || undefined}
                    showPrivacyBadge
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="py-24 text-center relative z-10 overflow-hidden">
            <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--border-light)] to-transparent" />
            <span className="relative z-10 bg-[var(--bg-primary)] px-6 font-mono text-[10px] tracking-[0.3em] uppercase text-[var(--text-tertiary)] opacity-40">
              End of Record
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
