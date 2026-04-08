'use client'
export const runtime = 'edge'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Publication {
  id: string
  name: string
  slug: string
  total_views: number
}

export default function PublicationAnalyticsPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  const [publication, setPublication] = useState<Publication | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [metrics, setMetrics] = useState({ views: 0, recentViews: 0, comments: 0, posts: 0 })
  const [topPosts, setTopPosts] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in to view analytics.')
        setLoading(false)
        return
      }

      const { data: pub, error: pubError } = await supabase
        .from('publications')
        .select('id, name, slug, total_views')
        .eq('slug', slug)
        .eq('owner_id', session.user.id)
        .single()

      if (pubError || !pub) {
        setError('Publication not found.')
        setLoading(false)
        return
      }

      setPublication(pub)

      const { data: posts } = await supabase
        .from('posts')
        .select('id, title, published_at, updated_at')
        .eq('publication_id', pub.id)
        .order('published_at', { ascending: false })

      const postIds = (posts || []).map((post) => post.id)
      const sevenDaysAgo = new Date()
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

      let totalViews = pub.total_views || 0
      let recentViews = 0
      let commentCount = 0

      if (postIds.length > 0) {
        const { data: viewRows } = await supabase
          .from('post_views')
          .select('post_id, started_at')
          .in('post_id', postIds)

        const { data: recentRows } = await supabase
          .from('post_views')
          .select('post_id')
          .in('post_id', postIds)
          .gte('started_at', sevenDaysAgo.toISOString())

        const { data: commentRows } = await supabase
          .from('comments')
          .select('post_id')
          .in('post_id', postIds)
          .eq('status', 'visible')

        if (viewRows) {
          totalViews = Math.max(totalViews, viewRows.length)
        }
        recentViews = recentRows?.length || 0
        commentCount = commentRows?.length || 0

        setTopPosts((posts || []).slice(0, 5))
      }

      setMetrics({
        views: totalViews,
        recentViews,
        comments: commentCount,
        posts: posts?.length || 0,
      })

      setLoading(false)
    }

    loadData()
  }, [slug, supabase])

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-64 skeleton rounded" />
          <div className="grid md:grid-cols-4 gap-4 mt-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 skeleton rounded" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (error || !publication) {
    return (
      <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto">
        <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] p-6 text-sm text-[var(--text-secondary)]">
          {error || 'Unable to load analytics.'}
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Analytics</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">
          {publication.name} analytics
        </h1>
        <p className="text-sm text-[var(--text-secondary)] mt-1">
          Traffic and engagement for this publication.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {[
          { label: 'Total posts', value: metrics.posts },
          { label: 'Total views', value: metrics.views },
          { label: 'Views (7d)', value: metrics.recentViews },
          { label: 'Comments', value: metrics.comments },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-4"
          >
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text-primary)]">
              {stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-[var(--text-primary)]">Top posts</h2>
          <Link href={`/publications/${slug}`} className="btn btn-secondary btn-sm">
            Back to overview
          </Link>
        </div>
        {topPosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-4">No published posts yet.</p>
            <Link href="/write" className="btn btn-primary btn-sm">
              Start a post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {topPosts.map((post) => (
              <div key={post.id} className="py-3 flex items-center justify-between text-sm">
                <span className="text-[var(--text-primary)] font-medium truncate">
                  {post.title || 'Untitled'}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {post.published_at ? new Date(post.published_at).toLocaleDateString() : 'Draft'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}
