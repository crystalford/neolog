import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { HtmlIframe } from '@/components/HtmlIframe'
import { PostDensityToggle } from '@/components/PostDensityToggle'
import { SeriesNav } from '@/components/SeriesNav'
import { ShareBar } from '@/components/ShareButtons'
import { NewsletterCTA } from '@/components/NewsletterCTA'
import { ReadingProgress } from '@/components/ReadingProgress'
import { generateArticleSchema, generateSEO } from '@/lib/seo'
import { Clock, ArrowLeft, Edit2 } from 'lucide-react'

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

  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, logo_url, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  if (!publication || !publication.is_active) return { title: 'Not Found' }

  const { data: post } = await supabase
    .from('posts')
    .select('title, excerpt, cover_image_url, published_at, updated_at')
    .eq('publication_id', publication.id)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single()

  if (!post) return { title: 'Not Found' }

  return {
    ...generateSEO({
      title: post.title,
      description: post.excerpt || undefined,
      image: post.cover_image_url || undefined,
      url: `/${publication.slug}/${params.slug}`,
      type: 'article',
      author: publication.name,
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
    }),
    alternates: {
      types: {
        'application/rss+xml': `/${publication.slug}/feed`,
        'application/atom+xml': `/${publication.slug}/feed`,
      },
    },
  }
}

