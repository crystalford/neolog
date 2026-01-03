'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { 
  Eye, Clock, Users, TrendingUp, ArrowUpRight, 
  Monitor, Smartphone, Tablet, ExternalLink,
  BarChart3, Activity, Target
} from 'lucide-react'

type PostWithViews = {
  id: string
  title: string
  slug: string
  published_at: string
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

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [posts, setPosts] = useState<PostWithViews[]>([])
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
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d'>('30d')
  
  const supabase = createClient()

  useEffect(() => {
    loadAnalytics()
  }, [dateRange])

  const loadAnalytics = async () => {
    setLoading(true)
    
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    // Get user's posts
    const { data: userPosts } = await supabase
      .from('posts')
      .select('id, title, slug, published_at')
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (!userPosts || userPosts.length === 0) {
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

  const formatDate = (dateStr: string) => {
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

  return (
    <>
      <Header />
      <main className="pt-20 pb-16">
        <div className="max-w-6xl mx-auto px-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-8 pt-8">
            <div>
              <h1 className="font-display text-3xl mb-2">Analytics</h1>
              <p className="text-[var(--text-secondary)]">
                See how readers engage with your content
              </p>
            </div>
            
            {/* Date range selector */}
            <div className="flex gap-1 p-1 bg-[var(--bg-secondary)] rounded-lg">
              {(['7d', '30d', '90d'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 text-sm rounded-md transition-all ${
                    dateRange === range
                      ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
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
                <div key={i} className="h-32 rounded-xl skeleton" />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-20">
              <BarChart3 size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-2xl mb-2">No published posts yet</h2>
              <p className="text-[var(--text-secondary)] mb-6">
                Publish your first post to start seeing analytics
              </p>
              <Link href="/write" className="btn btn-primary">
                Write your first post
              </Link>
            </div>
          ) : (
            <>
              {/* Overview cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                      <Eye size={20} className="text-[var(--accent)]" />
                    </div>
                    <span className="text-sm text-[var(--text-secondary)]">Total Views</span>
                  </div>
                  <p className="font-display text-3xl">{totals.views.toLocaleString()}</p>
                  <Sparkline data={dailyData.map(d => d.views)} />
                </div>

                <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                      <Users size={20} className="text-[var(--accent)]" />
                    </div>
                    <span className="text-sm text-[var(--text-secondary)]">Unique Readers</span>
                  </div>
                  <p className="font-display text-3xl">{totals.uniques.toLocaleString()}</p>
                  <Sparkline data={dailyData.map(d => d.uniques)} />
                </div>

                <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                      <Clock size={20} className="text-[var(--accent)]" />
                    </div>
                    <span className="text-sm text-[var(--text-secondary)]">Avg. Read Time</span>
                  </div>
                  <p className="font-display text-3xl">{formatTime(totals.avgTime)}</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-2">
                    {totals.avgScroll}% avg. scroll depth
                  </p>
                </div>

                <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-[var(--accent-soft)] flex items-center justify-center">
                      <Target size={20} className="text-[var(--accent)]" />
                    </div>
                    <span className="text-sm text-[var(--text-secondary)]">Completion Rate</span>
                  </div>
                  <p className="font-display text-3xl">{totals.avgCompletion}%</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-2">
                    Readers who finish
                  </p>
                </div>
              </div>

              {/* Two column layout */}
              <div className="grid lg:grid-cols-3 gap-8">
                {/* Posts table */}
                <div className="lg:col-span-2">
                  <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
                    <div className="p-4 border-b border-[var(--border-light)]">
                      <h2 className="font-display text-lg">Post Performance</h2>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-[var(--border-light)] text-sm text-[var(--text-tertiary)]">
                            <th className="text-left p-4 font-medium">Post</th>
                            <th className="text-right p-4 font-medium">Views</th>
                            <th className="text-right p-4 font-medium">Uniques</th>
                            <th className="text-right p-4 font-medium">Avg. Time</th>
                            <th className="text-right p-4 font-medium">Completion</th>
                          </tr>
                        </thead>
                        <tbody>
                          {posts.slice(0, 10).map((post) => (
                            <tr 
                              key={post.id}
                              className="border-b border-[var(--border-light)] last:border-0 hover:bg-[var(--bg-tertiary)] transition-colors"
                            >
                              <td className="p-4">
                                <p className="font-medium truncate max-w-xs">{post.title}</p>
                                <p className="text-sm text-[var(--text-tertiary)]">
                                  {formatDate(post.published_at)}
                                </p>
                              </td>
                              <td className="p-4 text-right font-mono text-sm">
                                {post.total_views.toLocaleString()}
                              </td>
                              <td className="p-4 text-right font-mono text-sm">
                                {post.unique_viewers.toLocaleString()}
                              </td>
                              <td className="p-4 text-right font-mono text-sm">
                                {formatTime(post.avg_time_on_page)}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-[var(--accent)] rounded-full"
                                      style={{ width: `${post.completion_rate}%` }}
                                    />
                                  </div>
                                  <span className="font-mono text-sm w-10 text-right">
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
                  {/* Top referrers */}
                  <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-4">
                    <h3 className="font-display text-lg mb-4">Top Sources</h3>
                    <div className="space-y-3">
                      {referrers.length === 0 ? (
                        <p className="text-sm text-[var(--text-tertiary)]">No data yet</p>
                      ) : (
                        referrers.slice(0, 5).map((ref) => (
                          <div key={ref.domain} className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ExternalLink size={14} className="text-[var(--text-tertiary)]" />
                              <span className="text-sm truncate max-w-[150px]">{ref.domain}</span>
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
                  <div className="rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-4">
                    <h3 className="font-display text-lg mb-4">Devices</h3>
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
                                <span className="text-sm">{label}</span>
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
    </>
  )
}
