'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShareDraftButton } from '@/components/ShareDraftButton'
import { BulkPostActions } from '@/components/BulkPostActions'
import type { Post, Profile } from '@/types/database'
import {
  PenLine, Eye, Edit2, Trash2,
  Globe, FileText, Clock, Search, BarChart3, Calendar, Share2, Inbox
} from 'lucide-react'

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'archived' | 'scheduled'>('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'latest' | 'trending' | 'discussed' | 'views'>('latest')
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'pulse'>('all')
  const [metrics, setMetrics] = useState<Record<string, { views: number; recentViews: number; comments: number }>>({})
  const [showBulkActions, setShowBulkActions] = useState(false)
  const [scheduleTarget, setScheduleTarget] = useState<Post | null>(null)
  const [scheduleDraft, setScheduleDraft] = useState('')
  const [analyticsPost, setAnalyticsPost] = useState<Post | null>(null)
  const [healthSelectedIds, setHealthSelectedIds] = useState<string[]>([])
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    
    setProfile(profileData)

    // Load posts
    const { data: postsData } = await supabase
      .from('posts')
      .select('*')
      .eq('author_id', session.user.id)
      .order('updated_at', { ascending: false })
    
    setPosts(postsData || [])
    const postIds = (postsData || []).map((post) => post.id)

    if (postIds.length > 0) {
      const nextMetrics: Record<string, { views: number; recentViews: number; comments: number }> = {}
      postIds.forEach((id) => {
        nextMetrics[id] = { views: 0, recentViews: 0, comments: 0 }
      })

      setMetrics(nextMetrics)
    }

    setLoading(false)
  }

  const handleDelete = async (postId: string) => {
    if (!confirm('Are you sure you want to delete this post?')) return

    await supabase.from('posts').delete().eq('id', postId)
    setPosts(posts.filter(p => p.id !== postId))
  }

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Delete ${selectedIds.length} post(s)?`)) return

    await supabase.from('posts').delete().in('id', selectedIds)
    setPosts(posts.filter(p => !selectedIds.includes(p.id)))
    setSelectedIds([])
  }

  const handleBulkArchive = async () => {
    if (selectedIds.length === 0) return
    await supabase
      .from('posts')
      .update({ status: 'archived' })
      .in('id', selectedIds)

    setPosts(posts.map((post) =>
      selectedIds.includes(post.id) ? { ...post, status: 'archived' as any } : post
    ))
    setSelectedIds([])
  }

  const handleBulkRestore = async () => {
    if (selectedIds.length === 0) return
    await supabase
      .from('posts')
      .update({ status: 'draft' })
      .in('id', selectedIds)

    setPosts(posts.map((post) =>
      selectedIds.includes(post.id) ? { ...post, status: 'draft' as any } : post
    ))
    setSelectedIds([])
  }

  const updatePostStatus = async (post: Post, nextStatus: Post['status']) => {
    const updates: Record<string, any> = { status: nextStatus }

    if (nextStatus === 'published') {
      updates.published_at = post.published_at || new Date().toISOString()
      updates.scheduled_at = null
    }

    if (nextStatus === 'draft') {
      updates.published_at = null
      updates.scheduled_at = null
    }

    if (nextStatus === 'archived') {
      updates.scheduled_at = null
    }

    await supabase
      .from('posts')
      .update(updates)
      .eq('id', post.id)

    setPosts((prev) =>
      prev.map((item) =>
        item.id === post.id
          ? {
              ...item,
              ...updates,
            }
          : item
      )
    )
  }

  const handleSchedule = async () => {
    if (!scheduleTarget || !scheduleDraft) return
    const scheduledAtIso = new Date(scheduleDraft).toISOString()

    await supabase
      .from('posts')
      .update({
        status: 'scheduled',
        scheduled_at: scheduledAtIso,
      })
      .eq('id', scheduleTarget.id)

    setPosts((prev) =>
      prev.map((item) =>
        item.id === scheduleTarget.id
          ? { ...item, status: 'scheduled', scheduled_at: scheduledAtIso }
          : item
      )
    )
    setScheduleTarget(null)
    setScheduleDraft('')
  }

  const publishedCount = posts.filter((post) => post.status === 'published').length
  const draftCount = posts.filter((post) => post.status === 'draft').length
  const archivedCount = posts.filter((post) => post.status === 'archived').length
  const scheduledCount = posts.filter((post) => post.status === 'scheduled').length
  const filteredPosts = posts.filter((post) => {
    if (filter === 'published') return post.status === 'published'
    if (filter === 'draft') return post.status === 'draft'
    if (filter === 'archived') return post.status === 'archived'
    if (filter === 'scheduled') return post.status === 'scheduled'
    return true
  }).filter((post) => {
    if (typeFilter === 'pulse') return post.content_type === 'pulse'
    if (typeFilter === 'standard') return post.content_type !== 'pulse'
    return true
  }).filter((post) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (post.title || '').toLowerCase().includes(q) ||
      (post.excerpt || '').toLowerCase().includes(q)
  })

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (sortBy === 'latest') {
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    }
    if (sortBy === 'views') {
      return (metrics[b.id]?.views || 0) - (metrics[a.id]?.views || 0)
    }
    if (sortBy === 'discussed') {
      return (metrics[b.id]?.comments || 0) - (metrics[a.id]?.comments || 0)
    }
    if (sortBy === 'trending') {
      return (metrics[b.id]?.recentViews || 0) - (metrics[a.id]?.recentViews || 0)
    }
    return 0
  })

  const visiblePosts = sortedPosts

  const allVisibleSelected =
    visiblePosts.length > 0 &&
    visiblePosts.every((post) => selectedIds.includes(post.id))

  const healthQueue = visiblePosts
    .map((post) => {
      const updatedAt = new Date(post.updated_at || post.published_at || post.created_at)
      const daysSinceUpdate = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
      const recentViews = metrics[post.id]?.recentViews || 0
      const needsAttention = post.status === 'published' && daysSinceUpdate > 90 && recentViews < 10
      const score = Math.max(0, 100 - daysSinceUpdate) + recentViews * 2
      return { post, daysSinceUpdate, recentViews, needsAttention, score }
    })
    .filter((item) => item.needsAttention)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)

  const allHealthSelected =
    healthQueue.length > 0 &&
    healthQueue.every((item) => healthSelectedIds.includes(item.post.id))

  const handleBulkRevive = () => {
    if (healthSelectedIds.length === 0) return
    if (typeof window === 'undefined') return
    healthSelectedIds.forEach((id) => {
      window.open(`/write?edit=${id}&revive=1`, '_blank', 'noopener,noreferrer')
    })
  }

  useEffect(() => {
    const queueIds = new Set(healthQueue.map((item) => item.post.id))
    setHealthSelectedIds((prev) => prev.filter((id) => queueIds.has(id)))
  }, [healthQueue])

  const getStatusClasses = (status: Post['status']) => {
    if (status === 'published') return 'text-[var(--success)] bg-[var(--success)]/10'
    if (status === 'scheduled') return 'text-[var(--warning)] bg-[var(--warning)]/10'
    if (status === 'archived') return 'text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]'
    return 'text-[var(--text-secondary)] bg-[var(--bg-tertiary)]'
  }

  const getHealthBadge = (post: Post) => {
    if (post.status !== 'published') return null
    const updatedAt = new Date(post.updated_at || post.published_at || post.created_at)
    const daysSinceUpdate = Math.floor((Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24))
    const recentViews = metrics[post.id]?.recentViews || 0
    if (daysSinceUpdate < 30) {
      return { label: 'Fresh', className: 'text-[var(--success)] bg-[var(--success)]/10' }
    }
    if (daysSinceUpdate < 90 || recentViews >= 10) {
      return { label: 'Active', className: 'text-[var(--warning)] bg-[var(--warning)]/10' }
    }
    return { label: 'Stale', className: 'text-[var(--error)] bg-[var(--error)]/10' }
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-12 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-32 skeleton rounded" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 skeleton rounded-md" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Posts</p>
          <h1 className="font-display text-3xl text-[var(--text-primary)]">Your content pipeline</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/write"
            className="btn btn-primary btn-sm"
          >
            <PenLine size={16} />
            New post
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 mb-8">
        {[
          { label: 'Total posts', value: posts.length },
          { label: 'Published', value: publishedCount },
          { label: 'Drafts', value: draftCount },
          { label: 'Scheduled', value: scheduledCount },
          { label: 'Archived', value: archivedCount },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl p-4 shadow-sm"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-5 mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Workflows</p>
            <h2 className="font-display text-xl text-[var(--text-primary)]">Common actions</h2>
            <p className="text-sm text-[var(--text-secondary)]">
              Quick entry points for the content supply chain.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              label: 'Create post',
              description: 'Start a new draft in the editor.',
              href: '/write',
              icon: PenLine,
            },
            {
              label: 'Import HTML',
              description: 'Paste or upload HTML into a draft.',
              href: '/write',
              icon: FileText,
            },
            {
              label: 'Review inbox',
              description: 'Convert incoming items into drafts.',
              href: '/inbox',
              icon: Inbox,
            },
            {
              label: 'Connect sources',
              description: 'Add RSS feeds and fetch updates.',
              href: '/sources',
              icon: Globe,
            },
            {
              label: 'Syndication targets',
              description: 'Set up outbound publishing.',
              href: '/syndication',
              icon: Share2,
            },
            {
              label: 'Analytics snapshot',
              description: 'See what is trending with readers.',
              href: '/analytics',
              icon: BarChart3,
            },
          ].map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-start gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] px-4 py-3 hover:border-[var(--border-medium)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--bg-primary)] border border-[var(--border-light)]">
                  <Icon size={16} className="text-[var(--text-secondary)]" />
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{item.label}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">{item.description}</p>
                </div>
              </Link>
            )
          })}
        </div>
      </div>

      {healthQueue.length > 0 && (
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-5 mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Post health</p>
              <h2 className="font-display text-xl text-[var(--text-primary)]">Needs attention</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Posts older than 90 days with low recent views.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  if (allHealthSelected) {
                    setHealthSelectedIds([])
                  } else {
                    setHealthSelectedIds(healthQueue.map((item) => item.post.id))
                  }
                }}
                className="btn btn-secondary btn-sm"
              >
                {allHealthSelected ? 'Clear' : 'Select all'}
              </button>
              <button
                onClick={handleBulkRevive}
                className="btn btn-primary btn-sm"
                disabled={healthSelectedIds.length === 0}
              >
                Revive selected
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {healthQueue.map(({ post, daysSinceUpdate, recentViews }) => (
              <div
                key={post.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-4"
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={healthSelectedIds.includes(post.id)}
                    onChange={(event) => {
                      setHealthSelectedIds((prev) =>
                        event.target.checked
                          ? [...prev, post.id]
                          : prev.filter((id) => id !== post.id)
                      )
                    }}
                    className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                  <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">{post.title || 'Untitled'}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {daysSinceUpdate} days since update - {recentViews} views in last 7d
                  </p>
                  </div>
                </div>
                <Link
                  href={`/write?edit=${post.id}&revive=1`}
                  className="btn btn-secondary btn-sm"
                >
                  Revive
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <div className="inline-flex bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl p-1">
          {[
            { id: 'all', label: 'All' },
            { id: 'published', label: 'Published' },
            { id: 'draft', label: 'Drafts' },
            { id: 'scheduled', label: 'Scheduled' },
            { id: 'archived', label: 'Archived' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setFilter(item.id as typeof filter)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === item.id
                  ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search posts..."
              className="input w-56 pl-10"
            />
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          </div>
          <div className="inline-flex bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl p-1">
            {[
              { id: 'all', label: 'All types' },
              { id: 'standard', label: 'Standard' },
              { id: 'pulse', label: 'Pulse' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setTypeFilter(item.id as typeof typeFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  typeFilter === item.id
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="inline-flex bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl p-1">
            {[
              { id: 'latest', label: 'Latest' },
              { id: 'trending', label: 'Trending' },
              { id: 'discussed', label: 'Discussed' },
              { id: 'views', label: 'Views' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setSortBy(item.id as typeof sortBy)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sortBy === item.id
                    ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            {visiblePosts.length} {visiblePosts.length === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>

      {visiblePosts.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-xl bg-[var(--bg-tertiary)] flex items-center justify-center mx-auto mb-4 border border-[var(--border-light)]">
            <FileText size={28} className="text-[var(--text-tertiary)]" />
          </div>
          <h2 className="font-display text-xl tracking-tight text-[var(--text-primary)] mb-2">No posts yet</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-6">Create your first post to get started</p>
          <Link href="/write" className="btn btn-primary btn-sm">
            <PenLine size={16} />
            Write your first post
          </Link>
        </div>
      ) : (
      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[28px_minmax(0,1fr)_100px_110px_90px_90px_130px] gap-2 px-4 py-1.5 text-[11px] uppercase tracking-[0.22em] text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedIds(visiblePosts.map((post) => post.id))
                  } else {
                    setSelectedIds([])
                  }
                }}
                className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
            </div>
            <span>Post</span>
            <span>Status</span>
            <span>Updated</span>
            <span>Views</span>
            <span>Comments</span>
            <span className="text-right">Actions</span>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-sm">
              <span className="text-[var(--text-secondary)]">
                {selectedIds.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowBulkActions(true)}
                  className="btn btn-primary btn-sm"
                >
                  Bulk actions
                </button>
                <button
                  onClick={() => setSelectedIds([])}
                  className="btn btn-secondary btn-sm"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
          <div className="divide-y divide-[var(--border-light)]">
            {visiblePosts.map((post) => (
              <div
                key={post.id}
                className="grid grid-cols-1 md:grid-cols-[28px_minmax(0,1fr)_100px_110px_90px_90px_130px] gap-2 md:gap-2 px-4 py-2 items-start md:items-center hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <div className="hidden md:flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(post.id)}
                    onChange={(event) => {
                      setSelectedIds((prev) =>
                        event.target.checked
                          ? [...prev, post.id]
                          : prev.filter((id) => id !== post.id)
                      )
                    }}
                    className="w-4 h-4 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-[var(--text-primary)] truncate text-sm">
                      {post.title || 'Untitled'}
                    </p>
                    {post.content_type === 'pulse' && (
                      <span className="doc-badge doc-badge-pulse">Pulse</span>
                    )}
                  </div>
                  {post.excerpt && (
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-1">
                      {post.excerpt}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 md:block">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] md:hidden">
                    Status
                  </span>
                  <select
                    value={post.status}
                    onChange={(event) => {
                      const nextStatus = event.target.value as Post['status']
                      if (nextStatus === 'scheduled') {
                        setScheduleTarget(post)
                        const nextValue = post.scheduled_at
                          ? new Date(post.scheduled_at).toISOString().slice(0, 16)
                          : new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 16)
                        setScheduleDraft(nextValue)
                        return
                      }
                      updatePostStatus(post, nextStatus)
                    }}
                    className={`text-[11px] font-medium px-2.5 py-1 rounded-md border border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)] ${getStatusClasses(post.status)}`}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
                <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] md:hidden">
                    Updated
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(post.updated_at).toLocaleDateString()}
                  </span>
                  {(() => {
                    const health = getHealthBadge(post)
                    if (!health) return null
                    return (
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.2em] ${health.className}`}>
                        {health.label}
                      </span>
                    )
                  })()}
                </div>
                <div className="text-sm text-[var(--text-primary)]">
                  {(metrics[post.id]?.views || 0).toLocaleString()}
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    {(metrics[post.id]?.recentViews || 0).toLocaleString()} last 7d
                  </p>
                </div>
                <div className="text-sm text-[var(--text-primary)]">
                  {(metrics[post.id]?.comments || 0).toLocaleString()}
                  <p className="text-[10px] text-[var(--text-tertiary)]">
                    visible comments
                  </p>
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  {post.status === 'draft' && (
                    <ShareDraftButton
                      postId={post.id}
                      existingToken={(post as any).preview_token}
                      expiresAt={(post as any).preview_expires_at}
                    />
                  )}
                  {post.status === 'published' && profile && (
                    <Link
                      href={`/${profile.username}/${post.slug}`}
                      className="btn-icon"
                      title="View post"
                    >
                      <Eye size={14} />
                    </Link>
                  )}
                  <button
                    onClick={() => setAnalyticsPost(post)}
                    className="btn-icon"
                    title="View analytics"
                  >
                    <BarChart3 size={14} />
                  </button>
                  <Link
                    href={`/write?edit=${post.id}`}
                    className="btn-icon"
                    title="Edit post"
                  >
                    <Edit2 size={14} />
                  </Link>
                  <Link
                    href={`/write?edit=${post.id}&pack=1`}
                    className="btn-icon"
                    title="Distribution pack"
                  >
                    <Share2 size={14} />
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="btn-icon text-[var(--error)] hover:bg-[var(--error)]/10"
                    title="Delete post"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showBulkActions && (
        <BulkPostActions
          selectedPostIds={selectedIds}
          onComplete={() => {
            setShowBulkActions(false)
            setSelectedIds([])
            loadData()
          }}
          onCancel={() => setShowBulkActions(false)}
        />
      )}

      {scheduleTarget && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-6">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setScheduleTarget(null)}
          />
          <div className="relative w-full max-w-md rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-2xl p-6">
            <h3 className="font-display text-xl text-[var(--text-primary)] mb-2">
              Schedule post
            </h3>
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              Choose when "{scheduleTarget.title || 'Untitled'}" should go live.
            </p>
            <div className="space-y-3">
              <label className="block text-sm text-[var(--text-secondary)]">
                Publish date
              </label>
              <input
                type="datetime-local"
                value={scheduleDraft}
                onChange={(event) => setScheduleDraft(event.target.value)}
                min={new Date().toISOString().slice(0, 16)}
                className="input w-full"
              />
            </div>
            <div className="flex items-center justify-end gap-2 mt-6">
              <button
                onClick={() => setScheduleTarget(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={!scheduleDraft}
                className="btn btn-primary btn-sm disabled:opacity-60"
              >
                Schedule
              </button>
            </div>
          </div>
        </div>
      )}

      {analyticsPost && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/30"
            onClick={() => setAnalyticsPost(null)}
          />
          <aside className="absolute right-0 top-0 h-full w-full max-w-md bg-[var(--bg-primary)] border-l border-[var(--border-light)] shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)]">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                  Analytics
                </p>
                <h2 className="font-display text-xl text-[var(--text-primary)]">
                  {analyticsPost.title || 'Untitled'}
                </h2>
              </div>
              <button
                onClick={() => setAnalyticsPost(null)}
                className="p-2 rounded-lg hover:bg-[var(--bg-secondary)] transition-colors"
                aria-label="Close analytics"
              >
                X
              </button>
            </div>
            <div className="px-6 py-6 space-y-6">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Views</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                    {(metrics[analyticsPost.id]?.views || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {(metrics[analyticsPost.id]?.recentViews || 0).toLocaleString()} in last 7 days
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                  <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Comments</p>
                  <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
                    {(metrics[analyticsPost.id]?.comments || 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">Visible comments</p>
                </div>
              </div>

              <div className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)]">
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Status</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusClasses(analyticsPost.status)}`}>
                    {analyticsPost.status}
                  </span>
                  {analyticsPost.content_type === 'pulse' && (
                    <span className="doc-badge doc-badge-pulse">Pulse</span>
                  )}
                  {analyticsPost.status === 'scheduled' && analyticsPost.scheduled_at && (
                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                      <Calendar size={12} />
                      {new Date(analyticsPost.scheduled_at).toLocaleString()}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {analyticsPost.status === 'published' && profile && (
                  <Link
                    href={`/${profile.username}/${analyticsPost.slug}`}
                    className="btn btn-secondary btn-sm"
                  >
                    View post
                  </Link>
                )}
                <Link
                  href={`/write?edit=${analyticsPost.id}`}
                  className="btn btn-primary btn-sm"
                >
                  Edit post
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </main>
  )
}

