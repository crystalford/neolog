'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ShareDraftButton } from '@/components/ShareDraftButton'
import type { Post, Profile } from '@/types/database'
import {
  PenLine, Eye, Edit2, Trash2,
  Globe, FileText, Clock
} from 'lucide-react'

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')
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
  })

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
        <p className="text-sm text-[var(--text-secondary)]">
          {filteredPosts.length} {filteredPosts.length === 1 ? 'post' : 'posts'}
        </p>
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
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <div
              key={post.id}
              className="bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-xl p-5 hover:border-[var(--border-medium)] hover:shadow-sm transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {post.status === 'published' ? (
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--success)] bg-[var(--success)]/10 px-2 py-0.5 rounded-full">
                        <Globe size={12} />
                        Published
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] px-2 py-0.5 rounded-full">
                        <FileText size={12} />
                        Draft
                      </span>
                    )}
                    <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1">
                      <Clock size={12} />
                      {new Date(post.updated_at).toLocaleDateString()}
                    </span>
                  </div>

                  <h2 className="font-display text-lg tracking-tight text-[var(--text-primary)] truncate">
                    {post.title || 'Untitled'}
                  </h2>

                  {post.excerpt && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-1 mt-1">
                      {post.excerpt}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
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
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-light)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors"
                    >
                      <Eye size={14} />
                      View
                    </Link>
                  )}
                  <Link
                    href={`/write?edit=${post.id}`}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <Edit2 size={14} />
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDelete(post.id)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--error)] hover:bg-[var(--error)]/10 transition-colors"
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

