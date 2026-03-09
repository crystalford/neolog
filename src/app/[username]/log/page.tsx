import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { LogCard } from '@/components/LogCard'
import { generateSEO } from '@/lib/seo'
import { Rss, ArrowLeft } from 'lucide-react'
import { format, isToday, isYesterday, isSameDay } from 'date-fns'

interface Props {
  params: { username: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('username', params.username)
    .maybeSingle()

  if (!profile) return { title: 'Not Found' }

  return generateSEO({
    title: `${profile.display_name || profile.username}'s Log`,
    description: `The public life log of ${profile.display_name || profile.username} — activity, builds, meals, and everything in between.`,
    url: `/${profile.username}/log`,
  })
}

function formatDateHeader(date: Date): string {
  if (isToday(date)) return 'Today'
  if (isYesterday(date)) return 'Yesterday'
  return format(date, 'EEEE, MMMM d')
}

export default async function PublicLogPage({ params }: Props) {
  const supabase = createClient()

  // Look up profile by username
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url, bio')
    .eq('username', params.username)
    .maybeSingle()

  if (!profile) notFound()

  // Fetch public log entries for this user
  const { data: entries } = await supabase
    .from('log_entries')
    .select(`
      id, entry_type, title, body, logged_at, software_tags,
      cost_delta, is_public, source_upload_id, meta,
      asset:assets(id, name, category)
    `)
    .eq('user_id', profile.id)
    .eq('is_public', true)
    .order('logged_at', { ascending: false })
    .limit(100)

  const allEntries = entries || []

  // Group by day
  type DayGroup = { label: string; date: Date; entries: typeof allEntries }
  const dayGroups: DayGroup[] = []
  for (const entry of allEntries) {
    const entryDate = new Date(entry.logged_at)
    const last = dayGroups[dayGroups.length - 1]
    if (!last || !isSameDay(last.date, entryDate)) {
      dayGroups.push({ label: formatDateHeader(entryDate), date: entryDate, entries: [] })
    }
    dayGroups[dayGroups.length - 1].entries.push(entry)
  }

  return (
    <>
      <Header />
      <main className="pt-16 min-h-screen" style={{ fontFamily: 'var(--font-sans)' }}>
        <div className="max-w-2xl mx-auto px-4 py-10">

          {/* Profile strip */}
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-[var(--border-light)]">
            <Link
              href={`/${profile.username}`}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity flex-1 min-w-0"
            >
              {profile.avatar_url ? (
                <img
                  src={profile.avatar_url}
                  alt={profile.display_name || profile.username}
                  className="w-10 h-10 rounded-full object-cover border border-[var(--border-light)] flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
                  {(profile.display_name || profile.username)[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="font-semibold text-sm text-[var(--text-primary)] truncate">
                  {profile.display_name || profile.username}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] font-mono">
                  @{profile.username} · The Log
                </p>
              </div>
            </Link>

            <div className="flex items-center gap-2 flex-shrink-0">
              <Link
                href={`/${profile.username}`}
                className="btn btn-secondary btn-sm"
              >
                <ArrowLeft size={13} />
                Profile
              </Link>
            </div>
          </div>

          {/* Feed */}
          {dayGroups.length === 0 ? (
            <div className="text-center py-24 opacity-40">
              <span className="text-5xl block mb-4">📋</span>
              <p className="text-sm font-mono tracking-wider uppercase">The log is empty</p>
              <p className="text-xs mt-2 text-[var(--text-tertiary)]">
                Upload a session to start building your public record.
              </p>
            </div>
          ) : (
            <div>
              {dayGroups.map((group) => (
                <div key={group.label}>
                  {/* Day header */}
                  <div
                    className="flex items-center gap-3 py-3 sticky top-16 z-10"
                    style={{ background: 'var(--bg-primary)' }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '10px',
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'var(--text-tertiary)',
                        fontWeight: 700,
                        opacity: 0.7,
                      }}
                    >
                      {group.label}
                    </span>
                    <div className="flex-1 h-px bg-[var(--border-light)] opacity-40" />
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '9px',
                        color: 'var(--text-tertiary)',
                        opacity: 0.4,
                        letterSpacing: '0.08em',
                      }}
                    >
                      {format(group.date, 'MM.dd.yy')}
                    </span>
                  </div>

                  {/* Entries for this day */}
                  <div
                    style={{
                      border: '1px solid var(--border-light)',
                      borderRadius: '10px',
                      overflow: 'hidden',
                      marginBottom: '8px',
                    }}
                  >
                    {group.entries.map((entry) => (
                      <LogCard
                        key={entry.id}
                        entry={{
                          ...entry,
                          software_tags: entry.software_tags ?? [],
                          cost_delta: entry.cost_delta ?? null,
                          asset: entry.asset as any ?? null,
                        }}
                        username={profile.username}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Feed footer */}
              <div className="py-12 text-center">
                <p
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '9px',
                    letterSpacing: '0.14em',
                    textTransform: 'uppercase',
                    color: 'var(--text-tertiary)',
                    opacity: 0.4,
                  }}
                >
                  End of log
                </p>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
