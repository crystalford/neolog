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

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, username, display_name')
    .eq('username', params.username)
    .single()

  if (!profile) notFound()

  const { data: tagRows } = await supabase
    .from('post_tags')
    .select('tag:tags(id, name, slug, color), post:posts(id, title, slug, published_at, excerpt, author_id, status)')

  const tagMap = new Map<string, { id: string; name: string; slug: string; color: string; posts: any[] }>()

  ;(tagRows || []).forEach((row: any) => {
    const tag = row.tag
    const post = row.post
    if (!tag || !post) return
    if (post.author_id !== profile.id || post.status !== 'published') return
    const existing = tagMap.get(tag.id)
    if (existing) {
      existing.posts.push(post)
    } else {
      tagMap.set(tag.id, { id: tag.id, name: tag.name, slug: tag.slug, color: tag.color, posts: [post] })
    }
  })

  const topics = Array.from(tagMap.values())
    .map((topic) => ({
      ...topic,
      posts: topic.posts
        .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
        .slice(0, 3),
      count: topic.posts.length,
    }))
    .sort((a, b) => b.count - a.count)

  return (
    <>
      <Header />
      <main className="pt-16 pb-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-12">
          <Link
            href={`/${profile.username}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] mb-6 pt-6"
          >
            <ArrowLeft size={14} />
            Back to {profile.display_name || profile.username}
          </Link>

          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--bg-secondary)] border border-[var(--border-light)]">
              <Hash size={22} className="text-[var(--text-tertiary)]" />
            </div>
            <div>
              <h1 className="font-display text-3xl">Topics</h1>
              <p className="text-[var(--text-secondary)]">
                {topics.length} topic{topics.length !== 1 ? 's' : ''} by {profile.display_name || profile.username}
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
                  <div className="space-y-3">
                    {topic.posts.map((post) => (
                      <Link
                        key={post.id}
                        href={`/${profile.username}/${post.slug}`}
                        className="block rounded-xl border border-[var(--border-light)] px-4 py-3 hover:border-[var(--border-medium)] transition-colors"
                      >
                        <p className="text-sm font-medium text-[var(--text-primary)]">{post.title}</p>
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