export default async function PostPage({ params, searchParams }: Props) {
  const supabase = createClient()
  const isPreview = searchParams?.preview === 'true'

  // Get current user session
  const { data: { session } } = await supabase.auth.getSession()

  console.log('[Post Page] Loading post:', {
    publicationSlug: params.username,
    slug: params.slug,
    isPreview
  })

  const { data: publication, error: publicationError } = await supabase
    .from('publications')
    .select('id, name, slug, description, logo_url, owner_id, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  console.log('[Post Page] Publication query result:', {
    found: !!publication,
    error: publicationError,
    slug: params.username
  })

  if (!publication || !publication.is_active) {
    console.error('[Post Page] Publication not found for slug:', params.username)
    notFound()
  }

  // If preview mode, don't filter by status
  const postQuery = supabase
    .from('posts')
    .select('*, author:profiles(id, username, display_name, avatar_url)')
    .eq('publication_id', publication.id)
    .eq('slug', params.slug)

  // Only filter by published status if not in preview mode
  if (!isPreview) {
    postQuery.eq('status', 'published')
  }

  const { data: post, error: postError } = await postQuery.single()

  console.log('[Post Page] Post query result:', {
    found: !!post,
    error: postError,
    slug: params.slug,
    publicationId: publication.id,
    isPreview,
    postStatus: post?.status,
    postContentType: post?.content_type
  })

  if (!post) {
    console.error('[Post Page] Post not found:', {
      publicationSlug: publication.slug,
      slug: params.slug,
      publicationId: publication.id,
      isPreview
    })
    notFound()
  }

  // Check if current user is the author
  const isOwnPost = session?.user?.id === post.author_id
  const authorProfile = (post as any).author || null

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
  if (primaryTag?.id) {
    const { data: relatedRows } = await supabase
      .from('post_tags')
      .select('post:posts(id, title, slug, excerpt, published_at, status, publication_id, author:profiles(username, display_name, avatar_url), publication:publications(slug, name, logo_url))')
      .eq('tag_id', primaryTag.id)

    relatedPosts = (relatedRows || [])
      .map((row: any) => row.post)
      .filter((item: any) => item && item.id !== post.id && item.status === 'published')
      .filter((item: any) => item.publication_id === publication.id)
      .slice(0, 3)
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
  const isFullHtml = /<!doctype/i.test(htmlContent) || /<html[\s>]/i.test(htmlContent)
  const plainText = htmlContent
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const summarySentences = plainText ? plainText.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 4) : []
  const summaryText = summaryRow?.summary || post.excerpt || summarySentences.join(' ')

  const articleSchema = generateArticleSchema({
    title: post.title,
    description: post.excerpt || undefined,
    image: post.cover_image_url || undefined,
    url: `/${publication.slug}/${params.slug}`,
    author: publication.name,
    authorUrl: `/${publication.slug}`,
    publishedTime: post.published_at || undefined,
    modifiedTime: post.updated_at || undefined,
  })

  return (
    <>
      <Header />
      <ReadingProgress postId={post.id} content={post.content || ''} />
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
              <div className="flex items-center justify-between mb-6">
                <Link
                  href={`/${publication.slug}`}
                  className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  <ArrowLeft size={16} />
                  Back to {publication.name}
                </Link>

                {isOwnPost && (
                  <Link
                    href={`/write?edit=${post.id}`}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Edit2 size={16} />
                    Edit Post
                  </Link>
                )}
              </div>

              <h1 className="font-display text-4xl md:text-5xl mb-4 leading-tight text-[var(--text-primary)]">
                {post.title}
              </h1>

              {post.subtitle && (
                <p className="text-xl text-[var(--text-secondary)] mb-6">{post.subtitle}</p>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-[var(--border-light)]">
                <Link href={`/${publication.slug}`} className="flex items-center gap-3 group">
                  {publication.logo_url ? (
                    <img
                      src={publication.logo_url}
                      alt={publication.name}
                      loading="lazy"
                      className="w-10 h-10 rounded-2xl"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-2xl bg-[var(--text-primary)] flex items-center justify-center text-sm font-medium text-[var(--text-inverse)]">
                      {publication.name[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-[var(--text-primary)] group-hover:text-[var(--text-primary)] transition-colors">
                      {publication.name}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
                      {publishedDate && <time>{publishedDate}</time>}
                      {authorProfile?.display_name && (
                        <span>By {authorProfile.display_name}</span>
                      )}
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
                  href={`/${publication.slug}/stack/${stack.slug}`}
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
                loading="lazy"
                className="w-full rounded-xl mb-8"
              />
            )}
          </div>

          {isFullHtml ? (
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

          {/* Share buttons */}
          <div className="max-w-4xl mx-auto mt-12">
            <ShareBar
              url={`https://${process.env.NEXT_PUBLIC_SITE_URL || 'neolog.io'}/${publication.slug}/${params.slug}`}
              title={post.title}
            />
          </div>

          {/* Newsletter CTA */}
          <div className="max-w-4xl mx-auto mt-8">
            <NewsletterCTA
              authorName={publication.name}
              authorId={publication.owner_id}
            />
          </div>

          {/* Publication Bio/CTA */}
          <div className="max-w-4xl mx-auto mt-12 border-t border-[var(--border-light)] pt-8">
            <div className="rounded-2xl border border-[var(--border-light)] bg-gradient-to-br from-[var(--bg-secondary)] to-[var(--bg-primary)] p-6">
              <div className="flex items-start gap-4">
                <Link href={`/${publication.slug}`}>
                  {publication.logo_url ? (
                    <img
                      src={publication.logo_url}
                      alt={publication.name}
                      className="w-16 h-16 rounded-2xl ring-2 ring-[var(--border-light)]"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center text-xl font-medium text-white ring-2 ring-[var(--border-light)]">
                      {publication.name[0].toUpperCase()}
                    </div>
                  )}
                </Link>
                <div className="flex-1">
                  <h3 className="font-display text-xl mb-1">
                    Published by{' '}
                    <Link href={`/${publication.slug}`} className="text-[var(--text-primary)] hover:text-[var(--accent)] transition-colors">
                      {publication.name}
                    </Link>
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-4">
                    {publication.description || `Follow ${publication.name} for more great content`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/${publication.slug}`} className="btn btn-primary btn-sm">
                      View publication
                    </Link>
                    <Link href={`/${publication.slug}/feed`} className="btn btn-secondary btn-sm">
                      Subscribe via RSS
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                  <>
                    <h3 className="font-display text-xl mb-4 mt-6 text-[var(--text-primary)]">Continue Reading</h3>
                    <div className="grid gap-3">
                      {relatedPosts.map((related: any) => (
                        <Link
                          key={related.id}
                          href={`/${related.publication?.slug || publication.slug}/${related.slug}`}
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
                  </>
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
