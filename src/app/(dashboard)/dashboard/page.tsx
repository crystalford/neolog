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
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [search, setSearch] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
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
  const draftCount = posts.filter((post) => post.status !== 'published').length
  const filteredPosts = posts.filter((post) => {
    if (filter === 'published') return post.status === 'published'
    if (filter === 'draft') return post.status !== 'published'
    return true
  }).filter((post) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (post.title || '').toLowerCase().includes(q) ||
      (post.excerpt || '').toLowerCase().includes(q)
  })

  const allVisibleSelected =
    filteredPosts.length > 0 &&
    filteredPosts.every((post) => selectedIds.includes(post.id))

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
          <p className="text-sm text-[var(--text-secondary)]">
            {filteredPosts.length} {filteredPosts.length === 1 ? 'post' : 'posts'}
          </p>
        </div>
      </div>

      {filteredPosts.length === 0 ? (
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
          <div className="hidden md:grid grid-cols-[40px_minmax(0,1fr)_140px_160px_220px] gap-4 px-5 py-3 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] border-b border-[var(--border-light)]">
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => {
                  if (event.target.checked) {
                    setSelectedIds(filteredPosts.map((post) => post.id))
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
            <span className="text-right">Actions</span>
          </div>
          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border-light)] text-sm">
              <span className="text-[var(--text-secondary)]">
                {selectedIds.length} selected
              </span>
              <button
                onClick={handleBulkDelete}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-[var(--error)] border border-[var(--error)]/30 hover:bg-[var(--error)]/10 transition-colors"
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          )}
          <div className="divide-y divide-[var(--border-light)]">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="grid grid-cols-1 md:grid-cols-[40px_minmax(0,1fr)_140px_160px_220px] gap-3 md:gap-4 px-5 py-4 items-start md:items-center hover:bg-[var(--bg-secondary)] transition-colors"
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

