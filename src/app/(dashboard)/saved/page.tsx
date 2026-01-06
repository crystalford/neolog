'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { PostCard } from '@/components/PostCard'
import { Bookmark, Loader2, Compass } from 'lucide-react'

type SavedPost = {
  bookmark_id: string
  bookmarked_at: string
  post_id: string
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
}

export default function SavedPage() {
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [loading, setLoading] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadBookmarks()
  }, [])

  const loadBookmarks = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/saved')
      return
    }

    const { data } = await supabase
      .rpc('get_user_bookmarks', {
        p_user_id: session.user.id,
        p_limit: 50,
        p_offset: 0,
      })

    if (data) {
      setPosts(data)
    }

    setLoading(false)
  }

  // Transform for PostCard
  const transformedPosts = posts.map(post => ({
    id: post.post_id,
    title: post.title,
    slug: post.slug,
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
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
              <Bookmark size={24} className="text-[var(--accent)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Saved</h1>
              <p className="text-[var(--text-secondary)]">
                {posts.length > 0 
                  ? `${posts.length} saved post${posts.length !== 1 ? 's' : ''}`
                  : 'Posts you save will appear here'
                }
              </p>
            </div>
          </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <Bookmark size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">No saved posts yet</h2>
          <p className="text-[var(--text-secondary)] mb-6 max-w-md mx-auto">
            Click the bookmark icon on any post to save it for later
          </p>
          <Link href="/explore" className="btn btn-primary">
            <Compass size={16} />
            Explore Posts
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {transformedPosts.map((post) => (
            <PostCard key={post.id} post={post as any} variant="list" />
          ))}
        </div>
      )}
    </main>
  )
}


