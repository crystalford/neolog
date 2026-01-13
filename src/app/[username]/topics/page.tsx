import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Hash, ArrowLeft } from 'lucide-react'

interface Props {
  params: { username: string }
}

export default async function TopicsPage({ params }: Props) {
  const supabase = createClient()

  const { data: publication } = await supabase
    .from('publications')
    .select('id, name, slug, owner_id, is_active')
    .eq('slug', params.username)
    .maybeSingle()

  if (!publication || !publication.is_active) notFound()

  const { data: tagRows } = await supabase
    .from('post_tags')
    .select('tag:tags(id, name, slug, color), post:posts(id, title, slug, published_at, excerpt, author_id, publication_id, status)')

  const { data: introRows } = await supabase
    .from('author_topic_intros')
    .select('tag_id, intro')
    .eq('creator_id', publication.owner_id)

  const introMap = new Map<string, string>()
  ;(introRows || []).forEach((row: any) => {
    introMap.set(row.tag_id, row.intro || '')
  })

  const tagMap = new Map<string, { id: string; name: string; slug: string; color: string; posts: any[] }>()

  ;(tagRows || []).forEach((row: any) => {
    const tag = row.tag
    const post = row.post
    if (!tag || !post) return
    if (post.status !== 'published' || post.publication_id !== publication.id) return
    const existing = tagMap.get(tag.id)
    if (existing) {
      existing.posts.push(post)
    } else {
      tagMap.set(tag.id, { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color, posts: [post] })
    }
  })

  const topics = Array.from(tagMap.values())
    .map((topic) => {
      const sorted = topic.posts
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      const yearMap = new Map<string, number>()
      sorted.forEach((post) => {
        const year = post.published_at ? new Date(post.published_at).getFullYear().toString() : 'Unknown'
        yearMap.set(year, (yearMap.get(year) || 0) + 1)
      })
      const years = Array.from(yearMap.entries())
        .sort((a, b) => Number(b[0]) - Number(a[0]))
        .slice(0, 4)
      return {
        ...topic,
        posts: sorted.slice(0, 3),
        featured: sorted[0],
        count: topic.posts.length,
        years,
        intro: introMap.get(topic.id) || '',
      }
    })
    .sort((a, b) => b.count - a.count)

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Link
            href={`/${publication.slug}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mb-6 pt-6"
          >
            <ArrowLeft size={14} />
            Back to {publication.name}
          </Link>

          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Hash size={22} className="text-[var(--text-tertiary)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Topics</h1>
              <p className="text-[var(--text-secondary)]">
                {topics.length} topic{topics.length !== 1 ? 's' : ''} by {publication.name}
              </p>
            </div>
          </div>

          {topics.length === 0 ? (
            <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Hash size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
              <h2 className="font-display text-xl mb-2">No topics yet</h2>
              <p className="text-[var(--text-secondary)]">
                Add tags to posts to build this topic map.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">
              {topics.map((topic) => (
                <div key={topic.id} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <Link
                      href={`/tag/${topic.slug}`}
                      className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      #{topic.name}
                    </Link>
                    <span className="text-xs text-[var(--text-tertiary)]">
                      {topic.count} post{topic.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                  {topic.intro && (
                    <p className="text-sm text-[var(--text-secondary)] mb-4">
                      {topic.intro}
                    </p>
                  )}
                  {topic.featured?.excerpt && (
                    <p className="text-sm text-[var(--text-tertiary)] mb-4 line-clamp-3">
                      {topic.featured.excerpt}
                    </p>
                  )}
                  {topic.years.length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--text-tertiary)] mb-4">
                      {topic.years.map(([year, count]) => (
                        <span key={year} className="px-2 py-1 rounded-full border border-[var(--border-light)]">
                          {year}: {count}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="space-y-3">
                    {topic.posts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/${publication.slug}/${post.slug}`}
                        className="block rounded-xl border border-[var(--border-light)] px-4 py-3 hover:border-[var(--border-medium)] transition-colors"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-[var(--text-primary)]">{post.title}</p>
                          {post.id === topic.featured?.id && (
                            <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
                              Featured
                            </span>
                          )}
                        </div>
                        {post.excerpt && (
                          <p className="text-xs text-[var(--text-tertiary)] mt-1 line-clamp-2">
                            {post.excerpt}
                          </p>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
