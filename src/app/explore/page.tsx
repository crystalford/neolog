'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { PostCardSkeleton } from '@/components/Skeleton'
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll'
import { Loader2, Search, Sparkles } from 'lucide-react'
import type { PostWithAuthor } from '@/types/database'

export default function ExplorePage() {
  const [filter, setFilter] = useState<'latest'>('latest')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [topTags, setTopTags] = useState<Array<{ id: string; name: string; slug: string; count: number }>>([])
  const supabase = createClient()

  const fetchPosts = useCallback(async (offset: number, limit: number) => {
    let query = supabase
      .from('posts')
      .select(`*, author:profiles(*), publication:publications(id, slug, name, logo_url)`)
      .eq('status', 'published')

    // Search filter
    if (searchQuery) {
      query = query.or(`title.ilike.%${searchQuery}%,subtitle.ilike.%${searchQuery}%,excerpt.ilike.%${searchQuery}%`)
    }

    // Tag filter - need to filter by tag if selected
    if (selectedTag) {
      const { data: postIds } = await supabase
        .from('post_tags')
        .select('post_id')
        .eq('tag_id', selectedTag)

      if (postIds && postIds.length > 0) {
        query = query.in('id', postIds.map(pt => pt.post_id))
      } else {
        // No posts with this tag
        return { data: [] as PostWithAuthor[], hasMore: false }
      }
    }

    query = query.range(offset, offset + limit - 1)
    query = query.order('published_at', { ascending: false })

    const { data, error } = await query

    console.log('[Explore Page] Query result:', {
      offset,
      limit,
      filter,
      searchQuery,
      selectedTag,
      count: data?.length || 0,
      error,
      posts: data
    })

    if (error) {
      console.error('[Explore Page] Error loading posts:', error)
    }

    return {
      data: (data || []) as PostWithAuthor[],
      hasMore: (data?.length || 0) === limit,
    }
  }, [filter, searchQuery, selectedTag, supabase])

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
    loadTopTags()
  }, [filter, searchQuery, selectedTag])

  const loadTopTags = async () => {
    // Get top 10 most used tags
    const { data } = await supabase
      .from('post_tags')
      .select('tag_id, tags(id, name, slug)')

    if (data) {
      const tagCounts = new Map<string, { id: string; name: string; slug: string; count: number }>()

      data.forEach((pt: any) => {
        if (pt.tags) {
          const existing = tagCounts.get(pt.tags.id)
          if (existing) {
            existing.count++
          } else {
            tagCounts.set(pt.tags.id, {
              id: pt.tags.id,
              name: pt.tags.name,
              slug: pt.tags.slug,
              count: 1
            })
          }
        }
      })

      const sorted = Array.from(tagCounts.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)

      setTopTags(sorted)
    }
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
      <main className="pt-14 pb-14 bg-[var(--bg-primary)] min-h-screen">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Header */}
          <div className="pt-12 mb-10">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="font-display text-5xl md:text-6xl font-bold mb-4 tracking-tight">Discover Great Writing</h1>
                <p className="text-lg text-[var(--text-secondary)]">
                  Real content from real creators. No algorithmic mystery, just good writing surfaced fairly.
                </p>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={18} />
                <input
                  type="text"
                  placeholder="Search posts by title, subtitle, or content..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-[var(--border-medium)] bg-[var(--bg-card)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text-tertiary)]"
                />
              </div>
            </div>

            {/* Tag Filters */}
            {topTags.length > 0 && (
              <div className="mb-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedTag(null)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                      selectedTag === null
                        ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-lg'
                        : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-medium)] hover:border-[var(--border-heavy)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    All Topics
                  </button>
                  {topTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTag(tag.id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${
                        selectedTag === tag.id
                          ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-lg'
                          : 'bg-[var(--bg-card)] text-[var(--text-secondary)] border-[var(--border-medium)] hover:border-[var(--border-heavy)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      #{tag.name} ({tag.count})
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats banner */}
            <div className="flex flex-wrap items-center gap-6 p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-pulse"></div>
                <span className="text-[var(--text-secondary)]">Live discovery feed</span>
              </div>
              <div className="text-sm text-[var(--text-tertiary)]">·</div>
              <div className="text-sm text-[var(--text-secondary)]">
                {searchQuery ? `Searching for "${searchQuery}"` : selectedTag ? `Filtered by ${topTags.find(t => t.id === selectedTag)?.name}` : 'Posts ranked by recency, engagement, and quality'}
              </div>
              {!searchQuery && !selectedTag && (
                <>
                  <div className="text-sm text-[var(--text-tertiary)]">·</div>
                  <Link href="/search" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 font-medium transition-colors">
                    Try semantic search →
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="grid lg:grid-cols-4 gap-6">
            {/* Main content */}
            <div className="lg:col-span-3">

              {/* Posts grid */}
              {loading ? (
                <div className="grid md:grid-cols-2 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <PostCardSkeleton key={i} />
                  ))}
                </div>
              ) : posts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 px-6">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-medium)] flex items-center justify-center mb-6">
                    <FileText size={32} className="text-[var(--text-tertiary)]" />
                  </div>
                  <h3 className="font-display text-2xl font-semibold mb-3 text-[var(--text-primary)]">No published posts yet</h3>
                  <p className="text-[var(--text-secondary)] mb-8 max-w-md text-center leading-relaxed">
                    Be the first to share your writing! Imported posts are saved as drafts - remember to publish them.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Link href="/write" className="btn btn-primary">
                      Write a Post
                    </Link>
                    <Link href="/dashboard" className="btn btn-secondary">
                      Check Drafts
                    </Link>
                  </div>
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
              {/* Call to action */}
              <div className="relative overflow-hidden p-6 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-medium)]">
                <div className="absolute inset-0 bg-gradient-to-br from-[var(--accent)]/10 via-transparent to-[var(--accent-purple)]/5" />
                <div className="relative z-10">
                  <div className="mb-4">
                    <h3 className="font-display text-lg font-semibold text-[var(--text-primary)]">Your Turn to Get Discovered</h3>
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] mb-6 leading-relaxed">
                    Write once, reach everywhere. Built-in SEO, multi-platform distribution, and real analytics. Your first post could be on this page tomorrow.
                  </p>
                  <Link href="/write" className="btn btn-primary w-full mb-3">
                    Start Writing Free
                  </Link>
                  <Link href="/import" className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors flex items-center justify-center gap-1">
                    Or import from Ghost/Substack →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  )
}
