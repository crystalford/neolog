'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { LogCard, type LogEntry } from '@/components/LogCard'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'
import { Plus, ExternalLink } from 'lucide-react'

function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d · yyyy')
}

export default function TimelinePage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadEntries()
  }, [])

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
        cost_delta, is_public, source_upload_id, meta,
        asset:assets(id, name, category)
      `)
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })
      .limit(200)

    setEntries((data || []) as unknown as LogEntry[])
    setLoading(false)
  }

  type DayGroup = { label: string; date: Date; entries: LogEntry[] }
  const dayGroups: DayGroup[] = []
  for (const entry of entries) {
    const d = new Date(entry.logged_at)
    const last = dayGroups[dayGroups.length - 1]
    if (!last || !isSameDay(last.date, d)) {
      dayGroups.push({ label: formatDateHeader(d), date: d, entries: [] })
    }
    dayGroups[dayGroups.length - 1].entries.push(entry)
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 md:py-12" style={{ fontFamily: 'var(--font-sans)' }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            ALL TIME · CHRONOLOGICAL
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            The Log
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Your complete life record — auto-generated and manually added.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {username && (
            <Link
              href={`/${username}/log`}
              target="_blank"
              className="btn btn-secondary btn-sm flex items-center gap-1"
            >
              <ExternalLink size={13} />
              Public
            </Link>
          )}
          <Link href="/dashboard/log/new" className="btn btn-primary btn-sm flex items-center gap-1">
            <Plus size={14} />
            New Entry
          </Link>
        </div>
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
            The log is empty
          </p>
          <p className="text-xs mt-2 text-[var(--text-tertiary)]">
            Upload a session or add a manual entry to begin.
          </p>
          <div className="flex gap-3 items-center justify-center mt-6">
            <Link href="/dashboard/log/new" className="btn btn-primary btn-sm">
              <Plus size={13} /> New Entry
            </Link>
            <Link href="/dashboard/uploads" className="btn btn-secondary btn-sm">
              Upload Session
            </Link>
          </div>
        </div>
      ) : (
        <div>
          {dayGroups.map((group) => (
            <div key={group.label} style={{ marginBottom: '2rem' }}>
              {/* Day header - Fixed Sticky Glitch */}
              <div
                style={{ 
                  position: 'sticky', 
                  top: '0', 
                  zIndex: 20, 
                  background: 'var(--bg-primary)',
                  padding: '16px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  borderBottom: '1px solid var(--border-light)',
                  margin: '0 -16px 12px -16px',
                  paddingLeft: '16px',
                  paddingRight: '16px'
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
              <div style={{
                border: '1px solid var(--border-light)',
                borderRadius: '10px',
                overflow: 'hidden',
                background: 'var(--bg-primary)',
                position: 'relative',
                zIndex: 1,
              }}>
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
              End of log
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
