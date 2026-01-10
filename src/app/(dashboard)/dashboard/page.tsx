'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import { analyzeSEO } from '@/lib/seo-scoring'
import {
  PenLine, Zap, Send, ArrowRight, Archive, Clock,
  Eye, MessageCircle, X
} from 'lucide-react'
import type { Profile } from '@/types/database'

interface DraftWithProgress {
  id: string
  title: string | null
  content: string | null
  updated_at: string
  word_count: number
  progress_percent: number
  progress_label: string
}

interface RecentCapture {
  id: string
  title: string | null
  type: string
  source_platform: string | null
  created_at: string
}

interface RecentPublished {
  id: string
  title: string
  slug: string
  published_at: string
  views: number
  reactions: number
  seoScore: number
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

export default function DashboardHomePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  // Data states
  const [focusDraft, setFocusDraft] = useState<DraftWithProgress | null>(null)
  const [recentCaptures, setRecentCaptures] = useState<RecentCapture[]>([])
  const [recentPublished, setRecentPublished] = useState<RecentPublished[]>([])
  const [thisWeekStats, setThisWeekStats] = useState({
    captures: 0,
    drafts: 0,
    published: 0,
    views: 0,
  })
  const [statsVisible, setStatsVisible] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()
  const { captureCount, draftCount, publishedCount } = useUserMaturity(userId)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)

    // Load profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
    
    setProfile(profileData)

    // Load most recent draft (Today's Focus)
    const { data: drafts } = await supabase
      .from('posts')
      .select('id, title, content, updated_at')
      .eq('author_id', session.user.id)
      .eq('status', 'draft')
      .order('updated_at', { ascending: false })
      .limit(1)

    if (drafts && drafts.length > 0) {
      const draft = drafts[0]
      const wordCount = getWordCount(draft.content)
      const progress = getProgressFromWordCount(wordCount)
      setFocusDraft({
        id: draft.id,
        title: draft.title,
        content: draft.content,
        updated_at: draft.updated_at,
        word_count: wordCount,
        progress_percent: progress.percent,
        progress_label: progress.label,
      })
    }

    // Load recent captures
    const { data: captures } = await supabase
      .from('vault_assets')
      .select('id, title, type, source_platform, created_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(3)

    setRecentCaptures(captures || [])

    // Load recent published
    const { data: published } = await supabase
      .from('posts')
      .select('id, title, slug, published_at, subtitle, content')
      .eq('author_id', session.user.id)
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(3)

    if (published) {
      // Get view counts
      const postIds = published.map(p => p.id)
      const { data: viewData } = await supabase
        .from('post_views')
        .select('post_id')
        .in('post_id', postIds)
      
      const { data: reactionData } = await supabase
        .from('reactions')
        .select('post_id')
        .in('post_id', postIds)

      const viewCounts: Record<string, number> = {}
      const reactionCounts: Record<string, number> = {}
      
      viewData?.forEach(v => {
        viewCounts[v.post_id] = (viewCounts[v.post_id] || 0) + 1
      })
      reactionData?.forEach(r => {
        reactionCounts[r.post_id] = (reactionCounts[r.post_id] || 0) + 1
      })

      setRecentPublished(published.map(p => {
        // Calculate SEO score
        const seoAnalysis = analyzeSEO(
          p.title || '',
          p.subtitle || '',
          p.content || ''
        )

        return {
          id: p.id,
          title: p.title,
          slug: p.slug,
          published_at: p.published_at,
          views: viewCounts[p.id] || 0,
          reactions: reactionCounts[p.id] || 0,
          seoScore: seoAnalysis.score,
        }
      }))
    }

    // Calculate this week stats
    const oneWeekAgo = new Date()
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
    const weekIso = oneWeekAgo.toISOString()

    const [weekCaptures, weekDrafts, weekPublished, weekViews] = await Promise.all([
      supabase
        .from('vault_assets')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .gte('created_at', weekIso),
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', session.user.id)
        .eq('status', 'draft')
        .gte('created_at', weekIso),
      supabase
        .from('posts')
        .select('*', { count: 'exact', head: true })
        .eq('author_id', session.user.id)
        .eq('status', 'published')
        .gte('published_at', weekIso),
      supabase
        .from('post_views')
        .select('*', { count: 'exact', head: true })
        .in('post_id', (published || []).map(p => p.id))
        .gte('viewed_at', weekIso),
    ])

    setThisWeekStats({
      captures: weekCaptures.count || 0,
      drafts: weekDrafts.count || 0,
      published: weekPublished.count || 0,
      views: weekViews.count || 0,
    })

    setLoading(false)
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

  if (loading) {
    return (
      <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 skeleton rounded" />
          <div className="h-32 skeleton rounded-xl" />
          <div className="grid md:grid-cols-3 gap-6">
            <div className="h-48 skeleton rounded-xl" />
            <div className="h-48 skeleton rounded-xl" />
            <div className="h-48 skeleton rounded-xl" />
          </div>
        </div>
      </main>
    )
  }

  // Determine lifecycle stage for contextual CTAs
  const hasCaptures = captureCount > 0
  const hasDrafts = draftCount > 0
  const hasPublished = publishedCount > 0

  return (
    <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
      {/* Welcome */}
      <div className="mb-10">
        <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">
          Welcome back{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}
        </h1>
        <p className="text-base text-[var(--text-secondary)] mt-2">
          {!hasCaptures && "Start by capturing your first idea."}
          {hasCaptures && !hasDrafts && "You have ideas saved. Turn one into a draft."}
          {hasDrafts && !hasPublished && "You're working on something. Let's finish it."}
          {hasPublished && "Keep creating. Your work is reaching people."}
        </p>
      </div>

      {/* Today's Focus or lifecycle CTA */}
      <section className="mb-10">
        {focusDraft ? (
          <div className="rounded-3xl border border-[var(--border-light)] bg-white/80 backdrop-blur p-8 shadow-lg">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
              Today's Focus
            </p>
            <h2 className="font-display text-2xl font-semibold text-[var(--text-primary)] mb-2">
              {focusDraft.title || 'Untitled Draft'}
            </h2>
            <div className="flex items-center gap-4 text-base text-[var(--text-secondary)] mb-4">
              <span>{focusDraft.word_count.toLocaleString()} words</span>
              <span>·</span>
              <span>Updated {formatRelativeTime(focusDraft.updated_at)}</span>
            </div>
            {/* Progress bar */}
            <div className="mb-6">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[var(--text-tertiary)]">{focusDraft.progress_label}</span>
                <span className="text-[var(--text-tertiary)]">{focusDraft.progress_percent}%</span>
              </div>
              <div className="h-2 bg-[var(--bg-tertiary)] rounded-full overflow-hidden">
                <div 
                  className="h-full bg-[var(--accent)] rounded-full transition-all"
                  style={{ width: `${focusDraft.progress_percent}%` }}
                />
              </div>
            </div>
            <Link
              href={`/write?edit=${focusDraft.id}`}
              className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              Continue Writing
              <ArrowRight size={18} />
            </Link>
          </div>
        ) : hasCaptures ? (
          <div className="rounded-3xl border border-dashed border-[var(--border-light)] bg-white/70 backdrop-blur p-8 shadow">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
              Ready to create?
            </p>
            <h2 className="font-display text-2xl font-semibold text-[var(--text-primary)] mb-2">
              Turn a capture into something
            </h2>
            <p className="text-base text-[var(--text-secondary)] mb-6">
              You have {captureCount} idea{captureCount !== 1 ? 's' : ''} saved. Pick one and start writing.
            </p>
            <div className="flex gap-4">
              <Link href="/dashboard/captures" className="btn btn-secondary text-base px-5 py-3 font-medium">
                Browse Captures
              </Link>
              <Link href="/write" className="btn btn-primary text-base px-5 py-3 font-semibold">
                <PenLine size={18} />
                New Post
              </Link>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-[var(--border-light)] bg-white/70 backdrop-blur p-8 shadow">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">
              Get started
            </p>
            <h2 className="font-display text-2xl font-semibold text-[var(--text-primary)] mb-2">
              Capture your first idea
            </h2>
            <p className="text-base text-[var(--text-secondary)] mb-6">
              Save a link, quote, screenshot, or thought. Everything starts somewhere.
            </p>
            <Link href="/dashboard/captures" className="btn btn-primary text-base px-5 py-3 font-semibold">
              <Zap size={18} />
              Add Capture
            </Link>
          </div>
        )}
      </section>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Quick Actions */}
        <div className="space-y-4">
          <h3 className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] font-semibold">
            Quick Actions
          </h3>
          <div className="space-y-3">
            <Link
              href="/write"
              className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--bg-secondary)]">
                <PenLine size={20} className="text-[var(--text-secondary)]" />
              </span>
              <span className="text-base font-semibold text-[var(--text-primary)]">New Post</span>
            </Link>
            <Link
              href="/dashboard/captures"
              className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--bg-secondary)]">
                <Zap size={20} className="text-[var(--text-secondary)]" />
              </span>
              <span className="text-base font-semibold text-[var(--text-primary)]">Capture</span>
            </Link>
            {hasDrafts && (
              <Link
                href="/dashboard/workspace"
                className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--accent)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              >
                <span className="flex items-center justify-center w-10 h-10 rounded-lg bg-[var(--bg-secondary)]">
                  <Send size={20} className="text-[var(--text-secondary)]" />
                </span>
                <span className="text-base font-semibold text-[var(--text-primary)]">Publish</span>
              </Link>
            )}
          </div>

          {/* This Week Stats (dismissible, only after first publish) */}
          {hasPublished && statsVisible && (
            <div className="mt-6 p-5 rounded-2xl border border-[var(--border-light)] bg-white/80 shadow">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] font-semibold">
                  This Week
                </h4>
                <button
                  onClick={() => setStatsVisible(false)}
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] focus:outline-none"
                  aria-label="Dismiss"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="space-y-2 text-base">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Published</span>
                  <span className="text-[var(--text-primary)] font-semibold">{thisWeekStats.published}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Drafts</span>
                  <span className="text-[var(--text-primary)] font-semibold">{thisWeekStats.drafts}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--text-secondary)]">Captures</span>
                  <span className="text-[var(--text-primary)] font-semibold">{thisWeekStats.captures}</span>
                </div>
                {thisWeekStats.views > 0 && (
                  <div className="flex items-center justify-between pt-2 border-t border-[var(--border-light)]">
                    <span className="text-[var(--text-secondary)]">Views</span>
                    <span className="text-[var(--text-primary)] font-semibold">{thisWeekStats.views}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Captures */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] font-semibold">
              Recent Captures
            </h3>
            {recentCaptures.length > 0 && (
              <Link 
                href="/dashboard/captures"
                className="text-xs text-[var(--accent)] hover:underline font-medium"
              >
                See all →
              </Link>
            )}
          </div>
          {recentCaptures.length > 0 ? (
            <div className="space-y-3">
              {recentCaptures.map((capture, i) => (
                <Link
                  key={capture.id}
                  href={`/dashboard/captures?id=${capture.id}`}
                  className={`block p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--accent)] transition-colors ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : ''}`}
                >
                  <p className="text-base font-medium text-[var(--text-primary)] truncate">
                    {capture.title || `${capture.type} capture`}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    {capture.type} · {formatRelativeTime(capture.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5 rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 text-center">
              <Archive size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-base text-[var(--text-secondary)]">No captures yet</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Ideas are everywhere
              </p>
            </div>
          )}
        </div>

        {/* Recent Published */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] font-semibold">
              Recent Published
            </h3>
            {recentPublished.length > 0 && (
              <Link 
                href="/dashboard/published"
                className="text-xs text-[var(--accent)] hover:underline font-medium"
              >
                See all →
              </Link>
            )}
          </div>
          {recentPublished.length > 0 ? (
            <div className="space-y-3">
              {recentPublished.map((post, i) => (
                <Link
                  key={post.id}
                  href={`/dashboard/published?id=${post.id}`}
                  className={`block p-4 rounded-2xl border border-[var(--border-light)] bg-white/90 shadow hover:border-[var(--accent)] transition-colors ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-base font-medium text-[var(--text-primary)] truncate flex-1">
                      {post.title}
                    </p>
                    {/* SEO Score Badge */}
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        post.seoScore >= 80
                          ? 'bg-green-100 text-green-700 border border-green-200'
                          : post.seoScore >= 60
                          ? 'bg-yellow-100 text-yellow-700 border border-yellow-200'
                          : 'bg-red-100 text-red-700 border border-red-200'
                      }`}
                      title="SEO Score"
                    >
                      {post.seoScore}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--text-tertiary)] mt-1">
                    <span className="flex items-center gap-1">
                      <Eye size={14} />
                      {post.views}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageCircle size={14} />
                      {post.reactions}
                    </span>
                    <span>{formatRelativeTime(post.published_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5 rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 text-center">
              <Send size={24} className="mx-auto text-[var(--text-tertiary)] mb-2" />
              <p className="text-base text-[var(--text-secondary)]">Nothing published yet</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Your first post awaits
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}

