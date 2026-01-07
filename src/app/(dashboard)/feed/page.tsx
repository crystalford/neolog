'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { PostCard } from '@/components/PostCard'
import { ContinueReading } from '@/components/ContinueReading'
import { PostCardListSkeleton } from '@/components/Skeleton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { Rss, Compass, Users, Loader2 } from 'lucide-react'

type FeedPost = {
  post_id: string
  title: string
  slug: string
  subtitle: string | null
  excerpt: string | null
  cover_image_url: string | null
  published_at: string
  reading_time_minutes: number | null
  content_type: string | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

export default function FeedPage() {
  const [subscriptionCount, setSubscriptionCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  const [typeFilter, setTypeFilter] = useState<'all' | 'standard' | 'pulse'>('all')

  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const checkAuth = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login?redirect=/feed')
      return
    }

    setUserId(session.user.id)

    const { count } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', session.user.id)

    setSubscriptionCount(count || 0)
  }, [router, supabase])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const fetchPosts = useCallback(
    async (offset: number, limit: number) => {
      if (!userId) return { data: [], hasMore: false }

      const contentType = typeFilter === 'pulse' ? 'pulse' : null

      const { data } = await supabase.rpc('get_subscription_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
        p_content_type: contentType,
      })

      return {
        data: (data || []) as FeedPost[],
        hasMore: (data?.length || 0) === limit,
      }
    },
    [supabase, typeFilter, userId]
  )

  const {
    data: posts,
    loading,
    loadingMore,
    hasMore,
    loadMoreRef,
    loadInitial,
  } = useInfiniteScroll<FeedPost>({
    pageSize: 20,
    fetchFn: fetchPosts,
  })

  useEffect(() => {
    if (userId) loadInitial()
  }, [loadInitial, typeFilter, userId])

  const visiblePosts = useMemo(() => {
    if (typeFilter === 'pulse') return posts.filter((p) => p.content_type === 'pulse')
    if (typeFilter === 'standard') return posts.filter((p) => p.content_type !== 'pulse')
    return posts
  }, [posts, typeFilter])

  const transformedPosts = useMemo(
    () =>
      visiblePosts.map((post) => ({
        id: post.post_id,
        title: post.title,
        slug: post.slug,
        subtitle: post.subtitle,
        excerpt: post.excerpt,
        cover_image_url: post.cover_image_url,
        published_at: post.published_at,
        reading_time_minutes: post.reading_time_minutes,
        status: 'published' as const,
        content_type: (post.content_type || 'html') as any,
        author: {
          id: post.author_id,
          username: post.author_username,
          display_name: post.author_display_name,
          avatar_url: post.author_avatar_url,
        },
      })),
    [visiblePosts]
  )

  const [seriesMap, setSeriesMap] = useState<Map<string, any>>(new Map())

  useEffect(() => {
    const ids = visiblePosts.map((p) => p.post_id).filter(Boolean)
    if (ids.length === 0) {
      setSeriesMap(new Map())
      return
    }

    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from('posts')
        .select('id, series:series(title, slug)')
        .in('id', ids)

      if (cancelled) return
      const map = new Map<string, any>()
      ;(data || []).forEach((row: any) => map.set(row.id, row.series))
      setSeriesMap(map)
    })()

    return () => {
      cancelled = true
    }
  }, [supabase, visiblePosts])

  const transformedPostsWithSeries = useMemo(
    () =>
      transformedPosts.map((p: any) => ({
        ...p,
        series: seriesMap.get(p.id) || null,
      })),
    [seriesMap, transformedPosts]
  )

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Rss size={24} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Your Feed</h1>
              <p className="text-[var(--text-secondary)]">
                {subscriptionCount > 0
                  ? `Posts from ${subscriptionCount} creator${subscriptionCount === 1 ? '' : 's'} you follow`
                  : 'Subscribe to creators to see their posts here'}
              </p>
            </div>
          </div>

          <Link href="/explore" className="btn btn-secondary">
            <Compass size={16} />
            Explore
          </Link>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-8">
          {[
            { id: 'all', label: 'All' },
            { id: 'standard', label: 'Standard' },
            { id: 'pulse', label: 'Pulse' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setTypeFilter(item.id as typeof typeFilter)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                typeFilter === item.id
                  ? 'bg-[var(--accent)] text-[var(--text-inverse)] border-[var(--accent)]'
                  : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--border-medium)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <ContinueReading />

        {loading ? (
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <PostCardListSkeleton key={i} />
            ))}
          </div>
        ) : subscriptionCount === 0 ? (
          <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
            <h2 className="font-display text-xl mb-2">No subscriptions yet</h2>
            <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
              Follow creators to see their latest posts in your feed.
            </p>
            <Link href="/explore" className="btn btn-primary">
              <Compass size={16} />
              Find Creators
            </Link>
          </div>
        ) : transformedPosts.length === 0 ? (
          <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
            <Rss size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
            <h2 className="font-display text-xl mb-2">No posts yet</h2>
            <p className="text-[var(--text-secondary)] mb-6">
              New posts from creators you follow will appear here
            </p>
            <Link href="/explore" className="btn btn-secondary">
              <Compass size={16} />
              Explore More
            </Link>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {transformedPostsWithSeries.map((post) => (
                <PostCard key={post.id} post={post as any} variant="list" />
              ))}
            </div>

            {loadingMore && (
              <div className="flex items-center justify-center py-10">
                <Loader2 size={28} className="animate-spin text-[var(--text-tertiary)]" />
              </div>
            )}

            {hasMore && <div ref={loadMoreRef} className="h-10" />}
          </>
        )}
      </main>
  )
    }




