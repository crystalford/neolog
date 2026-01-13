import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { Header } from '@/components/Header'
import { PostCard } from '@/components/PostCard'
import { Globe } from 'lucide-react'

export default async function PublicationPublicPage({
  params,
}: {
  params: { slug: string }
}) {
  const supabase = createClient()
  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, description, logo_url, website_url, is_active')
    .eq('slug', params.slug)
    .maybeSingle()

  if (!publication || !publication.is_active) {
    notFound()
  }

  const { data: posts } = await supabase
    .from('posts')
    .select('*, author:profiles(id, username, display_name, avatar_url)')
    .eq('publication_id', publication.id)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(12)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://neolog.com'
  const fediverseHandle = `@${publication.slug}@${new URL(appUrl).hostname}`

  return (
    <>
      <Header />
      <main className="pt-14 pb-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-12">
          <div className="pt-6 pb-6 border-b border-[var(--border-light)]">
            <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]/40 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {publication.logo_url ? (
                  <img
                    src={publication.logo_url}
                    alt={publication.name}
                    className="w-16 h-16 rounded-2xl object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center text-xl font-semibold text-white">
                    {publication.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <h1 className="font-display text-3xl">{publication.name}</h1>
                  <p className="text-[var(--text-secondary)]">@{publication.slug}</p>
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-light)] bg-[var(--bg-primary)] px-3 py-1.5 text-xs text-[var(--text-secondary)]">
                  <Globe size={14} />
                  <span className="font-medium text-[var(--text-primary)]">Fediverse</span>
                  <span className="text-[var(--text-tertiary)]">{fediverseHandle}</span>
                </div>
              </div>
              {publication.description && (
                <p className="mt-4 text-[var(--text-secondary)] max-w-2xl">
                  {publication.description}
                </p>
              )}
              {publication.website_url && (
                <a
                  href={publication.website_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block text-sm text-[var(--accent)] hover:underline"
                >
                  {publication.website_url.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>
          </div>

          <section className="mt-6">
            <h2 className="font-display text-xl mb-4">Recent posts</h2>
            {posts && posts.length > 0 ? (
              <div className="space-y-6">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post as any} />
                ))}
              </div>
            ) : (
              <p className="text-[var(--text-secondary)] text-center py-12">
                No published posts yet.
              </p>
            )}
          </section>
        </div>
      </main>
    </>
  )
}
