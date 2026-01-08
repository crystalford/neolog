'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, Rss, Radio, Inbox, BarChart3, Clock, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { readSelectedPublicationId } from '@/lib/publicationContext'

type QueueItem = {
  id: string
  title: string | null
  canonical_url: string | null
  source_url: string | null
  source_type: string
  status: 'new' | 'imported' | 'ignored'
  raw_data: any
  created_at: string
}

type JobRunRow = {
  id: string
  status: 'running' | 'success' | 'error'
  started_at: string
  finished_at: string | null
  error_message: string | null
  meta: any
  jobs?: Array<{ name: string }> | null
}

function formatDurationMs(durationMs: number | null): string {
  if (!durationMs || durationMs <= 0) return '—'
  if (durationMs < 1000) return `${durationMs}ms`
  const seconds = Math.round(durationMs / 100) / 10
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.round((durationMs / 60000) * 10) / 10
  return `${minutes}m`
}

function normalizeTags(input: unknown): string[] {
  const tags = Array.isArray(input) ? input : []
  return tags
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 50)
}

function toCapturePayload(item: QueueItem): {
  type: 'link' | 'text' | 'fragment'
  title: string | null
  content: string
  tags: string[]
  source: string
  sourceUrl: string | null
  meta: Record<string, any>
} {
  const title = item.title || (typeof item.raw_data?.title === 'string' ? item.raw_data.title : null)
  const tags = normalizeTags(item.raw_data?.tags)

  const canonicalUrl = item.canonical_url || (typeof item.raw_data?.canonical_url === 'string' ? item.raw_data.canonical_url : null)
  const sourceUrl = item.source_url || (typeof item.raw_data?.source_url === 'string' ? item.raw_data.source_url : null)

  if (canonicalUrl) {
    return {
      type: 'link',
      title,
      content: canonicalUrl,
      tags,
      source: item.source_type,
      sourceUrl: canonicalUrl,
      meta: {
        inbox_item_id: item.id,
        canonical_url: canonicalUrl,
        source_url: sourceUrl,
        raw_data: item.raw_data || {},
      },
    }
  }

  const content =
    (typeof item.raw_data?.content === 'string' ? item.raw_data.content : null) ||
    (typeof item.raw_data?.content_html === 'string' ? item.raw_data.content_html : null) ||
    ''

  return {
    type: content.length > 400 ? 'text' : 'fragment',
    title,
    content,
    tags,
    source: item.source_type,
    sourceUrl,
    meta: {
      inbox_item_id: item.id,
      canonical_url: canonicalUrl,
      source_url: sourceUrl,
      raw_data: item.raw_data || {},
    },
  }
}

