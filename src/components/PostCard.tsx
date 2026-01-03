'use client'

import Link from 'next/link'
import { Clock, ArrowUpRight, Code, Sparkles } from 'lucide-react'
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

  // Detect if post has interactive content (scripts)
  const hasInteractiveContent = post.content?.includes('<script') || 
                                 (post.content_type === 'html' && post.content?.includes('<!doctype'))

  // Compact grid card for homepage
  if (variant === 'compact') {
    return (
      <article className="group">
        <Link 
          href={`/${post.author.username}/${post.slug}`}
          className="block h-full p-5 rounded-xl bg-[var(--bg-primary)] border border-[var(--border-light)] hover:border-[var(--accent)] transition-all"
        >
          {post.cover_image_url && (
            <div className="aspect-[16/9] mb-4 rounded-lg overflow-hidden bg-[var(--bg-tertiary)]">
              <img 
                src={post.cover_image_url} 
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            </div>
          )}
           
          <h2 className="font-display text-lg mb-2 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
            {post.title}
          </h2>
           
          {post.excerpt && (
            <p className="text-[var(--text-secondary)] text-sm line-clamp-2 mb-3">
              {post.excerpt}
            </p>
          )}
           
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
            {post.author.avatar_url ? (
              <img 
                src={post.author.avatar_url}
                alt=""
                className="w-5 h-5 rounded-full"
              />
            ) : (
              <div className="w-5 h-5 rounded-full bg-[var(--accent)] flex items-center justify-center text-[10px] text-white font-medium">
                {(post.author.display_name || post.author.username)[0].toUpperCase()}
              </div>
            )}
            <span className="truncate">{post.author.display_name || post.author.username}</span>
          </div>
        </Link>
      </article>
    )
  }

  // List variant for feeds
  if (variant === 'list') {
    return (
      <article className="group py-6 border-b border-[var(--border-light)] last:border-0">
        <Link href={`/${post.author.username}/${post.slug}`} className="block">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h2 className="font-display text-xl mb-2 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
                {post.title}
              </h2>
              {post.excerpt && (
                <p className="text-[var(--text-secondary)] text-sm line-clamp-2 mb-3">
                  {post.excerpt}
                </p>
              )}
              <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
                <span>{post.author.display_name || post.author.username}</span>
                {publishedDate && (
                  <>
                    <span>·</span>
                    <time>{publishedDate}</time>
                  </>
                )}
                {post.reading_time_minutes && (
                  <>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {post.reading_time_minutes} min
                    </span>
                  </>
                )}
              </div>
            </div>
            
            {post.cover_image_url && (
              <div className="w-24 h-24 rounded-lg overflow-hidden bg-[var(--bg-secondary)] flex-shrink-0">
                <img 
                  src={post.cover_image_url} 
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>
        </Link>
      </article>
    )
  }

  return (
    <article className="group relative">
      <Link 
        href={`/${post.author.username}/${post.slug}`}
        className="block p-6 rounded-xl border border-[var(--border-light)] hover:border-[var(--border-medium)] hover:bg-[var(--bg-secondary)]/50 transition-all duration-300"
      >
        {/* Cover image */}
        {post.cover_image_url && (
          <div className="relative aspect-[16/9] mb-5 rounded-lg overflow-hidden bg-[var(--bg-secondary)]">
            <img 
              src={post.cover_image_url} 
              alt={post.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          </div>
        )}

        {/* Badges */}
        <div className="flex items-center gap-2 mb-3">
          {hasInteractiveContent && (
            <span className="doc-badge doc-badge-interactive">
              <Code size={10} />
              Interactive
            </span>
          )}
        </div>
        
        {/* Author & date */}
        <div className="flex items-center gap-3 mb-3">
          <Link 
            href={`/${post.author.username}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
          >
            {post.author.avatar_url ? (
              <img 
                src={post.author.avatar_url} 
                alt={post.author.display_name || post.author.username}
                className="w-6 h-6 rounded-full"
              />
            ) : (
              <div className="w-6 h-6 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-medium text-white">
                {(post.author.display_name || post.author.username)[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm text-[var(--text-secondary)]">
              {post.author.display_name || post.author.username}
            </span>
          </Link>
          
          {publishedDate && (
            <>
              <span className="text-[var(--text-tertiary)]">·</span>
              <time className="text-sm text-[var(--text-tertiary)]">{publishedDate}</time>
            </>
          )}
        </div>

        {/* Title */}
        <h2 className="font-display text-xl md:text-2xl mb-2 group-hover:text-[var(--accent)] transition-colors leading-snug">
          {post.title}
        </h2>
        
        {/* Subtitle */}
        {post.subtitle && (
          <p className="text-[var(--text-secondary)] mb-3">{post.subtitle}</p>
        )}
        
        {/* Excerpt */}
        {post.excerpt && (
          <p className="text-[var(--text-secondary)] text-sm line-clamp-2 mb-4 leading-relaxed">
            {post.excerpt}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-[var(--border-light)]">
          {post.reading_time_minutes ? (
            <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <Clock size={12} />
              {post.reading_time_minutes} min read
            </span>
          ) : (
            <span />
          )}
          
          <span className="text-sm text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Read
            <ArrowUpRight size={14} />
          </span>
        </div>
      </Link>
    </article>
  )
}
