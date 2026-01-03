import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { ForkButton } from '@/components/ForkButton'
import { ForkedFrom } from '@/components/ForkedFrom'
import { ForkTree } from '@/components/ForkTree'
import { UpvoteButton } from '@/components/UpvoteButton'
import { BookmarkButton } from '@/components/BookmarkButton'
import { ShareBar } from '@/components/ShareButtons'
import { TagPills } from '@/components/TagSelect'
import { Comments } from '@/components/Comments'
import { ReadingTracker } from '@/components/ReadingTracker'
import { RelatedPosts } from '@/components/RelatedPosts'
import { Reactions } from '@/components/Reactions'
import { SeriesNav } from '@/components/SeriesNav'
import { SocialLinks } from '@/components/SocialLinks'
import { Paywall } from '@/components/Paywall'
import { TableOfContents, addHeadingIds } from '@/components/TableOfContents'
import { AddToListButton } from '@/components/AddToListButton'
import { Webmentions } from '@/components/Webmentions'
import { CoAuthorsList } from '@/components/CoAuthors'
import { generateSEO, generateArticleSchema } from '@/lib/seo'
import { processEmbeds } from '@/lib/embeds'
import { processFootnotes } from '@/lib/footnotes'
import { Clock, ArrowLeft, GitFork, ExternalLink } from 'lucide-react'

