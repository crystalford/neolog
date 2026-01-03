'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Eye, TrendingUp, Users, Clock, MapPin,
  Smartphone, Monitor, Tablet, Globe, Calendar
} from 'lucide-react'
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

interface AnalyticsData {
  totalViews: number
  uniqueVisitors: number
  avgReadTime: number
  completionRate: number
  deviceBreakdown: { name: string; value: number }[]
  locationBreakdown: { country: string; count: number }[]
  viewsOverTime: { date: string; views: number }[]
  topPosts: { id: string; title: string; slug: string; views: number }[]
}

const DEVICE_COLORS = {
  mobile: '#3b82f6',
  desktop: '#8b5cf6',
  tablet: '#ec4899',
  other: '#6b7280',
}

export function AnalyticsDashboard({ postId }: { postId?: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')

  const supabase = createClient()

  useEffect(() => {
    loadAnalytics()
  }, [postId, timeRange])

  const loadAnalytics = async () => {
    setLoading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Calculate date range
      const now = new Date()
      let startDate: Date | null = null

      if (timeRange !== 'all') {
        const days = parseInt(timeRange)
        startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
      }

      // Fetch view stats
      let viewsQuery = supabase
        .from('post_views')
        .select('*')

      if (postId) {
        viewsQuery = viewsQuery.eq('post_id', postId)
      } else {
        // Get all posts by current user
        const { data: userPosts } = await supabase
          .from('posts')
          .select('id')
          .eq('author_id', session.user.id)

        if (userPosts) {
          viewsQuery = viewsQuery.in('post_id', userPosts.map(p => p.id))
        }
      }

      if (startDate) {
        viewsQuery = viewsQuery.gte('created_at', startDate.toISOString())
      }

      const { data: views } = await viewsQuery

      if (!views) {
        setData(null)
        return
      }

      // Process analytics data
      const totalViews = views.length
      const uniqueVisitors = new Set(views.map(v => v.visitor_id || v.ip_address)).size

      // Device breakdown
      const deviceCounts = views.reduce((acc, v) => {
        const device = v.device_type || 'other'
        acc[device] = (acc[device] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const deviceBreakdown = Object.entries(deviceCounts).map(([name, value]) => ({
        name,
        value: value as number,
      }))

      // Location breakdown
      const locationCounts = views.reduce((acc, v) => {
        const country = v.country || 'Unknown'
        acc[country] = (acc[country] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const locationBreakdown = Object.entries(locationCounts)
        .map(([country, count]) => ({ country, count: count as number }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      // Views over time
      const viewsByDate = views.reduce((acc, v) => {
        const date = new Date(v.created_at).toISOString().split('T')[0]
        acc[date] = (acc[date] || 0) + 1
        return acc
      }, {} as Record<string, number>)

      const viewsOverTime = Object.entries(viewsByDate)
        .map(([date, views]) => ({ date, views: views as number }))
        .sort((a, b) => a.date.localeCompare(b.date))

      // Fetch reading progress for completion rate
      const { data: progress } = await supabase
        .from('reading_progress')
        .select('completed')

      const completedReads = progress?.filter(p => p.completed).length || 0
      const completionRate = progress && progress.length > 0
        ? (completedReads / progress.length) * 100
        : 0

      // Average read time (mock data - would need actual time tracking)
      const avgReadTime = 245 // seconds

      // Top posts
      const { data: topPostsData } = await supabase
        .from('posts')
        .select(`
          id,
          title,
          slug,
          post_stats(view_count)
        `)
        .eq('author_id', session.user.id)
        .eq('status', 'published')
        .order('post_stats.view_count', { ascending: false })
        .limit(5)

      const topPosts = topPostsData?.map(p => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        views: p.post_stats?.[0]?.view_count || 0,
      })) || []

      setData({
        totalViews,
        uniqueVisitors,
        avgReadTime,
        completionRate,
        deviceBreakdown,
        locationBreakdown,
        viewsOverTime,
        topPosts,
      })
    } catch (error) {
      console.error('Error loading analytics:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[var(--accent)]" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-16 text-[var(--text-tertiary)]">
        <Eye size={48} className="mx-auto mb-4 opacity-50" />
        <p>No analytics data available</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Time range selector */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-display font-bold">Analytics</h2>
        <div className="flex gap-2 p-1 bg-[var(--bg-secondary)] rounded-lg">
          {[
            { label: '7 days', value: '7d' },
            { label: '30 days', value: '30d' },
            { label: '90 days', value: '90d' },
            { label: 'All time', value: 'all' },
          ].map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setTimeRange(value as any)}
              className={`px-4 py-2 rounded text-sm transition-all ${
                timeRange === value
                  ? 'bg-[var(--bg-primary)] shadow-sm font-medium'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Eye size={20} className="text-blue-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Total Views</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.totalViews.toLocaleString()}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Users size={20} className="text-purple-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Unique Visitors</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.uniqueVisitors.toLocaleString()}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Clock size={20} className="text-green-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Avg Read Time</span>
          </div>
          <p className="text-3xl font-display font-bold">{formatTime(data.avgReadTime)}</p>
        </div>

        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <TrendingUp size={20} className="text-orange-500" />
            </div>
            <span className="text-sm text-[var(--text-tertiary)]">Completion Rate</span>
          </div>
          <p className="text-3xl font-display font-bold">{data.completionRate.toFixed(1)}%</p>
        </div>
      </div>

      {/* Views over time */}
      <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
        <h3 className="font-semibold text-lg mb-4">Views Over Time</h3>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data.viewsOverTime}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" />
            <XAxis
              dataKey="date"
              stroke="var(--text-tertiary)"
              fontSize={12}
              tickFormatter={(date) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            />
            <YAxis stroke="var(--text-tertiary)" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
              }}
            />
            <Line
              type="monotone"
              dataKey="views"
              stroke="var(--accent)"
              strokeWidth={2}
              dot={{ fill: 'var(--accent)', r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Device & Location breakdown */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Device breakdown */}
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Monitor size={20} />
            Device Breakdown
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={data.deviceBreakdown}
                cx="50%"
                cy="50%"
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percent }) =>
                  `${name} ${percent ? (percent * 100).toFixed(0) : 0}%`
                }
              >
                {data.deviceBreakdown.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={DEVICE_COLORS[entry.name as keyof typeof DEVICE_COLORS] || DEVICE_COLORS.other}
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top locations */}
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Globe size={20} />
            Top Locations
          </h3>
          <div className="space-y-3">
            {data.locationBreakdown.slice(0, 5).map(({ country, count }) => {
              const percentage = (count / data.totalViews) * 100
              return (
                <div key={country}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{country}</span>
                    <span className="text-sm text-[var(--text-tertiary)]">{count}</span>
                  </div>
                  <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[var(--accent)] rounded-full transition-all"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Top posts */}
      {!postId && data.topPosts.length > 0 && (
        <div className="p-6 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <h3 className="font-semibold text-lg mb-4">Top Performing Posts</h3>
          <div className="space-y-3">
            {data.topPosts.map((post, index) => (
              <div
                key={post.id}
                className="flex items-center gap-4 p-4 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-primary)] transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-[var(--accent)] text-white flex items-center justify-center font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{post.title}</p>
                </div>
                <div className="text-sm text-[var(--text-tertiary)] flex items-center gap-1.5">
                  <Eye size={14} />
                  {post.views.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
