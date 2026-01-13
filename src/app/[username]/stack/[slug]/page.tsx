import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { generateSEO } from '@/lib/seo'
import { ArrowLeft } from 'lucide-react'

interface Props {
  params: {
    username: string
    slug: string
  }
}

export async function generateMetadata({ params }: Props) {
  const supabase = createClient()

  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, owner_id, logo_url, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  if (!publication || !publication.is_active) return { title: 'Not Found' }

  const { data: stack } = await supabase
    .from('series')
    .select('title, description, cover_image_url')
    .eq('author_id', publication.owner_id)
    .eq('slug', params.slug)
    .single()

  if (!stack) return { title: 'Not Found' }

  return generateSEO({
    title: `${stack.title} - ${publication.name}`,
    description: stack.description || `A stack by ${publication.name}`,
    image: stack.cover_image_url || undefined,
    url: `/${publication.slug}/stack/${params.slug}`,
  })
}

export default async function StackHubPage({ params }: Props) {
  const supabase = createClient()

  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, owner_id, logo_url, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  if (!publication || !publication.is_active) notFound()

  const { data: stack } = await supabase
    .from('series')
    .select('id, title, slug, description, cover_image_url, created_at')
    .eq('author_id', publication.owner_id)
    .eq('slug', params.slug)
    .single()

  if (!stack) notFound()

  const { data: posts } = await supabase
    .from('posts')
    .select('id, title, slug, excerpt, published_at, series_order')
    .eq('series_id', stack.id)
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('series_order', { ascending: true })

  const postsInStack = posts || []

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.ai'

  const itemListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: stack.title,
    itemListOrder: 'http://schema.org/ItemListOrderAscending',
    itemListElement: postsInStack.map((p: any, idx: number) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${baseUrl}/${publication.slug}/${p.slug}`,
      name: p.title,
    })),
  }

  return (
    <>
      <Header />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      <main className="pt-20">
        <div className="px-6 py-12">
          <div className="max-w-4xl mx-auto">
            <Link
              href={`/${publication.slug}`}
              className="inline-flex items-center gap-2 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] mb-6 transition-colors"
            >
              <ArrowLeft size={16} />
              Back to {publication.name}
            </Link>

            <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-6">
              <div className="flex items-start gap-4">
                {publication.logo_url ? (
                  <img
                    src={publication.logo_url}
                    alt={publication.name}
                    loading="lazy"
                    className="w-12 h-12 rounded-2xl"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-[var(--text-primary)] flex items-center justify-center text-sm font-medium text-[var(--text-inverse)]">
                    {publication.name[0].toUpperCase()}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[var(--text-tertiary)]">Stack</p>
                  <h1 className="font-display text-3xl md:text-4xl text-[var(--text-primary)]">
                    {stack.title}
                  </h1>
                  {stack.description && (
                    <p className="mt-3 text-[var(--text-secondary)]">{stack.description}</p>
                  )}
                </div>
              </div>

              {stack.cover_image_url && (
                <img
                  src={stack.cover_image_url}
                  alt={stack.title}
                  loading="lazy"
                  className="w-full rounded-xl mt-6"
                />
              )}

                <div className="mt-6 grid grid-cols-2 gap-2 max-w-sm">
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)]">Posts</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">{postsInStack.length}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-3">
                    <p className="text-xs text-[var(--text-tertiary)]">Publication</p>
                    <p className="text-sm font-medium text-[var(--text-primary)]">@{publication.slug}</p>
                  </div>
                </div>
              </div>

            <section className="mt-8">
              <h2 className="font-display text-xl mb-4">Posts in this stack</h2>

              {postsInStack.length === 0 ? (
                <p className="text-[var(--text-secondary)] text-center py-12">
                  No published posts yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {postsInStack.map((post, index) => (
                    <Link
                      key={post.id}
                      href={`/${publication.slug}/${post.slug}`}
                      className="block p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                    >
                      <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-2">
                        {typeof post.series_order === 'number' ? `Part ${post.series_order}` : `Part ${index + 1}`}
                      </p>
                      <p className="text-lg font-medium text-[var(--text-primary)]">{post.title}</p>
                      {post.excerpt && (
                        <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-2">{post.excerpt}</p>
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </>
  )
}
