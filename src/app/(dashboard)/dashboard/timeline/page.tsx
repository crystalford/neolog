'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LogCard, type LogEntry } from '@/components/LogCard'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { Plus, Video, Lightbulb, AlignLeft } from 'lucide-react'

function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d · yyyy')
}

type View = 'all' | 'videos' | 'ideas'

const VIEWS: { id: View; label: string; icon: typeof Video }[] = [
  { id: 'all',    label: 'All',    icon: AlignLeft  },
  { id: 'videos', label: 'Videos', icon: Video      },
  { id: 'ideas',  label: 'Ideas',  icon: Lightbulb  },
]

export default function TimelinePage() {
  const [entries, setEntries]   = useState<LogEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const [view, setView]         = useState<View>('all')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => { loadEntries() }, [])

  async function loadEntries() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()

    setUsername(profile?.username || null)

    const { data } = await supabase
      .from('log_entries')
      .select(`
        id, entry_type, title, body, logged_at, software_tags,
        cost_delta, is_public, source_upload_id, thumbnail_url, meta,
        asset:assets(id, name, category)
      `)
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })
      .limit(500)

    // Generate signed URLs for thumbnails stored as storage paths
    const entries = (data || []) as unknown as LogEntry[]
    const thumbPaths = entries
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
        for (const e of entries) {
          if (e.thumbnail_url && signedMap[e.thumbnail_url]) {
            e.thumbnail_url = signedMap[e.thumbnail_url]
          }
        }
      }
    }

    setEntries(entries)
    setLoading(false)
  }

  // Filter by view
  const filtered = entries.filter(e => {
    if (view === 'videos') return e.entry_type === 'session' || e.entry_type === 'video'
    if (view === 'ideas')  return e.entry_type === 'capture' || e.entry_type === 'idea' || e.entry_type === 'note'
    return true
  })

  type DayGroup = { label: string; date: Date; entries: LogEntry[] }
  const dayGroups: DayGroup[] = []
  for (const entry of filtered) {
    const d = new Date(entry.logged_at)
    const last = dayGroups[dayGroups.length - 1]
    if (!last || !isSameDay(last.date, d)) {
      dayGroups.push({ label: formatDateHeader(d), date: d, entries: [] })
    }
    dayGroups[dayGroups.length - 1].entries.push(entry)
  }

  return (
    <div className="px-6 py-8 max-w-5xl mx-auto" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            Chronological · All Time
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Timeline
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Everything captured — videos, notes, ideas — in order.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          {username && (
            <Link
              href={`/${username}/log`}
              target="_blank"
              className="btn btn-secondary btn-sm"
            >
              Public
            </Link>
          )}
          <Link href="/dashboard/log/new" className="btn btn-primary btn-sm flex items-center gap-1">
            <Plus size={14} />
            New Entry
          </Link>
        </div>
      </div>

      {/* View tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl w-fit">
        {VIEWS.map(v => {
          const Icon = v.icon
          return (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === v.id
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] border border-[var(--border-light)] shadow-sm'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={13} />
              {v.label}
            </button>
          )
        })}
      </div>

      {/* Feed */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 skeleton rounded-xl" />
          ))}
        </div>
      ) : dayGroups.length === 0 ? (
        <div className="text-center py-24 opacity-40">
          <span className="text-5xl block mb-4">📋</span>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {view === 'all' ? 'Nothing yet' : `No ${view} entries yet`}
          </p>
          <p className="text-xs mt-2 text-[var(--text-tertiary)]">
            Upload a video or add a manual entry to begin.
          </p>
          <div className="flex gap-3 items-center justify-center mt-6">
            <Link href="/dashboard/log/new" className="btn btn-primary btn-sm">
              <Plus size={13} /> New Entry
            </Link>
            <Link href="/dashboard/uploads" className="btn btn-secondary btn-sm">
              Upload Video
            </Link>
          </div>
        </div>
      ) : (
        <div>
          {dayGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: '2rem' }}>
              {/* Day header */}
              <div
                style={{
                  position: 'sticky',
                  top: '0',
                  zIndex: 20,
                  background: 'var(--bg-primary)',
                  padding: '14px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderBottom: '1px solid var(--border-light)',
                  marginBottom: '12px',
                }}
              >
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '10px',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: 'var(--text-tertiary)',
                  fontWeight: 700,
                  opacity: 0.7,
                }}>
                  {group.label}
                </span>
                <div className="flex-1 h-px bg-[var(--border-light)] opacity-40" />
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--text-tertiary)',
                  opacity: 0.4,
                }}>
                  {group.entries.length} {group.entries.length === 1 ? 'entry' : 'entries'}
                </span>
              </div>

              {/* Cards */}
              <div className="rounded-xl border border-[var(--border-light)] overflow-hidden bg-[var(--bg-primary)]">
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

          <div className="py-12 text-center">
            <p style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '9px',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: 'var(--text-tertiary)',
              opacity: 0.4,
            }}>
              End of timeline
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
