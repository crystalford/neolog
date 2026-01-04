import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Clock, Eye, AlertTriangle } from 'lucide-react'

interface Props {
  params: { token: string }
}

export const metadata = {
  title: 'Preview - Neolog',
  robots: 'noindex, nofollow',
}

export default async function PreviewPage({ params }: Props) {
  const supabase = createClient()
  
  // Validate token and get post
  const { data: postId } = await supabase
    .rpc('validate_preview_token', { p_token: params.token })

  if (!postId) {
    notFound()
  }

  // Get full post data
  const { data: post } = await supabase
    .from('posts')
    .select(`
      *,
      author:profiles(id, username, display_name, avatar_url)
    `)
    .eq('id', postId)
    .single()

  if (!post) {
    notFound()
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        {/* Preview banner */}
        <div className="bg-[var(--warning)]/10 border-b border-[var(--warning)]/20">
          <div className="max-w-7xl mx-auto px-6 lg:px-12 py-3 flex items-center gap-3">
            <Eye size={18} className="text-[var(--warning)]" />
            <div className="flex-1">
              <p className="text-sm font-medium">Preview Mode</p>
              <p className="text-xs text-[var(--text-secondary)]">
                This is a draft preview. Only people with this link can see it.
              </p>
            </div>
            {post.preview_expires_at && (
              <p className="text-xs text-[var(--text-tertiary)]">
                Expires {formatDate(post.preview_expires_at)}
              </p>
            )}
          </div>
        </div>

        <article className="max-w-7xl mx-auto px-6 lg:px-12 py-12">
          {/* Cover image */}
          {post.cover_image_url && (
            <img 
              src={post.cover_image_url} 
              alt={post.title}
              className="w-full rounded-xl mb-8 aspect-video object-cover"
            />
          )}

          {/* Title */}
          <h1 className="font-display text-4xl md:text-5xl mb-4 leading-tight">
            {post.title}
          </h1>

          {/* Subtitle */}
          {post.subtitle && (
            <p className="text-xl text-[var(--text-secondary)] mb-6">
              {post.subtitle}
            </p>
          )}

          {/* Author & meta */}
          <div className="flex items-center gap-4 mb-8 pb-8 border-b border-[var(--border-light)]">
            <Link href={`/${post.author.username}`} className="flex items-center gap-3 group">
              {post.author.avatar_url ? (
                <img 
                  src={post.author.avatar_url} 
                  alt={post.author.display_name || post.author.username}
                  className="w-10 h-10 rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-white font-medium">
                  {(post.author.display_name || post.author.username)[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium group-hover:text-[var(--accent)] transition-colors">
                  {post.author.display_name || post.author.username}
                </p>
                <p className="text-sm text-[var(--text-tertiary)]">
                  Draft - {post.reading_time_minutes || 1} min read
                </p>
              </div>
            </Link>
          </div>

          {/* Content */}
          <div 
            className="prose"
            dangerouslySetInnerHTML={{ __html: post.content_html || post.content || '' }}
          />

          {/* Draft notice */}
          <div className="mt-12 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-start gap-3">
            <AlertTriangle size={18} className="text-[var(--warning)] mt-0.5" />
            <div>
              <p className="font-medium">This is an unpublished draft</p>
              <p className="text-sm text-[var(--text-secondary)]">
                The author is still working on this post. Content may change before publication.
              </p>
            </div>
          </div>
        </article>
      </main>
    </>
  )
}


