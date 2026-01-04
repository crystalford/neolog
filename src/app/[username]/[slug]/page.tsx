import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { HtmlIframe } from '@/components/HtmlIframe'
import { generateSEO } from '@/lib/seo'
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

  const publishedDate = post.published_at
    ? new Date(post.published_at).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      })
    : null
  const htmlContent = post.content_html || post.content || ''
  const isFullHtml = /<!doctype/i.test(htmlContent) || /<html[\s>]/i.test(htmlContent)

  return (
    <>
      <Header />
      <main className="pt-20">
        {isPreview && (
          <div className="bg-black text-white py-2 px-4 text-center text-sm font-medium">
            Preview Mode - This is a draft post
          </div>
        )}
        <article className="px-6 py-12">
          <div className="max-w-3xl mx-auto">
            <header className="mb-8">
              <Link
                href={`/${params.username}`}
                className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-6 transition-colors"
              >
                <ArrowLeft size={16} />
                Back to {profile.display_name || profile.username}
              </Link>

              <h1 className="font-serif text-4xl md:text-5xl mb-4 leading-tight text-gray-900">
                {post.title}
              </h1>

              {post.subtitle && (
                <p className="text-xl text-gray-600 mb-6">{post.subtitle}</p>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-gray-200">
                <Link href={`/${params.username}`} className="flex items-center gap-3 group">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name || profile.username}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-black flex items-center justify-center text-sm font-medium text-white">
                      {(profile.display_name || profile.username)[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-medium text-gray-900 group-hover:text-black transition-colors">
                      {profile.display_name || profile.username}
                    </p>
                    <div className="flex items-center gap-3 text-sm text-gray-500">
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
            </header>

            {!isFullHtml && post.cover_image_url && (
              <img
                src={post.cover_image_url}
                alt={post.title}
                className="w-full rounded-xl mb-8"
              />
            )}
          </div>

          {isFullHtml ? (
            <div className="max-w-3xl mx-auto">
              <HtmlIframe html={htmlContent} className="mt-6" />
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <div
                className="prose prose-lg max-w-none"
                dangerouslySetInnerHTML={{
                  __html: htmlContent
                }}
              />
            </div>
          )}
        </article>
      </main>
    </>
  )
}
