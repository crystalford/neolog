'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { BookOpen, ChevronRight } from 'lucide-react'

type ContinuePost = {
  post_id: string
  progress: number
  last_read_at: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  reading_time_minutes: number | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
  publication_slug?: string | null
}

export function ContinueReading() {
  const [posts, setPosts] = useState<ContinuePost[]>([])
  const [loading, setLoading] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    loadContinueReading()
  }, [])

  const loadContinueReading = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      setLoading(false)
      return
    }

    const { data } = await supabase
      .rpc('get_continue_reading', {
        p_user_id: session.user.id,
        p_limit: 3,
      })

    if (data) {
      setPosts(data)
    }
    setLoading(false)
  }

  if (loading || posts.length === 0) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl flex items-center gap-2">
          <BookOpen size={20} className="text-[var(--accent)]" />
          Continue Reading
        </h2>
        <Link 
          href="/history"
          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--accent)] flex items-center gap-1"
        >
          View all
          <ChevronRight size={14} />
        </Link>
      </div>

      <div className="grid gap-3">
        {posts.map(post => (
          <Link
            key={post.post_id}
            href={`/${post.publication_slug || post.author_username}/${post.slug}`}
            className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors group"
          >
            {/* Progress indicator */}
            <div className="relative w-12 h-12 flex-shrink-0">
              <svg className="w-12 h-12 transform -rotate-90">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="var(--bg-tertiary)"
                  strokeWidth="4"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${post.progress * 125.6} 125.6`}
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                {Math.round(post.progress * 100)}%
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                {post.title}
              </h3>
              <p className="text-sm text-[var(--text-tertiary)]">
                {post.author_display_name || post.author_username}
                {post.reading_time_minutes && (
                  <> - {Math.ceil(post.reading_time_minutes * (1 - post.progress))} min left</>
                )}
              </p>
            </div>

            <ChevronRight size={16} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
          </Link>
        ))}
      </div>
    </section>
  )
}


