'use client'

import Link from 'next/link'
import { Clock, ArrowUpRight, Code } from 'lucide-react'
import type { PostWithAuthor } from '@/types/database'

interface PostCardProps {
  post: PostWithAuthor
  variant?: 'default' | 'featured' | 'compact' | 'list'
}

export function PostCard({ post, variant = 'default' }: PostCardProps) {
  const publishedDate = post.published_at 
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    : null

  const hasInteractiveContent = post.content?.includes('<script') || 
                                 (post.content_type === 'html' && post.content?.includes('<!doctype'))

  if (variant === 'compact') {
    return (
      <article className="group">
        <Link 
          href={`/${post.author.username}/${post.slug}`}
          className="block h-full p-4 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-sm transition-all"
        >
          {post.cover_image_url && (
            <div className="aspect-[16/9] mb-4 rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
              <img src={post.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            </div>
          )}
          <h2 className="font-display text-base mb-2 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
            {post.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="truncate">{post.author.display_name || post.author.username}</span>
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'list') {
    return (
      <article className="group py-6 border-b border-[var(--border-light)] last:border-0">
        <Link href={`/${post.author.username}/${post.slug}`} className="block">
           <h2 className="font-display text-xl mb-2">{post.title}</h2>
        </Link>
      </article>
    )
  }

  // Default variant - CLEAN VERSION (No nested Links)
  return (
    <article className="group relative">
      <Link 
        href={`/${post.author.username}/${post.slug}`}
        className="block p-5 rounded-2xl border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-secondary)]/50 transition-all duration-300"
      >
        {post.cover_image_url && (
          <div className="relative aspect-[16/9] mb-4 rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
            <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          </div>
        )}

        <div className="flex items-center gap-2 mb-2">
          {hasInteractiveContent && (
            <span className="doc-badge doc-badge-interactive"><Code size={10} /> Interactive</span>
          )}
        </div>
        
        {/* FIXED: Replaced nested Link with a div/span since the parent Link covers the whole card */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {post.author.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="w-6 h-6 rounded-full" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-medium text-white">
                {(post.author.display_name || post.author.username)[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm text-[var(--text-secondary)]">
              {post.author.display_name || post.author.username}
            </span>
          </div>
          
          {publishedDate && (
            <>
              <span className="text-[var(--text-tertiary)]"> - </span>
              <time className="text-sm text-[var(--text-tertiary)]">{publishedDate}</time>
            </>
          )}
        </div>

        <h2 className="font-display text-lg md:text-xl mb-2 group-hover:text-[var(--accent)] transition-colors leading-snug">
          {post.title}
        </h2>
        
        {post.excerpt && (
          <p className="text-[var(--text-secondary)] text-sm line-clamp-2 mb-4 leading-relaxed">
            {post.excerpt}
          </p>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-light)]">
           <span className="text-xs text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Read <ArrowUpRight size={14} />
          </span>
        </div>
      </Link>
    </article>
  )
}
