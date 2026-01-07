import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { HtmlIframe } from '@/components/HtmlIframe'
import { PostDensityToggle } from '@/components/PostDensityToggle'
import { PulseArticle } from '@/components/PulseArticle'
import { SeriesNav } from '@/components/SeriesNav'
import { generateArticleSchema, generateSEO } from '@/lib/seo'
import { parsePulseContent } from '@/lib/pulse'
import { Clock, ArrowLeft } from 'lucide-react'

interface Props {
  params: {
    username: string
    slug: string
  }
  searchParams: {
    preview?: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, display_name, username')
    .eq('username', params.username)
    .single()

  if (!profile) return { title: 'Not Found' }

  const { data: post } = await supabase
    .from('posts')
    .select('title, excerpt, cover_image_url, published_at, updated_at')
    .eq('author_id', profile.id)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single()

  if (!post) return { title: 'Not Found' }

  return generateSEO({
    title: post.title,
    description: post.excerpt || undefined,
    image: post.cover_image_url || undefined,
    url: `/${params.username}/${params.slug}`,
    type: 'article',
    author: profile.display_name || profile.username,
    publishedTime: post.published_at,
    modifiedTime: post.updated_at,
  })
}

export default async function PostPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const isPreview = searchParams?.preview === 'true'

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()

  if (!profile) notFound()

  // If preview mode, don't filter by status
  const postQuery = supabase
    .from('posts')
    .select('*')
    .eq('author_id', profile.id)
    .eq('slug', params.slug)

  // Only filter by published status if not in preview mode
  if (!isPreview) {
    postQuery.eq('status', 'published')
  }

  const { data: post } = await postQuery.single()

  if (!post) notFound()

  const stackId: string | null = post.series_id || null
  const { data: stack } = stackId
    ? await supabase
        .from('series')
        .select('title, slug')
        .eq('id', stackId)
        .maybeSingle()
    : { data: null }

  const { data: tagRows } = await supabase
    .from('post_tags')
    .select('tag:tags(id, name, slug, color)')
    .eq('post_id', post.id)

  const tags = (tagRows || [])
    .map((row: any) => row.tag)
    .filter(Boolean)

  const primaryTag = tags[0]
  let relatedPosts: any[] = []
  if (primaryTag?.slug) {
    const { data: related } = await supabase
      .rpc('get_posts_by_tag', {
        p_tag_slug: primaryTag.slug,
        p_limit: 6,
        p_offset: 0,
      })
    relatedPosts = (related || []).filter((item: any) => item.id !== post.id).slice(0, 3)
  }

  const { data: curatedComments } = await supabase
    .from('curated_comments')
    .select('id, source, author_name, author_url, body, score, source_url, created_at, is_pinned')
    .eq('post_id', post.id)
    .order('is_pinned', { ascending: false })
    .order('score', { ascending: false })
    .limit(5)

  const { data: summaryRow } = await supabase
    .from('post_summaries')
    .select('summary, bullets, model')
    .eq('post_id', post.id)
    .maybeSingle()

