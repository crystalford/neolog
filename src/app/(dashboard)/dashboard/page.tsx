'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { analyzeSEO } from '@/lib/seo-scoring'
import {
  PenLine, Eye, MessageCircle, Calendar, Search, Filter,
  ArrowUpDown, TrendingUp
} from 'lucide-react'

interface Post {
  id: string
  title: string
  slug: string
  status: string
  published_at: string | null
  created_at: string
  updated_at: string
  subtitle: string | null
  content: string | null
  publicationSlug: string | null
  views: number
  reactions: number
  seoScore: number
}

export default function DashboardPage() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')
  const [sortBy, setSortBy] = useState<'updated' | 'published' | 'views'>('updated')

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadPosts()
  }, [filter, sortBy])

  const loadPosts = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    // Build query based on filter
    let query = supabase
      .from('posts')
      .select('id, title, slug, status, published_at, created_at, updated_at, subtitle, content, publication:publications(slug)')
      .eq('author_id', session.user.id)

    if (filter === 'published') {
      query = query.eq('status', 'published')
    } else if (filter === 'draft') {
      query = query.eq('status', 'draft')
    }

    // Sort
    if (sortBy === 'published') {
      query = query.order('published_at', { ascending: false, nullsFirst: false })
    } else if (sortBy === 'updated') {
      query = query.order('updated_at', { ascending: false })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data: postsData } = await query

    if (postsData) {
      // Get view counts and reactions
      const postIds = postsData.map(p => p.id)

      const [viewData, reactionData] = await Promise.all([
        supabase.from('post_views').select('post_id').in('post_id', postIds),
        supabase.from('reactions').select('post_id').in('post_id', postIds)
      ])

      const viewCounts: Record<string, number> = {}
      const reactionCounts: Record<string, number> = {}

      viewData.data?.forEach(v => {
        viewCounts[v.post_id] = (viewCounts[v.post_id] || 0) + 1
      })
      reactionData.data?.forEach(r => {
        reactionCounts[r.post_id] = (reactionCounts[r.post_id] || 0) + 1
      })

      const enrichedPosts = postsData.map(p => {
        const seoAnalysis = analyzeSEO(
          p.title || '',
          p.subtitle || '',
          p.content || ''
        )

        const publication = Array.isArray(p.publication) ? p.publication[0] : p.publication

        return {
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          published_at: p.published_at,
          created_at: p.created_at,
          updated_at: p.updated_at,
          subtitle: p.subtitle,
          content: p.content,
          publicationSlug: publication?.slug || null,
          views: viewCounts[p.id] || 0,
          reactions: reactionCounts[p.id] || 0,
          seoScore: seoAnalysis.score,
        }
      })

      // Sort by views if needed
      if (sortBy === 'views') {
        enrichedPosts.sort((a, b) => b.views - a.views)
      }

      setPosts(enrichedPosts)
    }

    setLoading(false)
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not published'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const getStatusBadge = (status: string) => {
    if (status === 'published') {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
          Published
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
        Draft
      </span>
    )
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton rounded" />
          <div className="h-12 skeleton rounded-xl" />
          <div className="space-y-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-8 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">
              All Posts
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {posts.length} {posts.length === 1 ? 'post' : 'posts'} total
            </p>
          </div>
          <Link href="/write" className="btn btn-primary btn-xl px-10 py-5 text-xl font-semibold shadow-xl hover:shadow-2xl">
            New Post
          </Link>
        </div>

        {/* Filters & Sort */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Filter by status */}
          <div className="flex items-center gap-2 bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-lg p-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filter === 'all'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('published')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filter === 'published'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
            >
              Published
            </button>
            <button
              onClick={() => setFilter('draft')}
              className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${filter === 'draft'
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
            >
              Drafts
            </button>
          </div>

          {/* Sort */}
          <div className="flex items-center gap-2">
            <ArrowUpDown size={14} className="text-[var(--text-tertiary)]" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-1.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-primary)] text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <option value="updated">Last Updated</option>
              <option value="published">Published Date</option>
              <option value="views">Most Views</option>
            </select>
          </div>
        </div>
      </div>

      {/* Posts List */}
      {posts.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]">

          <h3 className="font-display text-xl font-semibold text-[var(--text-primary)] mb-2">
            {filter === 'published' ? 'No published posts yet' : filter === 'draft' ? 'No drafts yet' : 'No posts yet'}
          </h3>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            {filter === 'published' ? 'Publish your first post to see it here' : filter === 'draft' ? 'Start writing to create your first draft' : 'Start writing your first post'}
          </p>
          <Link href="/write" className="btn btn-primary btn-xl px-10 py-5 text-xl font-semibold shadow-xl hover:shadow-2xl">
            New Post
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={post.status === 'published' && post.publicationSlug
                ? `/${post.publicationSlug}/${post.slug}`
                : `/write?edit=${post.id}`}
              className="block p-5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--accent)] hover:shadow-md transition-all"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-semibold text-[var(--text-primary)] mb-1 truncate">
                    {post.title || 'Untitled'}
                  </h3>
                  {post.subtitle && (
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-1">
                      {post.subtitle}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(post.status)}
                  {post.status === 'published' && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${post.seoScore >= 80
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : post.seoScore >= 60
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                        }`}
                      title="SEO Score"
                    >
                      SEO {post.seoScore}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4 text-xs text-[var(--text-tertiary)]">
                {post.status === 'published' ? (
                  <>
                    <span className="flex items-center gap-1">
                      <Calendar size={14} />
                      {formatDate(post.published_at)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      {post.views} views
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={14} />
                      {post.reactions} reactions
                    </span>
                    {post.views > 0 && (
                      <span className="flex items-center gap-1 text-[var(--accent)]">
                        <TrendingUp size={14} />
                        Active
                      </span>
                    )}
                  </>
                ) : (
                  <span className="flex items-center gap-1">
                    <Calendar size={14} />
                    Updated {formatDate(post.updated_at)}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
