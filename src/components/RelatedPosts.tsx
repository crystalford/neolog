'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Sparkles } from 'lucide-react'

type RelatedPost = {
  id: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  published_at: string
  reading_time_minutes: number | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
  shared_tags: number
}

interface RelatedPostsProps {
  postId: string
}

export function RelatedPosts({ postId }: RelatedPostsProps) {
  const [posts, setPosts] = useState<RelatedPost[]>([])
  const [loading, setLoading] = useState(true)
  
  const supabase = createClient()

  useEffect(() => {
    loadRelated()
  }, [postId])

  const loadRelated = async () => {
    const { data } = await supabase
      .rpc('get_related_posts', {
        p_post_id: postId,
        p_limit: 3,
      })

    if (data) {
      setPosts(data)
    }
    setLoading(false)
  }

  if (loading || posts.length === 0) return null

  return (
    <section className="mt-12 pt-8 border-t border-[var(--border-light)]">
      <h2 className="font-display text-xl mb-6 flex items-center gap-2">
        <Sparkles size={20} className="text-[var(--accent)]" />
        You might also like
      </h2>

      <div className="grid sm:grid-cols-3 gap-4">
        {posts.map(post => (
          <Link
            key={post.id}
            href={`/${post.author_username}/${post.slug}`}
            className="group rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] overflow-hidden hover:border-[var(--border-medium)] transition-colors"
          >
            {post.cover_image_url && (
              <div className="aspect-video overflow-hidden">
                <img 
                  src={post.cover_image_url}
                  alt=""
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
            )}
            
            <div className="p-4">
              <h3 className="font-medium line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                {post.title}
              </h3>
              <p className="text-sm text-[var(--text-tertiary)] mt-2">
                {post.author_display_name || post.author_username}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
