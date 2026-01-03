'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
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
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

export default function FeedPage() {
  const [subscriptionCount, setSubscriptionCount] = useState(0)
  const [userId, setUserId] = useState<string | null>(null)
  
  const router = useRouter()
  const supabase = createClient()

  const fetchPosts = useCallback(async (offset: number, limit: number) => {
    if (!userId) return { data: [], hasMore: false }
    
    const { data } = await supabase
      .rpc('get_subscription_feed', {
        p_user_id: userId,
        p_limit: limit,
        p_offset: offset,
      })

    return {
      data: (data || []) as FeedPost[],
      hasMore: (data?.length || 0) === limit,
    }
  }, [userId, supabase])

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
    checkAuth()
  }, [])

  useEffect(() => {
    if (userId) {
      loadInitial()
    }
  }, [userId])

  const checkAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/feed')
      return
    }

    setUserId(session.user.id)

    // Get subscription count
    const { count } = await supabase
      .from('subscriptions')
      .select('*', { count: 'exact', head: true })
      .eq('subscriber_id', session.user.id)

    setSubscriptionCount(count || 0)
  }

  // Transform feed posts to PostWithAuthor format for PostCard
  const transformedPosts = posts.map(post => ({
    id: post.post_id,
    title: post.title,
    slug: post.slug,
    subtitle: post.subtitle,
    excerpt: post.excerpt,
    cover_image_url: post.cover_image_url,
    published_at: post.published_at,
    reading_time_minutes: post.reading_time_minutes,
    status: 'published' as const,
    author: {
      id: post.author_id,
      username: post.author_username,
      display_name: post.author_display_name,
      avatar_url: post.author_avatar_url,
    },
  }))

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="flex items-center justify-between pt-8 mb-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <Rss size={24} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Your Feed</h1>
                <p className="text-[var(--text-secondary)]">
                  {subscriptionCount > 0 
                    ? `Posts from ${subscriptionCount} creator${subscriptionCount === 1 ? '' : 's'} you follow`
                    : 'Subscribe to creators to see their posts here'
                  }
                </p>
              </div>
            </div>
            
            <Link href="/explore" className="btn btn-secondary">
              <Compass size={16} />
              Explore
            </Link>
          </div>

          {/* Continue Reading section */}
          <ContinueReading />

          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <PostCardListSkeleton key={i} />
              ))}
            </div>
          ) : posts.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              {subscriptionCount === 0 ? (
                <>
                  <Users size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                  <h2 className="font-display text-xl mb-2">Your feed is empty</h2>
                  <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                    Subscribe to creators to see their posts in your personalized feed
                  </p>
                  <Link href="/explore" className="btn btn-primary">
                    <Compass size={16} />
                    Discover Writers
                  </Link>
                </>
              ) : (
                <>
                  <Rss size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
                  <h2 className="font-display text-xl mb-2">No new posts yet</h2>
                  <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
                    The creators you follow haven't published anything recently
                  </p>
                  <Link href="/explore" className="btn btn-secondary">
                    <Compass size={16} />
                    Explore More
                  </Link>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-6">
                {transformedPosts.map((post) => (
                  <PostCard key={post.id} post={post as any} variant="list" />
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
      </main>
    </>
  )
}
