'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { PostCardSkeleton } from '@/components/Skeleton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { TrendingUp, Clock, Sparkles, Award, Loader2 } from 'lucide-react'
import type { PostWithAuthor } from '@/types/database'

type RisingPost = {
  post_id: string
  title: string
  slug: string
  author_username: string
  author_display_name: string | null
  total_views: number
  upvote_count: number
  published_at: string
}

export default function ExplorePage() {
  const [risingPosts, setRisingPosts] = useState<RisingPost[]>([])
  const [filter, setFilter] = useState<'latest' | 'popular' | 'rising'>('latest')
  const supabase = createClient()

  const fetchPosts = useCallback(async (offset: number, limit: number) => {
    let query = supabase
      .from('posts')
      .select(`*, author:profiles(*), series:series(title, slug)`)
      .eq('status', 'published')
      .range(offset, offset + limit - 1)

    if (filter === 'latest') {
      query = query.order('published_at', { ascending: false })
    } else if (filter === 'popular') {
      query = query.order('fork_count', { ascending: false })
    } else {
      query = query.order('upvote_count', { ascending: false })
    }

    const { data, error } = await query
    return {
      data: (data || []) as PostWithAuthor[],
      hasMore: (data?.length || 0) === limit,
    }
  }, [filter, supabase])

  const {
    data: posts,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
    loadInitial,
  } = useInfiniteScroll<PostWithAuthor>({
    pageSize: 12,
    fetchFn: fetchPosts,
  })

  useEffect(() => {
    loadInitial()
    loadRisingPosts()
  }, [filter])

  const loadRisingPosts = async () => {
    const { data } = await supabase.rpc('get_rising_posts', { limit_count: 5 })
    if (data) setRisingPosts(data)
  }

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    return 'Just now'
  }

  return (
    <>
      <Header />
      <main className="pt-14 pb-14">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="pt-8 mb-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="font-display text-4xl md:text-5xl mb-3">Discover Great Writing</h1>
                <p className="text-lg text-[var(--text-secondary)]">
                  Real content from real creators. No algorithmic mystery, just good writing surfaced fairly.
                </p>
              </div>

              {/* Links - Desktop only */}
              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/visuals"
                  className="btn btn-ghost btn-sm"
                >
                  <Sparkles size={16} />
                  Visuals
                </Link>
              </div>
            </div>

            {/* Stats banner */}
            <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-[var(--text-secondary)]">Live discovery feed</span>
              </div>
              <div className="text-sm text-[var(--text-tertiary)]">•</div>
              <div className="text-sm text-[var(--text-secondary)]">
                Posts ranked by recency, engagement, and quality
              </div>
              <div className="text-sm text-[var(--text-tertiary)]">•</div>
              <Link href="/search" className="text-sm text-[var(--accent)] hover:underline flex items-center gap-1">
                Try semantic search →
              </Link>
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            {/* Main content */}
            <div className="lg:col-span-3">
              {/* Filters */}
              <div className="flex flex-wrap gap-2 mb-4">
                {[
                  { id: 'latest', label: 'Latest', icon: Clock },
                  { id: 'popular', label: 'Most Forked', icon: Sparkles },
                  { id: 'rising', label: 'Rising', icon: TrendingUp },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setFilter(id as typeof filter)}
                    className={`
                      flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all
                      ${filter === id
                        ? 'bg-[var(--accent)] text-[var(--text-inverse)]'
                        : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }
                    `}
                  >
                    <Icon size={16} />
                    {label}
                  </button>
                ))}
              </div>

              {/* Posts grid */}
              {loading ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <PostCardSkeleton key={i} />
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)]">
                  <Sparkles size={32} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                  <p className="text-[var(--text-secondary)]">No posts yet</p>
                </div>
              ) : (
                <>
                  <div className="grid md:grid-cols-2 gap-6">
                    {posts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                  
                  {/* Load more trigger */}
                  <div ref={loadMoreRef} className="py-8 flex justify-center">
                    {loadingMore && (
                      <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
                    )}
                    {!hasMore && posts.length > 0 && (
                      <p className="text-sm text-[var(--text-tertiary)]">You've reached the end</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Rising posts */}
              <div className="rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden">
                <div className="p-3 border-b border-[var(--border-light)] flex items-center gap-2">
                  <TrendingUp size={18} className="text-[var(--accent)]" />
                  <h2 className="font-display text-lg">Rising Now</h2>
                </div>
                
                {risingPosts.length === 0 ? (
                  <div className="p-4 text-sm text-[var(--text-tertiary)]">
                    No rising posts yet
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-light)]">
                    {risingPosts.map((post, i) => (
                      <Link
                        key={post.post_id}
                        href={`/${post.author_username}/${post.slug}`}
                        className="block p-3 hover:bg-[var(--bg-tertiary)] transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <span className="w-6 h-6 rounded-full bg-[var(--accent-soft)] flex items-center justify-center text-xs font-medium text-[var(--accent)]">
                            {i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-medium text-sm line-clamp-2 mb-1">
                              {post.title}
                            </h3>
                            <p className="text-xs text-[var(--text-tertiary)]">
                              {post.author_display_name || post.author_username} - {formatTimeAgo(post.published_at)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>

              {/* Call to action */}
              <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--accent-soft)] to-[var(--bg-secondary)] border-2 border-[var(--accent)]/30">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={20} className="text-[var(--accent)]" />
                  <h3 className="font-display text-lg font-bold">Your Turn to Get Discovered</h3>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                  Write once, reach everywhere. Built-in SEO, multi-platform distribution, and real analytics. Your first post could be on this page tomorrow.
                </p>
                <Link href="/write" className="btn btn-primary btn-sm w-full mb-3">
                  Start Writing Free
                </Link>
                <Link href="/import" className="btn btn-ghost btn-sm w-full text-xs">
                  Or import from Ghost/Substack →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}