export default function MonitorsPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [inboxNewCount, setInboxNewCount] = useState<number>(0)
  const [sourcesStaleCount, setSourcesStaleCount] = useState<number>(0)
  const [syndicationErrorCount, setSyndicationErrorCount] = useState<number>(0)
  const [scheduledDueSoonCount, setScheduledDueSoonCount] = useState<number>(0)

  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const [jobRuns, setJobRuns] = useState<JobRunRow[]>([])

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
        const [
          { count: inboxCount },
          { count: staleSources },
          { count: syndicationErrors },
          { count: dueSoon },
          { data: queue },
          { data: runs },
        ]
          = await Promise.all([
            supabase
              .from('inbox_items')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', authorId)
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

            supabase
              .from('inbox_items')
              .select('id, title, canonical_url, source_url, source_type, status, raw_data, created_at')
              .eq('user_id', authorId)
              .eq('status', 'new')
              .order('created_at', { ascending: false })
              .limit(20),

            supabase
              .from('job_runs')
              .select('id, status, started_at, finished_at, error_message, meta, jobs(name)')
              .order('started_at', { ascending: false })
              .limit(50),
          ])

        setInboxNewCount(inboxCount || 0)
        setSourcesStaleCount(staleSources || 0)
        setSyndicationErrorCount(syndicationErrors || 0)
        setScheduledDueSoonCount(dueSoon || 0)
        setQueueItems((queue || []) as QueueItem[])
        const filteredRuns = (runs || []).filter((run: any) => {
          const runUserId = typeof run?.meta?.user_id === 'string' ? run.meta.user_id : null
          return !runUserId || runUserId === authorId
        })
        setJobRuns(filteredRuns.slice(0, 10) as unknown as JobRunRow[])
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
            {actionError && (
              <p className="text-sm text-[var(--error)] mt-2">{actionError}</p>
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
            href="/dashboard/analytics"
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

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Review queue</h2>
            <Link
              href="/inbox"
              className="text-sm text-[var(--accent)] hover:underline"
            >
              Open Inbox
            </Link>
          </div>

          <div className="mt-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden">
            {loading ? (
              <div className="p-4 text-sm text-[var(--text-secondary)]">Loading…</div>
            ) : queueItems.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-secondary)]">No new inbox items to review.</div>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {queueItems.map((item) => {
                  const title = item.title || item.raw_data?.title || 'Untitled'
                  const url = item.canonical_url || item.source_url || null
                  const createdAt = new Date(item.created_at).toLocaleString()

                  return (
                    <div key={item.id} className="p-4 flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{String(title)}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]">
                            {item.source_type}
                          </span>
                        </div>
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="block text-xs text-[var(--text-tertiary)] hover:underline mt-1 truncate"
                          >
                            {url}
                          </a>
                        )}
                        <div className="text-xs text-[var(--text-tertiary)] mt-1">{createdAt}</div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          disabled={promotingId === item.id}
                          onClick={async () => {
                            if (promotingId) return
                            setActionError(null)
                            setPromotingId(item.id)

                            try {
                              const payload = toCapturePayload(item)
                              const publicationId = readSelectedPublicationId()

                              const resp = await fetch('/api/capture', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  type: payload.type,
                                  title: payload.title,
                                  content: payload.content,
                                  tags: payload.tags,
                                  publication_id: publicationId || null,
                                  source: payload.source,
                                  sourceUrl: payload.sourceUrl,
                                  meta: payload.meta,
                                }),
                              })

                              const json = await resp.json().catch(() => null)
                              if (!resp.ok || !json?.id) {
                                setActionError(json?.error || 'Failed to promote to Capture.')
                                setPromotingId(null)
                                return
                              }

                              const promotedMeta = {
                                ...(item.raw_data || {}),
                                promoted_to_capture_asset_id: json.id,
                                promoted_to_capture_at: new Date().toISOString(),
                              }

                              await supabase
                                .from('inbox_items')
                                .update({ status: 'ignored', raw_data: promotedMeta })
                                .eq('id', item.id)

                              setQueueItems((prev) => prev.filter((row) => row.id !== item.id))
                              setInboxNewCount((prev) => Math.max(0, prev - 1))
                            } catch {
                              setActionError('Failed to promote to Capture.')
                            } finally {
                              setPromotingId(null)
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-60"
                        >
                          {promotingId === item.id ? 'Promoting…' : 'Promote to Capture'}
                        </button>

                        <button
                          disabled={promotingId === item.id}
                          onClick={async () => {
                            if (promotingId) return
                            setActionError(null)
                            setPromotingId(item.id)

                            try {
                              await supabase
                                .from('inbox_items')
                                .update({ status: 'ignored' })
                                .eq('id', item.id)

                              setQueueItems((prev) => prev.filter((row) => row.id !== item.id))
                              setInboxNewCount((prev) => Math.max(0, prev - 1))
                            } catch {
                              setActionError('Failed to update inbox item.')
                            } finally {
                              setPromotingId(null)
                            }
                          }}
                          className="px-3 py-1.5 rounded-lg text-sm font-medium border border-[var(--border-light)] text-[var(--text-secondary)] hover:border-[var(--border-medium)] disabled:opacity-60"
                        >
                          Ignore
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Automation runs</h2>
            <span className="text-xs text-[var(--text-tertiary)]">Last 10</span>
          </div>

          <div className="mt-3 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden">
            {loading ? (
              <div className="p-4 text-sm text-[var(--text-secondary)]">Loading…</div>
            ) : jobRuns.length === 0 ? (
              <div className="p-4 text-sm text-[var(--text-secondary)]">
                No job runs recorded yet. (Apply the jobs/job_runs migrations and trigger a cron endpoint.)
              </div>
            ) : (
              <div className="divide-y divide-[var(--border-light)]">
                {jobRuns.map((run) => {
                  const jobName = run.jobs?.[0]?.name || 'job'
                  const durationMs =
                    typeof run.meta?.duration_ms === 'number'
                      ? run.meta.duration_ms
                      : run.finished_at
                        ? new Date(run.finished_at).getTime() - new Date(run.started_at).getTime()
                        : null

                  const statusClass =
                    run.status === 'success'
                      ? 'bg-[var(--success)]/10 text-[var(--success)]'
                      : run.status === 'error'
                        ? 'bg-[var(--error)]/10 text-[var(--error)]'
                        : 'bg-[var(--accent-soft)] text-[var(--accent)]'

                  return (
                    <div key={run.id} className="p-4 flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[var(--text-primary)] truncate">{jobName}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass}`}>{run.status}</span>
                          <span className="ml-auto text-xs text-[var(--text-tertiary)]">
                            {formatDurationMs(durationMs)}
                          </span>
                        </div>
                        <div className="text-xs text-[var(--text-tertiary)] mt-1">
                          {new Date(run.started_at).toLocaleString()}
                        </div>
                        {run.status === 'error' && run.error_message && (
                          <div className="text-xs text-[var(--error)] mt-2">{run.error_message}</div>
                        )}
                        {typeof run.meta?.inserted === 'number' && (
                          <div className="text-xs text-[var(--text-tertiary)] mt-2">
                            inserted: {run.meta.inserted}
                            {typeof run.meta?.converted === 'number' ? ` • converted: ${run.meta.converted}` : ''}
                            {typeof run.meta?.convert_failed === 'number' ? ` • convert_failed: ${run.meta.convert_failed}` : ''}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
