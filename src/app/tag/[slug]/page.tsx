import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { Hash, ArrowLeft } from 'lucide-react'

interface Props {
  params: { slug: string }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()
  
  const { data: tag } = await supabase
    .from('tags')
    .select('name, description')
    .eq('slug', params.slug)
    .single()
  
  if (!tag) return { title: 'Tag Not Found' }
  
  return {
    title: `#${tag.name} — Neolog`,
    description: tag.description || `Posts tagged with ${tag.name}`,
  }
}

export default async function TagPage({ params }: Props) {
  const supabase = createClient()
  
  // Get tag info
  const { data: tag } = await supabase
    .from('tags')
    .select('*')
    .eq('slug', params.slug)
    .single()
  
  if (!tag) {
    notFound()
  }
  
  // Get posts with this tag
  const { data: posts } = await supabase
    .rpc('get_posts_by_tag', {
      p_tag_slug: params.slug,
      p_limit: 50,
      p_offset: 0,
    })
  
  // Transform for PostCard
  const transformedPosts = (posts || []).map((post: any) => ({
    id: post.id,
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
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          {/* Back link */}
          <Link 
            href="/explore"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mb-6 pt-6"
          >
            <ArrowLeft size={14} />
            Explore
          </Link>

          {/* Tag header */}
          <div className="flex items-center gap-4 mb-8">
            <div 
              className="w-14 h-14 rounded-xl flex items-center justify-center"
              style={{ backgroundColor: `${tag.color}15` }}
            >
              <Hash size={28} style={{ color: tag.color }} />
            </div>
            <div>
              <h1 className="font-display text-3xl">#{tag.name}</h1>
              <p className="text-[var(--text-secondary)]">
                {tag.post_count} {tag.post_count === 1 ? 'post' : 'posts'}
              </p>
            </div>
          </div>

          {tag.description && (
            <p className="text-[var(--text-secondary)] mb-8">
              {tag.description}
            </p>
          )}

          {/* Posts */}
          {transformedPosts.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Hash size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No posts yet</h2>
              <p className="text-[var(--text-secondary)]">
                Be the first to write about #{tag.name}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {transformedPosts.map((post: any) => (
                <PostCard key={post.id} post={post} variant="list" />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
