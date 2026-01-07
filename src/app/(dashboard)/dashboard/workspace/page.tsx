'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Plus, Search, PenLine, Calendar, Layers, Hash,
  Clock, ArrowRight, MoreHorizontal, Trash2, Edit2, Eye
} from 'lucide-react'
import type { Post } from '@/types/database'

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
  const { capabilities, publishedCount } = useUserMaturity(userId)

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

    ;(postsData || []).forEach(post => {
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
      <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-12 skeleton rounded-xl" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 skeleton rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto animate-fade-up">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl text-[var(--text-primary)]">Workspace</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Active projects. Where creation happens.
          </p>
        </div>
        <Link href="/write" className="btn btn-primary btn-sm">
          <Plus size={16} />
          New Draft
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-6 w-fit">
        {[
          { id: 'drafts', label: 'Drafts', count: drafts.length },
          { id: 'scheduled', label: 'Scheduled', count: scheduled.length },
          ...(capabilities.showStacks ? [{ id: 'stacks', label: 'Stacks', count: stacks.length }] : []),
          { id: 'topics', label: 'Topics', count: null },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
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
          <div className="relative mb-6">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search drafts..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] text-sm focus:outline-none focus:border-[var(--border-medium)]"
            />
          </div>

          {filteredDrafts.length > 0 ? (
            <div className="space-y-3">
              {filteredDrafts.map((draft) => (
                <div
                  key={draft.id}
                  className="group p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-medium text-[var(--text-primary)] truncate">
                        {draft.title || 'Untitled Draft'}
                      </h3>
                      <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-secondary)]">
                        <span>{draft.word_count.toLocaleString()} words</span>
                        <span>·</span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatRelativeTime(draft.updated_at)}
                        </span>
                      </div>

                      {/* Progress bar */}
                      <div className="mt-3 max-w-xs">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-[var(--text-tertiary)]">{draft.progress_label}</span>
                        </div>
                        <div className="h-1.5 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-[var(--accent)] rounded-full transition-all"
                            style={{ width: `${draft.progress_percent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/write?edit=${draft.id}`}
                        className="btn btn-primary btn-sm"
                      >
                        Continue
                        <ArrowRight size={14} />
                      </Link>
                      <button
                        onClick={() => handleDeleteDraft(draft.id)}
                        className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--error)] hover:bg-[var(--bg-secondary)] opacity-0 group-hover:opacity-100 transition-all"
                        title="Delete draft"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-12 text-center">
              <PenLine size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
              <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
                {search ? 'No matches found' : 'No drafts yet'}
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                {search 
                  ? 'Try a different search term.'
                  : 'Turn a capture into something or start fresh.'}
              </p>
              {!search && (
                <div className="flex gap-3 justify-center">
                  <Link href="/dashboard/captures" className="btn btn-secondary">
                    Browse Captures
                  </Link>
                  <Link href="/write" className="btn btn-primary">
                    <PenLine size={16} />
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
            <div className="space-y-3">
              {scheduled.map((item) => (
                <div
                  key={item.id}
                  className="group p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--warning)]/10">
                        <Calendar size={18} className="text-[var(--warning)]" />
                      </span>
                      <div>
                        <h3 className="text-base font-medium text-[var(--text-primary)]">
                          {item.title || 'Untitled'}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          Publishes {formatScheduledTime(item.scheduled_at!)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/write?edit=${item.id}`}
                        className="btn btn-secondary btn-sm"
                      >
                        <Edit2 size={14} />
                        Edit
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-12 text-center">
              <Calendar size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
              <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
                Nothing scheduled
              </h2>
              <p className="text-sm text-[var(--text-secondary)]">
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
            <div className="space-y-3">
              {stacks.map((stack) => (
                <Link
                  key={stack.id}
                  href={`/series/${stack.slug}`}
                  className="group block p-4 rounded-xl border border-[var(--border-light)] bg-[var(--bg-primary)] hover:border-[var(--border-medium)] transition-colors"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--bg-secondary)]">
                        <Layers size={18} className="text-[var(--text-secondary)]" />
                      </span>
                      <div>
                        <h3 className="text-base font-medium text-[var(--text-primary)]">
                          {stack.title}
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                          {stack.post_count} post{stack.post_count !== 1 ? 's' : ''}
                          {stack.description && ` · ${stack.description.slice(0, 50)}...`}
                        </p>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
              ))}
              <Link
                href="/series/new"
                className="block p-4 rounded-xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] hover:border-[var(--border-medium)] transition-colors text-center"
              >
                <Plus size={20} className="mx-auto text-[var(--text-tertiary)] mb-2" />
                <p className="text-sm text-[var(--text-secondary)]">Create new stack</p>
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-[var(--bg-secondary)] p-12 text-center">
              <Layers size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
              <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
                No stacks yet
              </h2>
              <p className="text-sm text-[var(--text-secondary)] mb-4">
                Group related posts into a stack to create a series.
              </p>
              <Link href="/series/new" className="btn btn-primary">
                <Layers size={16} />
                Create Stack
              </Link>
            </div>
          )}
        </>
      )}

      {/* Topics Tab */}
      {activeTab === 'topics' && (
        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-8 text-center">
          <Hash size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
            Manage Topics
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4">
            Organize your work with tags and topics.
          </p>
          <Link href="/topics" className="btn btn-secondary">
            <Hash size={16} />
            Go to Topics
          </Link>
        </div>
      )}
    </main>
  )
}
