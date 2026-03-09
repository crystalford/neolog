'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Search, Eye, MessageSquare, Heart, BarChart2,
  Users, TrendingUp, Calendar, ExternalLink, Edit2, Sparkles
} from 'lucide-react'

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
  const [username, setUsername] = useState<string | null>(null)

  const router = useRouter()
  const supabase = createClient()
  const { capabilities } = useUserMaturity(userId)

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
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
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
    <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            PUBLISH
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Published
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Published posts are an optional exposure state. Your workspace is where continuity lives.
          </p>
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
                aria-label="Search published posts"
                className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/80 text-base focus:outline-none focus:border-[var(--accent)] shadow"
              />
            </div>
          )}

          {filteredPosts.length > 0 ? (
            <div className="space-y-4">
              {filteredPosts.map((post, i) => (
                <div
                  key={post.id}
                  className={`group p-5 rounded-2xl border transition-colors shadow ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : 'bg-[var(--bg-primary)]/90'} hover:border-[var(--accent)] border-[var(--border-light)]`}
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
            <div className="rounded-2xl border border-[var(--border-light)] bg-gradient-to-br from-[var(--bg-primary)] to-[var(--bg-secondary)] p-16 text-center shadow-lg">
              {search ? (
                <>
                  <Search size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
                  <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                    No matches found
                  </h2>
                  <p className="text-base text-[var(--text-secondary)] mb-6">
                    Try a different keyword or clear filters.
                  </p>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-hover)] flex items-center justify-center mx-auto mb-6 shadow-lg">
                    <Sparkles size={40} className="text-white" />
                  </div>
                  <h2 className="font-display text-2xl text-[var(--text-primary)] mb-3 font-bold">
                    Ready to share your ideas?
                  </h2>
                  <p className="text-base text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
                    Your published posts will appear here. Start writing and share your thoughts with the world.
                  </p>
                  <div className="flex gap-4 justify-center">
                    <Link href="/write" className="btn btn-primary text-base px-6 py-3 font-medium shadow-md hover:shadow-lg transition-shadow">
                      Write Your First Post
                    </Link>
                    <Link href="/dashboard/workspace" className="btn btn-secondary text-base px-6 py-3 font-medium">
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
                      className="flex items-center justify-between p-4 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/90 shadow"
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
          <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-12 text-center shadow">
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
          <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/80 p-8 shadow">
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
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-12 text-center shadow">
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
