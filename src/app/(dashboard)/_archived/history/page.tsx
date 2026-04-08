'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { History, Loader2, Check, Clock, Trash2 } from 'lucide-react'

type HistoryPost = {
  post_id: string
  progress: number
  completed: boolean
  time_spent_seconds: number
  last_read_at: string
  title: string
  slug: string
  excerpt: string | null
  cover_image_url: string | null
  reading_time_minutes: number | null
  author_id: string
  author_username: string
  author_display_name: string | null
  author_avatar_url: string | null
}

export default function HistoryPage() {
  const [posts, setPosts] = useState<HistoryPost[]>([])
  const [loading, setLoading] = useState(true)
  
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    loadHistory()
  }, [])

  const loadHistory = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login?redirect=/history')
      return
    }

    const { data } = await supabase
      .rpc('get_reading_history', {
        p_user_id: session.user.id,
        p_limit: 100,
        p_offset: 0,
      })

    if (data) {
      setPosts(data)
    }

    setLoading(false)
  }

  const clearHistory = async () => {
    if (!confirm('Clear all reading history?')) return

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    await supabase
      .from('reading_history')
      .delete()
      .eq('user_id', session.user.id)

    setPosts([])
  }

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    
    const days = Math.floor(diff / 86400000)
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })
  }

  // Group by date
  const groupedPosts = posts.reduce((groups, post) => {
    const date = formatDate(post.last_read_at)
    if (!groups[date]) groups[date] = []
    groups[date].push(post)
    return groups
  }, {} as Record<string, HistoryPost[]>)

  return (
    <main className="px-6 lg:px-12 py-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--accent-soft)] flex items-center justify-center">
                <History size={20} className="text-[var(--accent)]" />
              </div>
              <div>
                <h1 className="font-display text-3xl">Reading History</h1>
                <p className="text-[var(--text-secondary)]">
                  {posts.length > 0 
                    ? `${posts.length} posts read`
                    : 'Your reading history will appear here'
                  }
                </p>
              </div>
            </div>

            {posts.length > 0 && (
              <button
                onClick={clearHistory}
                className="btn btn-secondary btn-sm text-[var(--error)]"
              >
                <Trash2 size={14} />
                Clear
              </button>
            )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={32} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-16 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
          <History size={48} className="mx-auto mb-4 text-[var(--text-tertiary)]" />
          <h2 className="font-display text-xl mb-2">No reading history</h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Posts you read will appear here
          </p>
          <Link href="/explore" className="btn btn-primary">
            Explore Posts
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
              {Object.entries(groupedPosts).map(([date, items]) => (
                <div key={date}>
                  <h2 className="text-sm font-medium text-[var(--text-tertiary)] mb-3">
                    {date}
                  </h2>
                  
                  <div className="space-y-2">
                    {items.map(post => (
                      <Link
                        key={post.post_id}
                        href={`/${post.author_username}/${post.slug}`}
                        className="flex items-center gap-4 p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--border-medium)] transition-colors group"
                      >
                        {/* Cover or progress */}
                        {post.cover_image_url ? (
                          <img 
                            src={post.cover_image_url}
                            alt=""
                            className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-[var(--bg-tertiary)] flex items-center justify-center flex-shrink-0">
                            {post.completed ? (
                              <Check size={24} className="text-[var(--success)]" />
                            ) : (
                              <span className="text-sm font-medium text-[var(--text-tertiary)]">
                                {Math.round(post.progress * 100)}%
                              </span>
                            )}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                            {post.title}
                          </h3>
                          <p className="text-sm text-[var(--text-tertiary)]">
                            {post.author_display_name || post.author_username}
                          </p>
                          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--text-tertiary)]">
                            {post.completed ? (
                              <span className="flex items-center gap-1 text-[var(--success)]">
                                <Check size={12} />
                                Completed
                              </span>
                            ) : (
                              <span>{Math.round(post.progress * 100)}% read</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatTime(post.time_spent_seconds)} spent
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
      )}
    </main>
  )
}