interface Props {
  params: {
    username: string
    slug: string
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

export default async function PostPage({ params }: Props) {
  const supabase = createClient()
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', params.username)
    .single()
  
  if (!profile) notFound()

  const { data: post } = await supabase
    .from('posts')
    .select('*')
    .eq('author_id', profile.id)
    .eq('slug', params.slug)
    .eq('status', 'published')
    .single()

  if (!post) notFound()

  let forkedFromPost = null
  if (post.forked_from_id) {
    const { data } = await supabase
      .from('posts')
      .select(`
        id,
        title,
        slug,
        author:profiles(*)
      `)
      .eq('id', post.forked_from_id)
      .single()
    
    forkedFromPost = data as any
  }

  const { count: upvoteCount } = await supabase
    .from('post_upvotes')
    .select('*', { count: 'exact', head: true })
    .eq('post_id', post.id)

  const { data: postTags } = await supabase
    .from('post_tags')
    .select('tag:tags(name, slug, color)')
    .eq('post_id', post.id)
  
  const tags = postTags?.map((pt: any) => pt.tag.name) || []

  const publishedDate = post.published_at 
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : null

  const isFullDocument = post.content?.trim().toLowerCase().startsWith('<!doctype')

  return (
    <>
      <Header />
      <main className="pt-20">
        {isFullDocument ? (
          <div className="max-w-4xl mx-auto px-6 py-8">
            <Link 
              href={`/${params.username}`}
              className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to {profile.display_name || profile.username}
            </Link>

            {forkedFromPost && (
              <div className="mb-6">
                <ForkedFrom originalPost={forkedFromPost} />
              </div>
            )}

            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <UpvoteButton 
                  postId={post.id} 
                  initialUpvotes={upvoteCount || 0}
                />
                {post.fork_count > 0 && (
                  <span className="doc-badge">
                    <GitFork size={10} />
                    {post.fork_count} {post.fork_count === 1 ? 'fork' : 'forks'}
                  </span>
                )}
              </div>
              <ForkButton
                postId={post.id}
                postTitle={post.title}
                postContent={post.content}
                postContentType={post.content_type}
                allowForks={post.allow_forks ?? true}
                forkCount={post.fork_count ?? 0}
              />
            </div>
            
            <article className="bg-white rounded-2xl overflow-hidden shadow-xl">
              <iframe
                srcDoc={post.content || ''}
                className="w-full min-h-[80vh] border-none"
                sandbox="allow-scripts"
                title={post.title}
              />
            </article>

            {(post.fork_count > 0 || post.forked_from_id) && (
              <div className="mt-8">
                <ForkTree 
                  postId={post.id} 
                  rootPostId={post.root_post_id}
                  currentPostId={post.id}
                />
              </div>
            )}
          </div>
        ) : (
          <article className="max-w-2xl mx-auto px-6 py-12 animate-fade-up">
            <header className="mb-8">
              <Link 
                href={`/${params.username}`}
                className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to {profile.display_name || profile.username}
              </Link>

              {forkedFromPost && (
                <div className="mb-6">
                  <ForkedFrom originalPost={forkedFromPost} />
                </div>
              )}
              
              <h1 className="font-display text-4xl md:text-5xl mb-4 leading-tight">
                {post.title}
              </h1>
              
              {post.subtitle && (
                <p className="text-xl text-[var(--text-secondary)] mb-6">{post.subtitle}</p>
              )}
              
              <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border-light)]">
                <div className="flex items-center gap-4">
                  <Link href={`/${params.username}`} className="flex items-center gap-3 group">
                    {profile.avatar_url ? (
                      <img 
                        src={profile.avatar_url} 
                        alt={profile.display_name || profile.username}
                        className="w-10 h-10 rounded-full"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[var(--accent)] flex items-center justify-center text-sm font-medium text-white">
                        {(profile.display_name || profile.username)[0].toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="font-medium group-hover:text-[var(--accent)] transition-colors">
                        {profile.display_name || profile.username}
                      </p>
                      <p className="text-sm text-[var(--text-tertiary)]">@{profile.username}</p>
                    </div>
                  </Link>
                  
                  <div className="flex items-center gap-4 text-sm text-[var(--text-tertiary)]">
                    {publishedDate && <time>{publishedDate}</time>}
                    {post.reading_time_minutes && (
                      <span className="flex items-center gap-1">
                        <Clock size={14} />
                        {post.reading_time_minutes} min read
                      </span>
                    )}
                  </div>
                  
                  {tags.length > 0 && (
                    <div className="mt-3">
                      <TagPills tags={tags} />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <UpvoteButton 
                    postId={post.id} 
                    initialUpvotes={upvoteCount || 0}
                  />
                  <BookmarkButton postId={post.id} />
                  <AddToListButton postId={post.id} />
                  <ForkButton
                    postId={post.id}
                    postTitle={post.title}
                    postContent={post.content}
                    postContentType={post.content_type}
                    allowForks={post.allow_forks ?? true}
                    forkCount={post.fork_count ?? 0}
                  />
                </div>
              </div>
            </header>

            {post.cover_image_url && (
              <img 
                src={post.cover_image_url} 
                alt={post.title}
                className="w-full rounded-xl mb-8"
              />
            )}

            {post.canonical_url && (
              <div className="mb-8 p-4 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center gap-3">
                <ExternalLink size={16} className="text-[var(--text-tertiary)]" />
                <p className="text-sm text-[var(--text-secondary)]">
                  Originally published on{' '}
                  <a 
                    href={post.canonical_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-[var(--accent)] hover:underline"
                  >
                    {post.original_source || 'another platform'}
                  </a>
                </p>
              </div>
            )}

            <CoAuthorsList postId={post.id} />

            <div 
              className="prose"
              dangerouslySetInnerHTML={{ 
                __html: processFootnotes(processEmbeds(addHeadingIds(post.content_html || post.content || ''))) 
              }}
            />

            <ShareBar 
              url={`${process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'}/${profile.username}/${post.slug}`}
              title={post.title}
            />

            <div className="py-4 flex justify-center">
              <Reactions postId={post.id} />
            </div>

            <Webmentions postId={post.id} />

            {(post.fork_count > 0 || post.forked_from_id) && (
              <div className="mt-12 pt-8 border-t border-[var(--border-light)]">
                <ForkTree 
                  postId={post.id} 
                  rootPostId={post.root_post_id}
                  currentPostId={post.id}
                />
              </div>
            )}

            <RelatedPosts postId={post.id} />

            <Comments postId={post.id} postAuthorId={post.author_id} />
            
            <ReadingTracker postId={post.id} />
          </article>
        )}
      </main>
    </>
  )
}
