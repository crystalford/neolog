'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Eye, TrendingUp, Clock, Users, ArrowRight,
  BarChart3, Activity, Globe
} from 'lucide-react'

type PostStats = {
  id: string
  title: string
  slug: string
  author_username: string
  published_at: string
  total_views: number
  avg_time: number
  completion_rate: number
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [posts, setPosts] = useState<PostStats[]>([])
  const [stats, setStats] = useState({
    totalViews: 0,
    totalPosts: 0,
    avgTimeOnPage: 0,
    totalReaders: 0,
  })
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)

    // Get user
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      setLoading(false)
      return
    }
    setUser(session.user)

    // Get profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    setProfile(profileData)

    // Get all published posts for this user
    const { data: publishedPosts } = await supabase
      .from('posts')
      .select('id, title, slug, published_at')
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    if (!publishedPosts || publishedPosts.length === 0) {
      setLoading(false)
      return
    }

    const postIds = publishedPosts.map(p => p.id)

    // Get analytics for all posts
    const { data: analyticsData } = await supabase
      .from('post_analytics')
      .select('*')
      .in('post_id', postIds)

    // Calculate stats per post
    const postStatsMap = new Map<string, {
      views: number
      totalTime: number
      completions: number
    }>()

    analyticsData?.forEach((view) => {
      const existing = postStatsMap.get(view.post_id) || { views: 0, totalTime: 0, completions: 0 }
      existing.views++
      existing.totalTime += view.time_on_page || 0
      if (view.read_complete) existing.completions++
      postStatsMap.set(view.post_id, existing)
    })

    const postsWithStats = publishedPosts.map(post => {
      const stats = postStatsMap.get(post.id) || { views: 0, totalTime: 0, completions: 0 }
      return {
        id: post.id,
        title: post.title,
        slug: post.slug,
        author_username: profileData?.username || '',
        published_at: post.published_at,
        total_views: stats.views,
        avg_time: stats.views > 0 ? Math.round(stats.totalTime / stats.views) : 0,
        completion_rate: stats.views > 0 ? Math.round((stats.completions / stats.views) * 100) : 0,
      }
    }).sort((a, b) => b.total_views - a.total_views)

    setPosts(postsWithStats)

    // Calculate overall stats
    const totalViews = postsWithStats.reduce((sum, p) => sum + p.total_views, 0)
    const totalTime = analyticsData?.reduce((sum, v) => sum + (v.time_on_page || 0), 0) || 0
    const uniqueReaders = new Set(analyticsData?.map(v => v.reader_id) || []).size

    setStats({
      totalViews,
      totalPosts: publishedPosts.length,
      avgTimeOnPage: totalViews > 0 ? Math.round(totalTime / totalViews) : 0,
      totalReaders: uniqueReaders,
    })

    setLoading(false)
  }

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="animate-pulse">
          <div className="h-8 bg-[var(--bg-secondary)] rounded w-64 mb-8"></div>
          <div className="grid md:grid-cols-4 gap-6 mb-12">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-32 bg-[var(--bg-secondary)] rounded-2xl"></div>
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="text-center py-16">
          <span className="text-6xl mx-auto mb-4 opacity-70 block text-center">📊</span>
          <h2 className="font-display text-2xl mb-2">Sign in to view analytics</h2>
          <p className="text-[var(--text-secondary)]">Track your post performance and reader engagement</p>
        </div>
      </main>
    )
  }

  if (posts.length === 0) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
              MEASURE
            </p>
            <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              Analytics
            </h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              Track performance across all your published posts
            </p>
          </div>
        </div>
        <div className="text-center py-16 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <span className="text-6xl mx-auto mb-4 opacity-70 block text-center">📈</span>
          <h2 className="font-display text-2xl mb-2">No published posts yet</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Publish your first post to start tracking analytics
          </p>
          <Link href="/write" className="btn btn-primary">
            Write Your First Post
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 md:py-12" style={{ fontFamily: 'var(--font-sans)' }}>
      <div className="mb-8">
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
          MEASURE
        </p>
        <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
          Analytics
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Track performance across all your published posts
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid md:grid-cols-4 gap-6 mb-12">
        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)] flex items-center justify-center">
              <Eye size={20} className="text-white" />
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">Total Views</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.totalViews.toLocaleString()}</p>
        </div>

        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--success)] flex items-center justify-center">
              <Activity size={20} className="text-white" />
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">Published Posts</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.totalPosts}</p>
        </div>

        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-purple)] flex items-center justify-center">
              <Clock size={20} className="text-white" />
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">Avg. Time</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">
            {Math.floor(stats.avgTimeOnPage / 60)}:{(stats.avgTimeOnPage % 60).toString().padStart(2, '0')}
          </p>
        </div>

        <div className="p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-cyan)] flex items-center justify-center">
              <Users size={20} className="text-white" />
            </div>
            <span className="text-sm font-medium text-[var(--text-secondary)]">Unique Readers</span>
          </div>
          <p className="text-3xl font-bold text-[var(--text-primary)]">{stats.totalReaders.toLocaleString()}</p>
        </div>
      </div>

      {/* Top Posts */}
      <div className="mb-8">
        <h2 className="font-display text-2xl mb-4">Post Performance</h2>
        <div className="bg-[var(--bg-primary)] rounded-2xl border border-[var(--border-light)] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[var(--bg-secondary)] border-b border-[var(--border-light)]">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Post</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Views</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Avg. Time</th>
                <th className="text-left px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Completion</th>
                <th className="text-right px-6 py-3 text-sm font-semibold text-[var(--text-secondary)]">Details</th>
              </tr>
            </thead>
            <tbody>
              {posts.map((post) => (
                <tr key={post.id} className="border-b border-[var(--border-light)] hover:bg-[var(--bg-secondary)] transition-colors">
                  <td className="px-6 py-4">
                    <Link
                      href={`/${post.author_username}/${post.slug}`}
                      className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]"
                    >
                      {post.title}
                    </Link>
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      {new Date(post.published_at).toLocaleDateString()}
                    </p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Eye size={14} className="text-[var(--text-tertiary)]" />
                      <span className="font-medium">{post.total_views.toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-[var(--text-tertiary)]" />
                      <span className="font-medium">
                        {Math.floor(post.avg_time / 60)}:{(post.avg_time % 60).toString().padStart(2, '0')}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 max-w-[100px] h-2 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${post.completion_rate}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium">{post.completion_rate}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/analytics/${post.id}`}
                      className="inline-flex items-center gap-1 text-sm text-[var(--accent)] hover:underline"
                    >
                      View Details
                      <ArrowRight size={14} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Help Text */}
      <div className="p-6 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <Globe size={18} className="text-[var(--accent)]" />
          How analytics work
        </h3>
        <p className="text-sm text-[var(--text-secondary)]">
          We track anonymous reader behavior including views, time on page, scroll depth, and completion rates.
          No personal data is collected. Click "View Details" on any post to see deeper insights.
        </p>
      </div>
    </main>
  )
}
