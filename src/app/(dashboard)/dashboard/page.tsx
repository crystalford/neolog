'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShareDraftButton } from '@/components/ShareDraftButton'
import type { Post, Profile } from '@/types/database'
import {
  PenLine, Eye, Edit2, Trash2,
  Globe, FileText, Clock, Search
} from 'lucide-react'

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'published' | 'draft' | 'archived' | 'scheduled'>('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'latest' | 'trending' | 'discussed' | 'views'>('latest')
  const [metrics, setMetrics] = useState<Record<string, { views: number; recentViews: number; comments: number }>>({})
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
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      const { data: viewRows } = await supabase
        .from('post_views')
        .select('post_id, started_at')
        .in('post_id', postIds)

      const { data: recentRows } = await supabase
        .from('post_views')
        .select('post_id')
        .in('post_id', postIds)
        .gte('started_at', sevenDaysAgo.toISOString())

      const { data: commentRows } = await supabase
        .from('comments')
        .select('post_id')
        .in('post_id', postIds)
        .eq('status', 'visible')

      const nextMetrics: Record<string, { views: number; recentViews: number; comments: number }> = {}
      postIds.forEach((id) => {
        nextMetrics[id] = { views: 0, recentViews: 0, comments: 0 }
      })

      viewRows?.forEach((row: any) => {
        if (nextMetrics[row.post_id]) nextMetrics[row.post_id].views += 1
      })
      recentRows?.forEach((row: any) => {
        if (nextMetrics[row.post_id]) nextMetrics[row.post_id].recentViews += 1
      })
      commentRows?.forEach((row: any) => {
        if (nextMetrics[row.post_id]) nextMetrics[row.post_id].comments += 1
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
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
          <Link href="/write" className="inline-flex items-center gap-2 px-6 py-2.5 bg-[var(--accent)] text-[var(--text-inverse)] text-sm font-medium rounded-lg hover:bg-[var(--accent-hover)] transition-colors">
            <PenLine size={16} />
            Write your first post
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm overflow-hidden">
          <div className="hidden md:grid grid-cols-[40px_minmax(0,1fr)_120px_140px_120px_120px_180px] gap-4 px-5 py-3 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
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
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-sm">
              <span className="text-[var(--text-secondary)]">
                {selectedIds.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkArchive}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                >
                  Archive
                </button>
                <button
                  onClick={handleBulkRestore}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors"
                >
                  Restore
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              </div>
            </div>
          )}
          <div className="divide-y divide-[var(--border-light)]">
            {visiblePosts.map((post) => (
              <div
                key={post.id}
                className="grid grid-cols-1 md:grid-cols-[40px_minmax(0,1fr)_120px_140px_120px_120px_180px] gap-3 md:gap-4 px-5 py-4 items-start md:items-center hover:bg-[var(--bg-secondary)] transition-colors"
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
                  <p className="font-medium text-[var(--text-primary)] truncate">
                    {post.title || 'Untitled'}
                  </p>
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
                  {post.status === 'published' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
                      <Globe size={12} />
                      Published
                    </span>
                  ) : post.status === 'scheduled' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--warning)] bg-[var(--warning)]/10 px-2 py-0.5 rounded-full">
                      Scheduled
                    </span>
                  ) : post.status === 'archived' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-tertiary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                      Archived
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                      <FileText size={12} />
                      Draft
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--text-tertiary)] flex items-center gap-2">
                  <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] md:hidden">
                    Updated
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {new Date(post.updated_at).toLocaleDateString()}
                  </span>
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
                <div className="flex items-center justify-end gap-2">
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
                      className="p-2 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                      title="View post"
                    >
                      <Eye size={14} />
                    </Link>
                  )}
                  <Link
                    href={`/write?edit=${post.id}`}
                    className="p-2 rounded-lg bg-[var(--bg-tertiary)] text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                    title="Edit post"
                  >
                    <Edit2 size={14} />
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="p-2 rounded-lg text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
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
    </main>
  )
}

