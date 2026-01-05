'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Rss, Radio, Inbox, BarChart3, Clock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function MonitorsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inboxNewCount, setInboxNewCount] = useState<number>(0)
  const [sourcesStaleCount, setSourcesStaleCount] = useState<number>(0)
  const [syndicationErrorCount, setSyndicationErrorCount] = useState<number>(0)
  const [scheduledDueSoonCount, setScheduledDueSoonCount] = useState<number>(0)

  const hasAnyIssues = useMemo(
    () => inboxNewCount + sourcesStaleCount + syndicationErrorCount + scheduledDueSoonCount > 0,
    [inboxNewCount, sourcesStaleCount, syndicationErrorCount, scheduledDueSoonCount]
  )

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)

      const {
        data: { session },
      } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const authorId = session.user.id
      const now = new Date()
      const staleCutoff = new Date(now)
      staleCutoff.setDate(staleCutoff.getDate() - 7)
      const dueSoonCutoff = new Date(now)
      dueSoonCutoff.setHours(dueSoonCutoff.getHours() + 24)

      try {
        const [{ count: inboxCount }, { count: staleSources }, { count: syndicationErrors }, { count: dueSoon }]
          = await Promise.all([
            supabase
              .from('inbox_items')
              .select('id', { count: 'exact', head: true })
              .eq('status', 'new'),

            supabase
              .from('feed_sources')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', authorId)
              .or(`last_fetched_at.is.null,last_fetched_at.lt.${staleCutoff.toISOString()}`),

            supabase
              .from('post_syndications')
              .select('post_id', { count: 'exact', head: true })
              .eq('author_id', authorId)
              .or('status.eq.error,error_message.not.is.null'),

            supabase
              .from('posts')
              .select('id', { count: 'exact', head: true })
              .eq('author_id', authorId)
              .eq('status', 'scheduled')
              .lte('scheduled_at', dueSoonCutoff.toISOString()),
          ])

        setInboxNewCount(inboxCount || 0)
        setSourcesStaleCount(staleSources || 0)
        setSyndicationErrorCount(syndicationErrors || 0)
        setScheduledDueSoonCount(dueSoon || 0)
      } catch {
        setError('Failed to load monitor data.')
      } finally {
        setLoading(false)
      }
    }

    void load()
  }, [router, supabase])

  return (
    <div className="p-6 lg:p-12">
      <div className="max-w-4xl">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-2xl font-display text-[var(--text-primary)]">Monitors</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              A single place to watch your feeds, syndication, inbox, and performance signals.
            </p>
            {error && (
              <p className="text-sm text-[var(--error)] mt-2">{error}</p>
            )}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/sources"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Rss size={16} />
              <span className="font-medium">Sources</span>
              {!loading && sourcesStaleCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--error)]/10 text-[var(--error)]">
                  {sourcesStaleCount} stale
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Manage RSS sources and automation settings.
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Stale means never fetched or &gt;7 days.
            </p>
          </Link>

          <Link
            href="/inbox"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Inbox size={16} />
              <span className="font-medium">Inbox</span>
              {!loading && inboxNewCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  {inboxNewCount} new
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Review incoming items and convert them to drafts.
            </p>
          </Link>

          <Link
            href="/syndication"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Radio size={16} />
              <span className="font-medium">Syndication</span>
              {!loading && syndicationErrorCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--error)]/10 text-[var(--error)]">
                  {syndicationErrorCount} errors
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Track external distributions and status.
            </p>
          </Link>

          <Link
            href="/dashboard"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <Clock size={16} />
              <span className="font-medium">Publishing</span>
              {!loading && scheduledDueSoonCount > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  {scheduledDueSoonCount} due soon
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              Scheduled drafts and recent activity.
            </p>
          </Link>

          <Link
            href="/analytics"
            className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
          >
            <div className="flex items-center gap-2 text-[var(--text-primary)]">
              <BarChart3 size={16} />
              <span className="font-medium">Analytics</span>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mt-2">
              View performance and engagement trends.
            </p>
          </Link>
        </div>

        <div className="mt-6 p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-2 text-[var(--text-primary)]">
            {hasAnyIssues ? <AlertTriangle size={16} /> : <Eye size={16} />}
            <span className="font-medium">{hasAnyIssues ? 'Attention needed' : 'All clear'}</span>
          </div>
          <p className="text-sm text-[var(--text-secondary)] mt-2">
            {hasAnyIssues
              ? 'Open the cards above to resolve outstanding items.'
              : 'No urgent items detected. (Monitors will expand into alerts and rollups per v3.1.)'}
          </p>
        </div>
      </div>
    </div>
  )
}
