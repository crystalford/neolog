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
    const { data: postsData, error: postsError } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        slug,
        excerpt,
        published_at
      `)
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })

    console.log('[Published Page] Query result:', {
      count: postsData?.length || 0,
      error: postsError,
      userId: session.user.id,
      posts: postsData
    })

    if (postsError) {
      console.error('[Published Page] Error loading posts:', postsError)
    }

    // SKIP comment/reaction queries - RLS blocks them (403)
    const publishedPosts: PublishedPost[] = (postsData || []).map((post) => ({
      id: post.id,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      published_at: post.published_at,
      view_count: 0,
      comment_count: 0,
      reaction_count: 0,
    }))

    setPosts(publishedPosts)

    // Calculate totals (only view_count, rest are RLS blocked)
    const totalViews = publishedPosts.reduce((sum, p) => sum + p.view_count, 0)

    setStats({
      totalViews,
      totalComments: 0,
      totalReactions: 0,
      subscriberCount: 0,
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
      <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="grid grid-cols-4 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 skeleton rounded-2xl" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 skeleton rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
      <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">Published</h1>
          <p className="text-base text-[var(--text-secondary)] mt-2">Published posts are an optional exposure state. Your workspace is where continuity lives.</p>
        </div>
        <Link href="/dashboard/workspace" className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          View Drafts
        </Link>
      </div>

      {/* Analytics and engagement panels demoted: hidden by default, can be re-enabled in settings */}
      {/* ...existing code... */}

      {/* Posts Tab */}
      {activeTab === 'posts' && (
        <>
          {/* Search */}
          {posts.length > 0 && (
            <div className="relative mb-8">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search published posts..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border-light)] bg-white/80 text-base focus:outline-none focus:border-[var(--accent)] shadow"
              />
            </div>
          )}

          {filteredPosts.length > 0 ? (
            <div className="space-y-4">
              {filteredPosts.map((post, i) => (
                <div
                  key={post.id}
                  className={`group p-5 rounded-2xl border transition-colors shadow ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : 'bg-white/90'} hover:border-[var(--accent)] border-[var(--border-light)]`}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                        {post.title || 'Untitled'}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-base text-[var(--text-secondary)]">
                        <span className="flex items-center gap-2">
                          <Calendar size={14} />
                          {formatRelativeTime(post.published_at)}
                        </span>
                        {/* Analytics and engagement stats demoted: visually subtle, not primary */}
                        <span className="flex items-center gap-2 opacity-60">
                          <Eye size={14} />
                          {post.view_count.toLocaleString()}
                        </span>
                        <span className="flex items-center gap-2 opacity-60">
                          <Heart size={14} />
                          {post.reaction_count}
                        </span>
                        <span className="flex items-center gap-2 opacity-60">
                          <MessageSquare size={14} />
                          {post.comment_count}
                        </span>
                      </div>
                    </div>
                    {/* Actions: Only edit, view is secondary */}
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/write?edit=${post.id}`}
                        className="btn btn-ghost text-base px-5 py-3 font-medium shadow focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        <Edit2 size={16} />
                      </Link>
                      {username && (
                        <Link
                          href={`/${username}/${post.slug}`}
                          className="btn btn-secondary text-base px-5 py-3 font-medium shadow focus:outline-none focus:ring-2 focus:ring-[var(--accent)] opacity-60"
                          target="_blank"
                        >
                          <ExternalLink size={16} />
                          View
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-16 text-center shadow">
              {search ? (
                <>
                  <Search size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                    No matches found
                  </h2>
                  <p className="text-base text-[var(--text-secondary)] mb-6">
                    Try a different search term.
                  </p>
                </>
              ) : (
                <>
                  <TrendingUp size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                    Nothing published yet
                  </h2>
                  <p className="text-base text-[var(--text-secondary)] mb-6">
                    Write, refine, publish. Your first piece awaits.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Link href="/dashboard/workspace" className="btn btn-secondary text-base px-5 py-3 font-medium">
                      View Drafts
                    </Link>
                    <Link href="/write" className="btn btn-primary text-base px-5 py-3 font-semibold">
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
        <div className="space-y-8">
          {/* Top Posts */}
          <div>
            <h2 className="text-base font-semibold text-[var(--text-secondary)] mb-4">Top Performing</h2>
            {posts.length > 0 ? (
              <div className="space-y-3">
                {[...posts]
                  .sort((a, b) => b.view_count - a.view_count)
                  .slice(0, 5)
                  .map((post, idx) => (
                    <div
                      key={post.id}
                      className="flex items-center justify-between p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow"
                    >
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 rounded bg-[var(--bg-secondary)] text-base flex items-center justify-center text-[var(--text-tertiary)] font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-base text-[var(--text-primary)] truncate max-w-[200px] font-semibold">
                          {post.title || 'Untitled'}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-base text-[var(--text-secondary)]">
                        <span className="flex items-center gap-2">
                          <Eye size={14} />
                          {post.view_count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-base text-[var(--text-secondary)]">Publish your first post to see analytics.</p>
            )}
          </div>

          {/* More Analytics Placeholder */}
          <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-12 text-center shadow">
            <BarChart2 size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
            <p className="text-base text-[var(--text-secondary)]">
              Deeper analytics coming soon.
            </p>
          </div>
        </div>
      )}

      {/* Engagement Tab */}
      {activeTab === 'engagement' && capabilities.showEngagementPanel && (
        <div className="space-y-8">
          {/* Subscribers */}
          <div className="rounded-2xl border border-[var(--border-light)] bg-white/80 p-8 shadow">
            <div className="flex items-center gap-4 mb-6">
              <Users size={24} className="text-[var(--text-secondary)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Subscribers</h2>
            </div>
            <p className="text-4xl font-bold text-[var(--text-primary)]">
              {stats.subscriberCount}
            </p>
            <p className="text-base text-[var(--text-secondary)] mt-2">
              {stats.subscriberCount === 0 
                ? 'Share your work to grow your audience.'
                : stats.subscriberCount === 1
                ? 'Your first subscriber! Keep going.'
                : 'People who want to hear from you.'}
            </p>
          </div>

          {/* Recent Comments Preview */}
          <div>
            <h2 className="text-base font-semibold text-[var(--text-secondary)] mb-4">Recent Engagement</h2>
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-12 text-center shadow">
              <MessageSquare size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
              <p className="text-base text-[var(--text-secondary)] mb-6">
                View all comments and reactions in one place.
              </p>
              <Link href="/comments" className="btn btn-secondary text-lg px-6 py-3 font-medium">
                View Comments
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
