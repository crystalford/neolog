'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Plus, Search, PenLine, Calendar, Layers, Hash,
  Clock, ArrowRight, Trash2, Edit2
} from 'lucide-react'

interface DraftWithProgress {
  id: string
  title: string | null
  slug: string
  content: string | null
  updated_at: string
  created_at: string
  word_count: number
  progress_percent: number
  progress_label: string
  scheduled_at: string | null
}

interface Stack {
  id: string
  title: string
  slug: string
  description: string | null
  post_count: number
}

function getWordCount(content: string | null): number {
  if (!content) return 0
  return content.split(/\s+/).filter(Boolean).length
}

function getProgressFromWordCount(wordCount: number): { percent: number; label: string } {
  if (wordCount < 100) return { percent: 10, label: 'Just started' }
  if (wordCount < 300) return { percent: 20, label: 'Getting going' }
  if (wordCount < 600) return { percent: 40, label: 'Taking shape' }
  if (wordCount < 1000) return { percent: 60, label: 'Solid draft' }
  if (wordCount < 1500) return { percent: 80, label: 'Nearly there' }
  return { percent: 100, label: 'Ready to publish?' }
}

export default function WorkspacePage() {
  const [drafts, setDrafts] = useState<DraftWithProgress[]>([])
  const [scheduled, setScheduled] = useState<DraftWithProgress[]>([])
  const [stacks, setStacks] = useState<Stack[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'drafts' | 'scheduled' | 'stacks' | 'topics'>('drafts')
  const [search, setSearch] = useState('')

  const router = useRouter()
  const supabase = createClient()
  const { capabilities } = useUserMaturity(userId)

  useEffect(() => {
    loadWorkspace()
  }, [])

  const loadWorkspace = async () => {
    const { data: { session } } = await supabase.auth.getSession()

    if (!session) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)

    // Load drafts
    const { data: postsData } = await supabase
      .from('posts')
      .select('id, title, slug, content, updated_at, created_at, status, scheduled_at')
      .eq('author_id', session.user.id)
      .in('status', ['draft', 'scheduled'])
      .order('updated_at', { ascending: false })

    const draftsList: DraftWithProgress[] = []
    const scheduledList: DraftWithProgress[] = []

      ; (postsData || []).forEach(post => {
        const wordCount = getWordCount(post.content)
        const progress = getProgressFromWordCount(wordCount)
        const item: DraftWithProgress = {
          id: post.id,
          title: post.title,
          slug: post.slug,
          content: post.content,
          updated_at: post.updated_at,
          created_at: post.created_at,
          word_count: wordCount,
          progress_percent: progress.percent,
          progress_label: progress.label,
          scheduled_at: post.scheduled_at,
        }

        if (post.status === 'scheduled') {
          scheduledList.push(item)
        } else {
          draftsList.push(item)
        }
      })

    setDrafts(draftsList)
    setScheduled(scheduledList)

    // Load stacks (series)
    const { data: stacksData } = await supabase
      .from('series')
      .select(`
        id,
        title,
        slug,
        description,
        series_posts(count)
      `)
      .eq('author_id', session.user.id)
      .order('created_at', { ascending: false })

    setStacks((stacksData || []).map(s => ({
      id: s.id,
      title: s.title,
      slug: s.slug,
      description: s.description,
      post_count: s.series_posts?.[0]?.count || 0,
    })))

    setLoading(false)
  }

  const handleDeleteDraft = async (id: string) => {
    if (!confirm('Delete this draft?')) return

    await supabase.from('posts').delete().eq('id', id)
    setDrafts(prev => prev.filter(d => d.id !== id))
    setScheduled(prev => prev.filter(d => d.id !== id))
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const formatScheduledTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffHours < 24) return `Today at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    if (diffDays === 1) return `Tomorrow at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
  }

  // Filter drafts by search
  const filteredDrafts = drafts.filter(d => {
    if (!search) return true
    const q = search.toLowerCase()
    return (d.title || '').toLowerCase().includes(q)
  })

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-12 skeleton rounded-2xl" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 skeleton rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 md:py-12">
      <div className="flex items-start justify-between mb-8">
        <div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', letterSpacing: '0.12em', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
            PUBLISH
          </p>
          <h1 style={{ fontSize: '26px', fontWeight: 300, letterSpacing: '-0.03em', color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
            Workspace
          </h1>
          <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
            Active projects. Where creation happens.
          </p>
        </div>
        <Link href="/write" className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <Plus size={18} />
          New Draft
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-2 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-8 w-fit">
        {[
          { id: 'drafts', label: 'Drafts', count: drafts.length },
          { id: 'scheduled', label: 'Scheduled', count: scheduled.length },
          ...(capabilities.showStacks ? [{ id: 'stacks', label: 'Stacks', count: stacks.length }] : []),
          { id: 'topics', label: 'Topics', count: null },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2 rounded-xl text-base font-medium transition-colors ${activeTab === tab.id
                ? 'bg-[var(--bg-primary)]/90 text-[var(--text-primary)] shadow'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-2 text-xs text-[var(--text-tertiary)] font-normal">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Drafts Tab */}
      {activeTab === 'drafts' && (
        <>
          {/* Search */}
          <div className="relative mb-8">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search drafts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search drafts"
              className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/80 text-base focus:outline-none focus:border-[var(--accent)] shadow"
            />
          </div>

          {filteredDrafts.length > 0 ? (
            <div className="space-y-4">
              {filteredDrafts.map((draft, i) => (
                <div
                  key={draft.id}
                  className={`group p-5 rounded-2xl border transition-colors shadow ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : 'bg-[var(--bg-primary)]/90'} hover:border-[var(--accent)] border-[var(--border-light)]`}
                >
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] truncate">
                        {draft.title || 'Untitled Draft'}
                      </h3>
                      <div className="flex items-center gap-4 mt-2 text-base text-[var(--text-secondary)]">
                        <span>{draft.word_count.toLocaleString()} words</span>
                        <span>-</span>
                        <span className="flex items-center gap-2">
                          <Clock size={14} />
                          {formatRelativeTime(draft.updated_at)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-4 max-w-xs">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[var(--text-tertiary)]">{draft.progress_label}</span>
                        </div>
                        <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] rounded-full transition-all"
                            style={{ width: `${draft.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/write?edit=${draft.id}`}
                        className="btn btn-primary text-base px-5 py-3 font-semibold shadow focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        Continue
                        <ArrowRight size={16} />
                      </Link>
                      <button
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-3 rounded-xl text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] opacity-0 group-hover:opacity-100 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--error)]"
                        title="Delete draft"
                        aria-label={`Delete ${draft.title || 'draft'}`}
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-16 text-center shadow">
              <span className="text-4xl mx-auto mb-4 opacity-70 block text-center">✍️</span>
              <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                {search ? 'No matches found' : 'No drafts yet'}
              </h2>
              <p className="text-base text-[var(--text-secondary)] mb-6">
                {search
                  ? 'Try a different keyword or clear filters.'
                  : 'Turn a capture into a draft or start fresh.'}
              </p>
              {!search && (
                <div className="flex gap-4 justify-center">
                  <Link href="/dashboard/captures" className="btn btn-secondary text-base px-5 py-3 font-medium">
                    Browse Captures
                  </Link>
                  <Link href="/write" className="btn btn-primary text-base px-5 py-3 font-semibold">
                    <PenLine size={18} />
                    New Draft
                  </Link>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Scheduled Tab */}
      {activeTab === 'scheduled' && (
        <>
          {scheduled.length > 0 ? (
            <div className="space-y-4">
              {scheduled.map((item, i) => (
                <div
                  key={item.id}
                  className={`group p-5 rounded-2xl border transition-colors shadow ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : 'bg-[var(--bg-primary)]/90'} hover:border-[var(--accent)] border-[var(--border-light)]`}
                >
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--warning)]/10">
                        <Calendar size={20} className="text-[var(--warning)]" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                          {item.title || 'Untitled'}
                        </h3>
                        <p className="text-base text-[var(--text-secondary)]">
                          Publishes {formatScheduledTime(item.scheduled_at!)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/write?edit=${item.id}`}
                        className="btn btn-secondary text-base px-5 py-3 font-medium shadow focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      >
                        <Edit2 size={16} />
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-16 text-center shadow">
              <span className="text-4xl mx-auto mb-4 opacity-70 block text-center">📅</span>
              <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                No scheduled posts yet
              </h2>
              <p className="text-base text-[var(--text-secondary)] mb-6">
                Schedule a draft to publish it automatically.
              </p>
            </div>
          )}
        </>
      )}

      {/* Stacks Tab */}
      {activeTab === 'stacks' && capabilities.showStacks && (
        <>
          {stacks.length > 0 ? (
            <div className="space-y-4">
              {stacks.map((stack, i) => (
                <Link
                  key={stack.id}
                  href={`/series/${stack.slug}`}
                  className={`group block p-5 rounded-2xl border transition-colors shadow ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : 'bg-[var(--bg-primary)]/90'} hover:border-[var(--accent)] border-[var(--border-light)]`}
                >
                  <div className="flex items-center justify-between gap-6">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--bg-secondary)]">
                        <Layers size={20} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                          {stack.title}
                        </h3>
                        <p className="text-base text-[var(--text-secondary)]">
                          {stack.post_count} post{stack.post_count !== 1 ? 's' : ''}
                          {stack.description && ` - ${stack.description.slice(0, 50)}...`}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={18} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
              <Link
                href="/series/new"
                className="block p-5 rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 hover:border-[var(--accent)] transition-colors text-center shadow"
              >
                <Plus size={22} className="mx-auto text-[var(--text-tertiary)] mb-2" />
                <p className="text-base text-[var(--text-secondary)]">Create new stack</p>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-primary)]/70 p-16 text-center shadow">
              <span className="text-4xl mx-auto mb-4 opacity-70 block text-center">📚</span>
              <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
                No stacks yet
              </h2>
              <p className="text-base text-[var(--text-secondary)] mb-6">
                Group related posts into a stack to create a series.
              </p>
              <Link href="/series/new" className="btn btn-primary text-lg px-6 py-3 font-semibold">
                <Layers size={18} />
                Create Stack
              </Link>
            </div>
          )}
        </>
      )}

      {/* Topics Tab */}
      {activeTab === 'topics' && (
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)]/80 p-12 text-center shadow">
          <span className="text-4xl mx-auto mb-4 opacity-70 block text-center">🏷️</span>
          <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
            Manage Topics
          </h2>
          <p className="text-base text-[var(--text-secondary)] mb-6">
            Organize your work with tags and topics.
          </p>
          <Link href="/topics" className="btn btn-secondary text-lg px-6 py-3 font-medium">
            <Hash size={18} />
            Go to Topics
          </Link>
        </div>
      )}
    </main>
  )
}

