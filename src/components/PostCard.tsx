'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Clock, ArrowUpRight, Code } from 'lucide-react'
import type { PostWithAuthor } from '@/types/database'
import { GenerativeCover } from './GenerativeCover'

type PostWithOptionalSeries = PostWithAuthor & {
  series?: {
    title: string
    slug: string
  } | null
}

interface PostCardProps {
  post: PostWithOptionalSeries
  variant?: 'default' | 'featured' | 'compact' | 'list'
}

export function PostCard({ post, variant = 'default' }: PostCardProps) {
  const router = useRouter()

  const postHref = `/${post.author.username}/${post.slug}`
  const stackHref = post.series?.slug ? `/${post.author.username}/stack/${post.series.slug}` : null

  const isDraft = post.status === 'draft';
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
          className="block h-full p-3 rounded-2xl bg-[var(--bg-primary)] border border-[var(--border-light)] shadow-sm hover:border-[var(--border-medium)] hover:shadow-md transition-all"
        >
          <div className="aspect-[16/9] mb-4 rounded-xl overflow-hidden bg-[var(--bg-tertiary)]">
            {post.cover_image_url ? (
              <img src={post.cover_image_url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
            ) : (
              <GenerativeCover
                contentSeed={`${post.id}-${post.title}`}
                width={600}
                height={338}
                title={post.title}
                author={post.author.display_name || post.author.username}
                className="w-full h-full group-hover:scale-105 transition-transform duration-500"
              />
            )}
          </div>
          <div className="flex items-center gap-2 mb-1">
            {isDraft && (
              <span className="doc-badge doc-badge-draft bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">Draft</span>
            )}
          </div>
          <h2 className="font-display text-base mb-2 group-hover:text-[var(--accent)] transition-colors line-clamp-2">
            {post.title}
          </h2>
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
            <span className="truncate">{post.author.display_name || post.author.username}</span>
            {!isDraft && publishedDate && (
              <>
                <span>-</span>
                <time>{publishedDate}</time>
              </>
            )}
          </div>
        </Link>
      </article>
    )
  }

  if (variant === 'list') {
    return (
      <article
        className="group py-6 border-b border-[var(--border-light)] last:border-0"
        role="link"
        tabIndex={0}
        aria-label={post.title}
        onClick={() => router.push(postHref)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            router.push(postHref)
          }
        }}
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="w-full md:w-40 h-28 rounded-xl overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
            {post.cover_image_url ? (
              <img
                src={post.cover_image_url}
                alt=""
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
            ) : (
              <GenerativeCover
                contentSeed={`${post.id}-${post.title}`}
                width={320}
                height={224}
                className="w-full h-full group-hover:scale-105 transition-transform duration-500"
              />
            )}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              {isDraft && (
                <span className="doc-badge doc-badge-draft bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">Draft</span>
              )}
            </div>
            <h2 className="font-display text-xl mb-2">{post.title}</h2>
            {stackHref && post.series?.title && (
              <div className="mb-2">
                <Link
                  href={stackHref}
                  onClick={(e) => e.stopPropagation()}
                  className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                >
                  Part of stack: <span className="text-[var(--accent)]">{post.series.title}</span>
                </Link>
              </div>
            )}
            {post.excerpt && (
              <p className="text-sm text-[var(--text-secondary)] line-clamp-2">{post.excerpt}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <span>{post.author.display_name || post.author.username}</span>
              {!isDraft && publishedDate && (
                <>
                  <span>-</span>
                  <time>{publishedDate}</time>
                </>
              )}
            </div>
          </div>
        </div>
      </article>
    )
  }

  // Default variant - CLEAN VERSION (No nested Links)
  return (
    <article
      className="group relative"
      role="link"
      tabIndex={0}
      aria-label={post.title}
      onClick={() => router.push(postHref)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          router.push(postHref)
        }
      }}
    >
      <div className="block p-5 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] shadow-sm hover:border-[var(--border-medium)] hover:shadow-md hover:bg-[var(--bg-secondary)]/40 transition-all duration-300">
        <div className="relative aspect-[16/9] mb-4 rounded-xl overflow-hidden bg-[var(--bg-secondary)]">
          {post.cover_image_url ? (
            <>
              <img src={post.cover_image_url} alt={post.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            </>
          ) : (
            <GenerativeCover
              contentSeed={`${post.id}-${post.title}`}
              width={800}
              height={450}
              title={post.title}
              author={post.author.display_name || post.author.username}
              className="w-full h-full group-hover:scale-105 transition-transform duration-500"
            />
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          {isDraft && (
            <span className="doc-badge doc-badge-draft bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full text-xs font-semibold">Draft</span>
          )}
          {hasInteractiveContent && (
            <span className="doc-badge doc-badge-interactive"><Code size={10} /> Interactive</span>
          )}
        </div>
        {/* Author and published date, demoted if not draft */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            {post.author.avatar_url ? (
              <img src={post.author.avatar_url} alt="" className="w-7 h-7 rounded-full" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-medium text-white">
                {(post.author.display_name || post.author.username)[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm text-[var(--text-secondary)]">
              {post.author.display_name || post.author.username}
            </span>
          </div>
          {!isDraft && publishedDate && (
            <>
              <span className="text-[var(--text-tertiary)]">-</span>
              <time className="text-sm text-[var(--text-tertiary)]">{publishedDate}</time>
            </>
          )}
        </div>

        {stackHref && post.series?.title && (
          <div className="mb-2">
            <Link
              href={stackHref}
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              Part of stack: <span className="text-[var(--accent)]">{post.series.title}</span>
            </Link>
          </div>
        )}

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
      </div>
    </article>
  )
}
