'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface Publication {
  id: string
  name: string
  slug: string
  description: string | null
  primary_color: string
  accent_color: string
  custom_domain: string | null
  created_at: string
  total_posts: number
  total_subscribers: number
  total_views: number
}

export default function PublicationOverviewPage({
  params,
}: {
  params: { slug: string }
}) {
  const { slug } = params
  const [publication, setPublication] = useState<Publication | null>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      setError(null)

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setError('Please sign in to view this publication.')
        setLoading(false)
        return
      }

      const { data: pub, error: pubError } = await supabase
        .from('publications')
        .select('id, name, slug, description, primary_color, accent_color, custom_domain, created_at, total_posts, total_subscribers, total_views')
        .eq('slug', slug)
        .eq('owner_id', session.user.id)
        .single()

      if (pubError || !pub) {
        setError('Publication not found.')
        setLoading(false)
        return
      }

      setPublication(pub)

      const { data: postRows, error: postsError } = await supabase
        .from('posts')
        .select('id, title, status, updated_at, published_at')
        .eq('publication_id', pub.id)
        .order('updated_at', { ascending: false })
        .limit(6)

      console.log('[Publication Page] Posts query result:', {
        publicationId: pub.id,
        publicationSlug: slug,
        count: postRows?.length || 0,
        error: postsError,
        posts: postRows
      })

      setPosts(postRows || [])
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
          <div className="grid md:grid-cols-3 gap-4 mt-6">
            {[1, 2, 3].map((i) => (
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
          {error || 'Unable to load publication.'}
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Publication</p>
        <div className="flex items-center gap-3 mt-2">
          <span
            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold text-white"
            style={{ backgroundColor: publication.primary_color || 'var(--accent)' }}
          >
            {publication.name.charAt(0).toUpperCase()}
          </span>
          <div>
            <h1 className="font-display text-3xl text-[var(--text-primary)]">{publication.name}</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              @{publication.slug}{publication.custom_domain ? ` - ${publication.custom_domain}` : ''}
            </p>
          </div>
        </div>
        {publication.description && (
          <p className="text-sm text-[var(--text-secondary)] mt-3 max-w-2xl">
            {publication.description}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { label: 'Posts', value: publication.total_posts ?? posts.length },
          { label: 'Subscribers', value: publication.total_subscribers ?? 0 },
          { label: 'Views', value: publication.total_views ?? 0 },
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
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-[var(--text-primary)]">Recent activity</h2>
              <p className="text-sm text-[var(--text-secondary)]">
                Latest updates across this publication.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/publications/${slug}/analytics`} className="btn btn-secondary btn-sm">
                View analytics
              </Link>
              <Link href={`/publications/${slug}/fediverse`} className="btn btn-secondary btn-sm">
                Fediverse
              </Link>
              <Link href={`/publications/${slug}/settings`} className="btn btn-secondary btn-sm">
                Settings
              </Link>
            </div>
          </div>

        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-6 text-center">
            <p className="text-sm text-[var(--text-secondary)] mb-4">
              No posts yet for this publication.
            </p>
            <Link href="/write" className="btn btn-primary btn-sm">
              Start a post
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-light)]">
            {posts.map((post) => (
              <div key={post.id} className="py-3 flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-[var(--text-primary)] font-medium truncate">
                    {post.title || 'Untitled'}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {post.status} - Updated {new Date(post.updated_at).toLocaleDateString()}
                  </p>
                </div>
                <Link href={`/write?edit=${post.id}`} className="btn btn-secondary btn-sm">
                  Edit
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}

