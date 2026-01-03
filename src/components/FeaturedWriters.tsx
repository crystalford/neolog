'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Star, ChevronRight } from 'lucide-react'

type FeaturedWriter = {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  post_count: number
}

export function FeaturedWriters() {
  const [writers, setWriters] = useState<FeaturedWriter[]>([])
  const supabase = createClient()

  useEffect(() => {
    loadFeatured()
  }, [])

  const loadFeatured = async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url, bio')
      .eq('is_featured', true)
      .order('featured_at', { ascending: false })
      .limit(6)

    if (data && data.length > 0) {
      // Get post counts
      const withCounts = await Promise.all(
        data.map(async (writer) => {
          const { count } = await supabase
            .from('posts')
            .select('*', { count: 'exact', head: true })
            .eq('author_id', writer.id)
            .eq('status', 'published')
          return { ...writer, post_count: count || 0 }
        })
      )
      setWriters(withCounts)
    }
  }

  if (writers.length === 0) return null

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl flex items-center gap-2">
          <Star size={20} className="text-[var(--accent)]" />
          Featured Writers
        </h2>
        <Link href="/writers" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--accent)] flex items-center gap-1">
          View all <ChevronRight size={14} />
        </Link>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {writers.map(writer => (
          <Link
            key={writer.id}
            href={`/${writer.username}`}
            className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors group"
          >
            {writer.avatar_url ? (
              <img src={writer.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center text-lg text-white font-medium">
                {(writer.display_name || writer.username)[0].toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                {writer.display_name || writer.username}
              </p>
              <p className="text-sm text-[var(--text-tertiary)]">
                @{writer.username} · {writer.post_count} posts
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
