'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { onSelectedPublicationIdChange, readSelectedPublicationId, writeSelectedPublicationId } from '@/lib/publicationContext'
import {
  Eye, Clock, Users,
  Monitor, Smartphone, Tablet, ExternalLink,
  BarChart3, Target
} from 'lucide-react'

type PostWithViews = {
  id: string
  title: string
  slug: string
  published_at: string | null
  total_views: number
  unique_viewers: number
  avg_time_on_page: number
  avg_scroll_depth: number
  completion_rate: number
}

type DailyData = {
  date: string
  views: number
  uniques: number
}

type ReferrerData = {
  domain: string
  count: number
}

type UsageSummaryRow = {
  provider: string
  model: string | null
  calls: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState<PostWithViews[]>([])
  const [hasPublishedOutsideSelection, setHasPublishedOutsideSelection] = useState(false)
  const [selectedPublicationName, setSelectedPublicationName] = useState<string | null>(null)
  const [totals, setTotals] = useState({
    views: 0,
    uniques: 0,
    avgTime: 0,
    avgScroll: 0,
    avgCompletion: 0,
  })
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [referrers, setReferrers] = useState<ReferrerData[]>([])
  const [devices, setDevices] = useState({ desktop: 0, mobile: 0, tablet: 0 })
  const [usageLoading, setUsageLoading] = useState(true)
  const [usageError, setUsageError] = useState<string | null>(null)
  const [usageSummary, setUsageSummary] = useState<UsageSummaryRow[]>([])
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')
  
  const supabase = createClient()

  useEffect(() => {
    loadAnalytics()
    loadUsage()

    const unsubscribe = onSelectedPublicationIdChange(() => {
      loadAnalytics()
    })

    return unsubscribe
  }, [dateRange])

  const loadUsage = async () => {
    setUsageLoading(true)
    setUsageError(null)

    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90

    try {
      const res = await fetch(`/api/usage?days=${daysAgo}`)
      if (!res.ok) {
        setUsageSummary([])
        setUsageError('Usage unavailable.')
        setUsageLoading(false)
        return
      }

      const json = await res.json()
      const summary = Array.isArray(json?.summary) ? (json.summary as UsageSummaryRow[]) : []
      setUsageSummary(summary)
    } catch {
      setUsageSummary([])
      setUsageError('Usage unavailable.')
    } finally {
      setUsageLoading(false)
    }
  }

  const loadAnalytics = async () => {
    setLoading(true)
    setHasPublishedOutsideSelection(false)
    setPosts([])
    setTotals({ views: 0, uniques: 0, avgTime: 0, avgScroll: 0, avgCompletion: 0 })
    setDailyData([])
    setReferrers([])
    setDevices({ desktop: 0, mobile: 0, tablet: 0 })
    
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const selectedPublicationId = readSelectedPublicationId()
    setSelectedPublicationName(null)
    if (selectedPublicationId) {
      const { data: pubData } = await supabase
        .from('publications')
        .select('name')
        .eq('id', selectedPublicationId)
        .maybeSingle()

      if (pubData?.name) setSelectedPublicationName(pubData.name)
    }

    // Get user's posts
    let postsQuery = supabase
      .from('posts')
      .select('id, title, slug, published_at')
      .eq('author_id', session.user.id)
      // Treat any post with a published_at as eligible for analytics, even if later archived.
      .or('status.eq.published,published_at.not.is.null')
      .order('published_at', { ascending: false })

    if (selectedPublicationId) {
      postsQuery = postsQuery.eq('publication_id', selectedPublicationId)
    }

    const { data: userPosts } = await postsQuery

    if (!userPosts || userPosts.length === 0) {
      if (selectedPublicationId) {
        const { data: anyPublished } = await supabase
          .from('posts')
          .select('id')
          .eq('author_id', session.user.id)
          .or('status.eq.published,published_at.not.is.null')
          .limit(1)

        if (anyPublished && anyPublished.length > 0) {
          setHasPublishedOutsideSelection(true)
        }
      }
      setLoading(false)
      return
    }

    const postIds = userPosts.map(p => p.id)
    
    // Calculate date range
    const daysAgo = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - daysAgo)

    // Get views for these posts
    const { data: views } = await supabase
      .from('post_views')
      .select('*')
      .in('post_id', postIds)
      .gte('started_at', startDate.toISOString())

    if (!views) {
      setLoading(false)
      return
    }

    // Calculate per-post stats
    const postStats: PostWithViews[] = userPosts.map(post => {
      const postViews = views.filter(v => v.post_id === post.id)
      const uniqueSessions = new Set(postViews.map(v => v.session_id)).size
      
      return {
        ...post,
        total_views: postViews.length,
        unique_viewers: uniqueSessions,
        avg_time_on_page: postViews.length > 0 
          ? Math.round(postViews.reduce((sum, v) => sum + (v.time_on_page || 0), 0) / postViews.length)
          : 0,
        avg_scroll_depth: postViews.length > 0
          ? Math.round(postViews.reduce((sum, v) => sum + (v.scroll_depth || 0), 0) / postViews.length)
          : 0,
        completion_rate: postViews.length > 0
          ? Math.round((postViews.filter(v => v.read_complete).length / postViews.length) * 100)
          : 0,
      }
    }).sort((a, b) => b.total_views - a.total_views)

    setPosts(postStats)

    // Calculate totals
    const totalViews = views.length
    const uniqueSessions = new Set(views.map(v => v.session_id)).size
    const avgTime = views.length > 0
      ? Math.round(views.reduce((sum, v) => sum + (v.time_on_page || 0), 0) / views.length)
      : 0
    const avgScroll = views.length > 0
      ? Math.round(views.reduce((sum, v) => sum + (v.scroll_depth || 0), 0) / views.length)
      : 0
    const avgCompletion = views.length > 0
      ? Math.round((views.filter(v => v.read_complete).length / views.length) * 100)
      : 0

    setTotals({
      views: totalViews,
      uniques: uniqueSessions,
      avgTime,
      avgScroll,
      avgCompletion,
    })

    // Calculate daily data
    const dailyMap: { [date: string]: { views: number; sessions: Set<string> } } = {}
    views.forEach(v => {
      const date = new Date(v.started_at).toISOString().split('T')[0]
      if (!dailyMap[date]) {
        dailyMap[date] = { views: 0, sessions: new Set() }
      }
      dailyMap[date].views++
      dailyMap[date].sessions.add(v.session_id)
    })

    const daily: DailyData[] = Object.entries(dailyMap)
      .map(([date, data]) => ({
        date,
        views: data.views,
        uniques: data.sessions.size,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))

    setDailyData(daily)

    // Calculate referrers
    const referrerMap: { [domain: string]: number } = {}
    views.forEach(v => {
      const domain = v.referrer_domain || 'Direct'
      referrerMap[domain] = (referrerMap[domain] || 0) + 1
    })

    const refs = Object.entries(referrerMap)
      .map(([domain, count]) => ({ domain, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    setReferrers(refs)

    // Calculate device breakdown
    const deviceCounts = { desktop: 0, mobile: 0, tablet: 0 }
    views.forEach(v => {
      if (v.device_type) {
        deviceCounts[v.device_type as keyof typeof deviceCounts]++
      }
    })
    setDevices(deviceCounts)

    setLoading(false)
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // Simple sparkline component
  const Sparkline = ({ data, height = 40 }: { data: number[], height?: number }) => {
    if (data.length === 0) return null
    const max = Math.max(...data, 1)
    const width = 100
    const points = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = height - (v / max) * height
      return `${x},${y}`
    }).join(' ')

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-10">
        <polyline
          points={points}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  const getTrend = () => {
    if (dailyData.length < 7) return { change: 0, direction: 'flat' as const }
    const recent = dailyData.slice(-7).reduce((sum, day) => sum + day.views, 0)
    const previous = dailyData.slice(-14, -7).reduce((sum, day) => sum + day.views, 0)
    if (previous === 0) return { change: 0, direction: 'flat' as const }
    const change = Math.round(((recent - previous) / previous) * 100)
    const direction = change > 5 ? 'up' : change < -5 ? 'down' : 'flat'
    return { change, direction }
  }

  return (
    <main className="pb-16">
      <div className="max-w-7xl mx-auto px-6 lg:px-12">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-6 mb-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Analytics</p>
            <h1 className="font-display text-3xl text-[var(--text-primary)]">Reader intelligence</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              See how readers engage with your content.
            </p>
          </div>
            
          {/* Date range selector */}
          <div className="flex gap-1 p-1 bg-[var(--bg-primary)] rounded-lg border border-[var(--border-light)]">
            {(['7d', '30d', '90d'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                  dateRange === range
                    ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {range === '7d' ? '7 days' : range === '30d' ? '30 days' : '90 days'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 rounded-xl bg-[var(--bg-tertiary)] animate-pulse border border-[var(--border-light)]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <BarChart3 size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
            <h2 className="font-display text-2xl tracking-tight text-[var(--text-primary)] mb-2">
              {hasPublishedOutsideSelection && selectedPublicationName
                ? `No published posts for “${selectedPublicationName}”`
                : hasPublishedOutsideSelection
                  ? 'No published posts for the selected publication'
                  : 'No published posts yet'}
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-6">
              {hasPublishedOutsideSelection
                ? 'You have published posts, but they are outside the current publication filter.'
                : 'Publish your first post to start seeing analytics.'}
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              {hasPublishedOutsideSelection && (
                <button
                  type="button"
                  onClick={() => writeSelectedPublicationId(null)}
                  className="btn btn-secondary"
                >
                  Show all publications
                </button>
              )}
              <Link href="/write" className="btn btn-primary">
                Write a post
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Overview cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--border-light)]">
                    <Eye size={18} className="text-[var(--accent)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Total Views</span>
                </div>
                <p className="font-display text-3xl tracking-tight text-[var(--text-primary)]">{totals.views.toLocaleString()}</p>
                <Sparkline data={dailyData.map(d => d.views)} />
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--border-light)]">
                    <Users size={18} className="text-[var(--accent)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Unique Readers</span>
                </div>
                <p className="font-display text-3xl tracking-tight text-[var(--text-primary)]">{totals.uniques.toLocaleString()}</p>
                <Sparkline data={dailyData.map(d => d.uniques)} />
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--border-light)]">
                    <Clock size={18} className="text-[var(--accent)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Avg. Read Time</span>
                </div>
                <p className="font-display text-3xl tracking-tight text-[var(--text-primary)]">{formatTime(totals.avgTime)}</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-2">
                  {totals.avgScroll}% avg. scroll depth
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center border border-[var(--border-light)]">
                    <Target size={18} className="text-[var(--accent)]" />
                  </div>
                  <span className="text-sm font-medium text-[var(--text-secondary)]">Completion Rate</span>
                </div>
                <p className="font-display text-3xl tracking-tight text-[var(--text-primary)]">{totals.avgCompletion}%</p>
                <p className="text-sm text-[var(--text-tertiary)] mt-2">
                  Readers who finish
                </p>
              </div>
            </div>

            {/* Narrative insights */}
            <div className="grid lg:grid-cols-3 gap-6 mb-8">
              <div className="lg:col-span-2 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">Insights</p>
                <h2 className="font-display text-xl text-[var(--text-primary)] mb-4">What to focus on next</h2>
                <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                  {(() => {
                    const trend = getTrend()
                    if (trend.direction === 'up') {
                      return (
                        <p>
                          Momentum is up. Views are <span className="text-[var(--text-primary)] font-medium">{Math.abs(trend.change)}%</span> higher than the previous week.
                        </p>
                      )
                    }
                    if (trend.direction === 'down') {
                      return (
                        <p>
                          Views dipped <span className="text-[var(--text-primary)] font-medium">{Math.abs(trend.change)}%</span> versus last week. Consider republishing a top performer or sharing to a new channel.
                        </p>
                      )
                    }
                    return (
                      <p>
                        Views are steady. Try shipping a shorter post or adding a stronger hook to lift completion.
                      </p>
                    )
                  })()}
                  <p>
                    Average completion sits at <span className="text-[var(--text-primary)] font-medium">{totals.avgCompletion}%</span>. If it's under 50%, tighten intros or add subheads every 2-3 paragraphs.
                  </p>
                  <p>
                    Your strongest referrer is <span className="text-[var(--text-primary)] font-medium">{referrers[0]?.domain || 'Direct'}</span>. Double down there with a tailored share.
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">Spotlight</p>
                <h3 className="font-display text-lg text-[var(--text-primary)] mb-3">Top post</h3>
                {posts[0] ? (
                  <div className="space-y-2">
                    <p className="font-medium text-[var(--text-primary)]">{posts[0].title}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {posts[0].total_views.toLocaleString()} views - {posts[0].completion_rate}% completion
                    </p>
                    <Link
                      href={`/analytics/${posts[0].id}`}
                      className="inline-flex items-center gap-2 text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                    >
                      Deep dive
                      <ExternalLink size={12} />
                    </Link>
                  </div>
                ) : (
                  <p className="text-sm text-[var(--text-tertiary)]">No data yet.</p>
                )}
              </div>
            </div>

            {/* Two column layout */}
            <div className="grid lg:grid-cols-3 gap-8">
              {/* Posts table */}
              <div className="lg:col-span-2">
                <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] overflow-hidden shadow-sm">
                  <div className="p-4 border-b border-[var(--border-light)] flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Performance</p>
                      <h2 className="font-display text-lg text-[var(--text-primary)]">Top posts</h2>
                    </div>
                    <Link href="/dashboard" className="text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                      View all
                    </Link>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full data-table">
                      <thead>
                        <tr>
                          <th className="text-left">Post</th>
                          <th className="text-right">Views</th>
                          <th className="text-right">Uniques</th>
                          <th className="text-right">Avg. Time</th>
                          <th className="text-right">Completion</th>
                        </tr>
                      </thead>
                      <tbody>
                        {posts.slice(0, 10).map((post) => (
                          <tr
                            key={post.id}
                            className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-secondary)] transition-colors"
                          >
                            <td>
                              <p className="font-medium text-[var(--text-primary)] truncate max-w-xs">{post.title}</p>
                              <p className="text-sm text-[var(--text-tertiary)]">
                                {formatDate(post.published_at)}
                              </p>
                            </td>
                            <td className="text-right font-mono text-sm text-[var(--text-primary)]">
                              {post.total_views.toLocaleString()}
                            </td>
                            <td className="text-right font-mono text-sm text-[var(--text-primary)]">
                              {post.unique_viewers.toLocaleString()}
                            </td>
                            <td className="text-right font-mono text-sm text-[var(--text-primary)]">
                              {formatTime(post.avg_time_on_page)}
                            </td>
                            <td className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[var(--accent)] rounded-full"
                                    style={{ width: `${post.completion_rate}%` }}
                                  />
                                </div>
                                <span className="font-mono text-sm w-10 text-right text-[var(--text-primary)]">
                                  {post.completion_rate}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* AI usage */}
                <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-4 shadow-sm">
                  <h3 className="font-display text-lg text-[var(--text-primary)] mb-2">AI usage</h3>
                  <p className="text-xs text-[var(--text-tertiary)] mb-4">Token totals for the selected range.</p>

                  {usageLoading ? (
                    <div className="space-y-3">
                      <div className="h-6 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                      <div className="h-4 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                      <div className="h-4 rounded bg-[var(--bg-tertiary)] animate-pulse" />
                    </div>
                  ) : usageError ? (
                    <p className="text-sm text-[var(--text-tertiary)]">{usageError}</p>
                  ) : usageSummary.length === 0 ? (
                    <p className="text-sm text-[var(--text-tertiary)]">No usage recorded yet.</p>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-baseline justify-between">
                        <span className="text-sm text-[var(--text-secondary)]">Total</span>
                        <span className="font-mono text-sm text-[var(--text-primary)]">
                          {usageSummary.reduce((sum, r) => sum + (r.total_tokens || 0), 0).toLocaleString()} tokens
                        </span>
                      </div>

                      <div className="h-px bg-[var(--border-light)]" />

                      {usageSummary.slice(0, 5).map((row) => (
                        <div key={`${row.provider}::${row.model || ''}`} className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm text-[var(--text-primary)] truncate">
                              {row.provider}{row.model ? ` · ${row.model}` : ''}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)]">{Number(row.calls || 0).toLocaleString()} call(s)</p>
                          </div>
                          <div className="text-right">
                            <p className="font-mono text-sm text-[var(--text-primary)]">
                              {Number(row.total_tokens || 0).toLocaleString()}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)]">tokens</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Top referrers */}
                <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-4 shadow-sm">
                  <h3 className="font-display text-lg text-[var(--text-primary)] mb-4">Top sources</h3>
                  <div className="space-y-3">
                    {referrers.length === 0 ? (
                      <p className="text-sm text-[var(--text-tertiary)]">No data yet</p>
                    ) : (
                      referrers.slice(0, 5).map((ref) => (
                        <div key={ref.domain} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ExternalLink size={14} className="text-[var(--text-tertiary)]" />
                            <span className="text-sm text-[var(--text-primary)] truncate max-w-[150px]">{ref.domain}</span>
                          </div>
                          <span className="font-mono text-sm text-[var(--text-secondary)]">
                            {ref.count}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Device breakdown */}
                <div className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-4 shadow-sm">
                  <h3 className="font-display text-lg text-[var(--text-primary)] mb-4">Devices</h3>
                  <div className="space-y-3">
                    {[
                      { icon: Monitor, label: 'Desktop', count: devices.desktop },
                      { icon: Smartphone, label: 'Mobile', count: devices.mobile },
                      { icon: Tablet, label: 'Tablet', count: devices.tablet },
                    ].map(({ icon: Icon, label, count }) => {
                      const total = devices.desktop + devices.mobile + devices.tablet
                      const percent = total > 0 ? Math.round((count / total) * 100) : 0
                      return (
                        <div key={label}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <Icon size={14} className="text-[var(--text-tertiary)]" />
                              <span className="text-sm text-[var(--text-primary)]">{label}</span>
                            </div>
                            <span className="font-mono text-sm text-[var(--text-secondary)]">
                              {percent}%
                            </span>
                          </div>
                          <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[var(--accent)] rounded-full transition-all"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
