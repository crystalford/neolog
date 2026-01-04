'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type TopicRow = {
  id: string
  name: string
  slug: string
  color: string
  count: number
  intro: string
}

export default function TopicsDashboardPage() {
  const [topics, setTopics] = useState<TopicRow[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadTopics()
  }, [])

  const loadTopics = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const { data: posts } = await supabase
      .from('posts')
      .select('id')
      .eq('author_id', session.user.id)
      .eq('status', 'published')

    const postIds = (posts || []).map((post) => post.id)
    if (postIds.length === 0) {
      setTopics([])
      setLoading(false)
      return
    }

    const { data: tagRows } = await supabase
      .from('post_tags')
      .select('tag:tags(id, name, slug, color), post_id')
      .in('post_id', postIds)

    const { data: introRows } = await supabase
      .from('author_topic_intros')
      .select('tag_id, intro')
      .eq('creator_id', session.user.id)

    const introMap = new Map<string, string>()
    ;(introRows || []).forEach((row: any) => {
      introMap.set(row.tag_id, row.intro || '')
    })

    const topicMap = new Map<string, TopicRow>()
    ;(tagRows || []).forEach((row: any) => {
      const tag = row.tag
      if (!tag) return
      const existing = topicMap.get(tag.id)
      if (existing) {
        existing.count += 1
      } else {
        topicMap.set(tag.id, {
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          color: tag.color,
          count: 1,
          intro: introMap.get(tag.id) || '',
        })
      }
    })

    const sorted = Array.from(topicMap.values()).sort((a, b) => b.count - a.count)
    setTopics(sorted)
    setLoading(false)
  }

  const saveIntro = async (topic: TopicRow) => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    setSaving(topic.id)
    await supabase
      .from('author_topic_intros')
      .upsert({
        creator_id: session.user.id,
        tag_id: topic.id,
        intro: topic.intro.trim() || null,
      }, { onConflict: 'creator_id,tag_id' })
    setSaving(null)
  }

  if (loading) {
    return (
      <main className="px-6 lg:px-12 py-12 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-4 w-32 skeleton rounded" />
          <div className="mt-8 space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 skeleton rounded-md" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-12 py-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Topics</p>
        <h1 className="font-display text-3xl text-[var(--text-primary)]">Topic intros</h1>
        <p className="text-sm text-[var(--text-secondary)] mt-2">
          Add short context to each topic page.
        </p>
      </div>

      {topics.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <h2 className="font-display text-xl mb-2">No topics yet</h2>
          <p className="text-[var(--text-secondary)]">Add tags to your posts to see topics here.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {topics.map((topic) => (
            <div key={topic.id} className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">#{topic.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{topic.count} posts</p>
                </div>
                <button
                  onClick={() => saveIntro(topic)}
                  className="btn btn-secondary btn-sm"
                  disabled={saving === topic.id}
                >
                  {saving === topic.id ? 'Saving...' : 'Save intro'}
                </button>
              </div>
              <textarea
                value={topic.intro}
                onChange={(event) => {
                  const next = event.target.value
                  setTopics((prev) =>
                    prev.map((item) => (item.id === topic.id ? { ...item, intro: next } : item))
                  )
                }}
                placeholder="Write a short intro for this topic..."
                className="input min-h-[120px]"
              />
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