  const publishedDate = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : null
  const htmlContent = post.content_html || post.content || ''
  const isPulse = post.content_type === 'pulse'
  const isFullHtml = !isPulse && (/<!doctype/i.test(htmlContent) || /<html[\s>]/i.test(htmlContent))
  const plainText = isPulse
    ? ''
    : htmlContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
  const summarySentences = plainText ? plainText.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4) : []
  const summaryText = summaryRow?.summary || post.excerpt || summarySentences.join(' ')
  const pulseContent = isPulse ? parsePulseContent(post.content || '') : null

  const articleSchema = generateArticleSchema({
    title: post.title,
    description: post.excerpt || undefined,
    image: post.cover_image_url || undefined,
    url: `/${params.username}/${params.slug}`,
    author: profile.display_name || profile.username,
    authorUrl: `/${params.username}`,
    publishedTime: post.published_at || undefined,
    modifiedTime: post.updated_at || undefined,
  })

  return (
    <>
      <Header />
      {!isPreview && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
        />
      )}
      <main className="pt-20">
        {isPreview && (
          <div className="bg-black text-white py-2 px-4 text-center text-sm font-medium">
            Preview Mode - This is a draft post
          </div>
        )}
        <article className="px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <header className="mb-8">
              <Link
                href={`/${params.username}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to {profile.display_name || profile.username}
              </Link>

              <h1 className="font-display text-4xl md:text-5xl mb-4 leading-tight text-[var(--text-primary)]">
                {post.title}
              </h1>

              {post.subtitle && (
                <p className="text-xl text-[var(--text-secondary)] mb-6">{post.subtitle}</p>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-light)]">
                <Link href={`/${params.username}`} className="flex items-center gap-3 group">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-[var(--text-primary)] flex items-center justify-center text-sm font-medium text-[var(--text-inverse)]">
                      {(profile.display_name || profile.username)[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {profile.display_name || profile.username}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
                      {publishedDate && <time>{publishedDate}</time>}
                      {post.reading_time_minutes && (
                        <span className="flex items-center gap-1">
                          <Clock size={14} />
                          {post.reading_time_minutes} min read
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap gap-2 text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                <span className="px-2.5 py-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                  Source of truth
                </span>
                <span className="px-2.5 py-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                  Ingest
                </span>
                <span className="px-2.5 py-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                  Core
                </span>
                <span className="px-2.5 py-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-secondary)]">
                  Broadcast
                </span>
              </div>
            </header>

            {stackId && stack?.slug && (
              <div className="mb-8">
                <Link
                  href={`/${params.username}/stack/${stack.slug}`}
                  className="block rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] p-4 hover:bg-[var(--bg-tertiary)] transition-colors"
                >
                  <p className="text-xs text-[var(--text-tertiary)]">Part of stack</p>
                  <p className="font-medium text-[var(--text-primary)]">{stack.title}</p>
                  <p className="text-sm text-[var(--text-tertiary)] mt-1">View stack hub</p>
                </Link>
              </div>
            )}

            {stackId && <SeriesNav seriesId={stackId} currentPostId={post.id} />}

            {!isFullHtml && post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full rounded-xl mb-8"
              />
            )}
          </div>

          {isPulse && pulseContent ? (
            <div className="max-w-4xl mx-auto">
              <PulseArticle pulse={pulseContent} />
            </div>
          ) : isFullHtml ? (
            <div className="max-w-4xl mx-auto">
              <HtmlIframe html={htmlContent} className="mt-6" />
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              <PostDensityToggle
                postId={post.id}
                summary={summaryText}
                bullets={summaryRow?.bullets || summarySentences}
                model={summaryRow?.model || null}
                html={htmlContent}
              />
            </div>
          )}

          {tags.length > 0 && (
            <div className="max-w-4xl mx-auto mt-12 border-t border-[var(--border-light)] pt-8">
              <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)] p-6">
                <h2 className="font-display text-2xl mb-4 text-[var(--text-primary)]">Where this fits</h2>
                <div className="flex flex-wrap gap-2 mb-6">
                  {tags.map((tag: any) => (
                    <Link
                      key={tag.id}
                      href={`/tag/${tag.slug}`}
                      className="px-3 py-1.5 rounded-full text-xs font-medium border border-[var(--border-light)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-medium)] transition-colors bg-[var(--bg-primary)]"
                    >
                      #{tag.name}
                    </Link>
                  ))}
                </div>
                {relatedPosts.length > 0 && (
                  <div className="grid gap-3">
                    {relatedPosts.map((related: any) => (
                      <Link
                        key={related.id}
                        href={`/${related.author_username}/${related.slug}`}
                        className="block p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                      >
                        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                          More on #{primaryTag?.name}
                        </p>
                        <p className="text-lg font-medium text-[var(--text-primary)]">{related.title}</p>
                        {related.excerpt && (
                          <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">{related.excerpt}</p>
                        )}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {curatedComments && curatedComments.length > 0 && (
            <div className="max-w-4xl mx-auto mt-12 border-t border-[var(--border-light)] pt-8">
              <h2 className="font-display text-2xl mb-4 text-[var(--text-primary)]">Community highlights</h2>
              <div className="space-y-4">
                {curatedComments.map((comment) => (
                  <div key={comment.id} className="p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)]">
                    <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)] mb-2">
                      <div className="flex items-center gap-2">
                        <span>{comment.author_name || 'Contributor'}</span>
                        {comment.score ? <span>{comment.score} upvotes</span> : null}
                      </div>
                      {comment.source_url && (
                        <a
                          href={comment.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                        >
                          View on {comment.source}
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{comment.body}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </article>
      </main>
    </>
  )
}
