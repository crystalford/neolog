'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Search, ArrowRight, Eye, MessageSquare, Heart, BarChart2,
  Users, X, TrendingUp, Calendar, ExternalLink, Edit2
} from 'lucide-react'
import type { Post } from '@/types/database'

interface PublishedPost {
  id: string
  title: string | null
  slug: string
  excerpt: string | null
  published_at: string
  view_count: number
  comment_count: number
  reaction_count: number
}

interface EngagementStats {
  totalViews: number
  totalComments: number
  totalReactions: number
  subscriberCount: number
}

export default function PublishedPage() {
  const [posts, setPosts] = useState<PublishedPost[]>([])
  const [stats, setStats] = useState<EngagementStats>({
    totalViews: 0,
    totalComments: 0,
    totalReactions: 0,
    subscriberCount: 0,
  })
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'posts' | 'analytics' | 'engagement'>('posts')
  const [search, setSearch] = useState('')
  const [showAnalytics, setShowAnalytics] = useState(true)
  const [username, setUsername] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()
  const { capabilities, publishedCount, subscriberCount } = useUserMaturity(userId)

  useEffect(() => {
    loadPublished()
  }, [])

  const loadPublished = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)

    // Get username for links
    const { data: profile } = await supabase
      .from('profiles')
      .select('username')
      .eq('id', session.user.id)
      .single()

    setUsername(profile?.username || null)

    // Load published posts
    const { data: postsData } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        slug,
        excerpt,
        published_at,
        view_count
      `)
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    // Get comment and reaction counts for each post
    const publishedPosts: PublishedPost[] = await Promise.all(
      (postsData || []).map(async (post) => {
        // Get comment count
        const { count: commentCount } = await supabase
          .from('comments')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', post.id)

        // Get reaction count
        const { count: reactionCount } = await supabase
          .from('reactions')
          .select('*', { count: 'exact', head: true })
          .eq('post_id', post.id)

        return {
          id: post.id,
          title: post.title,
          slug: post.slug,
          excerpt: post.excerpt,
          published_at: post.published_at,
          view_count: post.view_count || 0,
          comment_count: commentCount || 0,
          reaction_count: reactionCount || 0,
        }
      })
    )

    setPosts(publishedPosts)

    // Calculate totals
    const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0)
    const totalComments = publishedPosts.reduce((sum, p) => sum + p.comment_count, 0)
    const totalReactions = publishedPosts.reduce((sum, p) => sum + p.reaction_count, 0)

    // Get subscriber count
    const { count: subCount } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('author_id', session.user.id)

    setStats({
      totalViews,
      totalComments,
      totalReactions,
      subscriberCount: subCount || 0,
    })

    setLoading(false)
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  // Filter posts by search
  const filteredPosts = posts.filter(p => {
    if (!search) return true
    const q = search.toLowerCase()
    return (p.title || '').toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 skeleton rounded-xl" />
            ))}
          </div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 skeleton rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-[var(--text-primary)]">Published</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Your work in the world.
          </p>
        </div>
        <Link href="/write" className="btn btn-primary btn-sm">
          New Post
        </Link>
      </div>

      {/* Stats Overview - Dismissible */}
      {showAnalytics && capabilities.showLightweightAnalytics && posts.length > 0 && (
        <div className="relative mb-6 p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <button
            onClick={() => setShowAnalytics(false)}
            className="absolute top-2 right-2 p-1 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
            title="Dismiss"
          >
            <X size={14} />
          </button>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{stats.totalViews.toLocaleString()}</p>
              <p className="text-xs text-[var(--text-secondary)]">Total views</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{posts.length}</p>
              <p className="text-xs text-[var(--text-secondary)]">Published</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{stats.totalReactions}</p>
              <p className="text-xs text-[var(--text-secondary)]">Reactions</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-semibold text-[var(--text-primary)]">{stats.subscriberCount}</p>
              <p className="text-xs text-[var(--text-secondary)]">Subscribers</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-6 w-fit">
        {[
          { id: 'posts', label: 'Posts' },
          ...(capabilities.showLightweightAnalytics ? [{ id: 'analytics', label: 'Analytics' }] : []),
          ...(capabilities.showEngagementPanel ? [{ id: 'engagement', label: 'Engagement' }] : []),
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <>
          {/* Search */}
          {posts.length > 0 && (
            <div className="relative mb-6">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search published posts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] text-sm focus:outline-none focus:border-[var(--border-medium)]"
              />
            </div>
          )}

          {filteredPosts.length > 0 ? (
            <div className="space-y-3">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="group p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-[var(--text-primary)] truncate">
                        {post.title || 'Untitled'}
                      </h3>
                      <div className="flex items-center gap-3 mt-1.5 text-sm text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1">
                          <Calendar size={12} />
                          {formatRelativeTime(post.published_at)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye size={12} />
                          {post.view_count.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart size={12} />
                          {post.reaction_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageSquare size={12} />
                          {post.comment_count}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {username && (
                        <Link
                          href={`/${username}/${post.slug}`}
                          className="btn btn-secondary btn-sm"
                          target="_blank"
                        >
                          <ExternalLink size={14} />
                          View
                        </Link>
                      )}
                      <Link
                        href={`/write?edit=${post.id}`}
                        className="btn btn-ghost btn-sm"
                      >
                        <Edit2 size={14} />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-12 text-center">
              {search ? (
                <>
                  <Search size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
                    No matches found
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)]">
                    Try a different search term.
                  </p>
                </>
              ) : (
                <>
                  <TrendingUp size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
                    Nothing published yet
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Write, refine, publish. Your first piece awaits.
                  </p>
                  <div className="flex gap-3 justify-center">
                    <Link href="/dashboard/workspace" className="btn btn-secondary">
                      View Drafts
                    </Link>
                    <Link href="/write" className="btn btn-primary">
                      Start Writing
                    </Link>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && capabilities.showLightweightAnalytics && (
        <div className="space-y-6">
          {/* Top Posts */}
          <div>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Top Performing</h2>
            {posts.length > 0 ? (
              <div className="space-y-2">
                {[...posts]
                  .sort((a, b) => b.view_count - a.view_count)
                  .slice(0, 5)
                  .map((post, idx) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)]"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded bg-[var(--bg-secondary)] text-xs flex items-center justify-center text-[var(--text-tertiary)]">
                          {idx + 1}
                        </span>
                        <span className="text-sm text-[var(--text-primary)] truncate max-w-[200px]">
                          {post.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-[var(--text-secondary)]">
                        <span className="flex items-center gap-1">
                          <Eye size={12} />
                          {post.view_count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">Publish your first post to see analytics.</p>
            )}
          </div>

          {/* More Analytics Placeholder */}
          <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-8 text-center">
            <BarChart2 size={32} className="mx-auto text-[var(--text-tertiary)] mb-3" />
            <p className="text-sm text-[var(--text-secondary)]">
              Deeper analytics coming soon.
            </p>
          </div>
        </div>
      )}

      {/* Engagement Tab */}
      {activeTab === 'engagement' && capabilities.showEngagementPanel && (
        <div className="space-y-6">
          {/* Subscribers */}
          <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-6">
            <div className="flex items-center gap-3 mb-4">
              <Users size={20} className="text-[var(--text-secondary)]" />
              <h2 className="text-base font-medium text-[var(--text-primary)]">Subscribers</h2>
            </div>
            <p className="text-3xl font-semibold text-[var(--text-primary)]">
              {stats.subscriberCount}
            </p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {stats.subscriberCount === 0 
                ? 'Share your work to grow your audience.'
                : stats.subscriberCount === 1
                ? 'Your first subscriber! Keep going.'
                : 'People who want to hear from you.'}
            </p>
          </div>

          {/* Recent Comments Preview */}
          <div>
            <h2 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Recent Engagement</h2>
            <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-8 text-center">
              <MessageSquare size={32} className="mx-auto text-[var(--text-tertiary)] mb-3" />
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                View all comments and reactions in one place.
              </p>
              <Link href="/comments" className="btn btn-secondary btn-sm">
                View Comments
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
