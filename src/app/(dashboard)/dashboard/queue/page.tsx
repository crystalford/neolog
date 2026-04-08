'use client'

export const runtime = 'edge'


import { useState, useEffect, useCallback } from 'react'
import { Copy, Share2, Check } from 'lucide-react'

type FlatPost = {
  content: string
  type: string
  source_upload_id: string
  source_file_name: string
  source_date: string
}

export default function QueuePage() {
  const [posts, setPosts] = useState<FlatPost[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'opinion' | 'quote'>('all')
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch('/api/generated-posts')
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const handleCopy = (content: string, idx: number) => {
    navigator.clipboard.writeText(content)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const handleShare = (content: string) => {
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(content)}`, '_blank')
  }

  const handleDismiss = (key: string) => {
    setDismissed(prev => new Set(prev).add(key))
  }

  const filtered = posts.filter(p => {
    if (dismissed.has(p.source_upload_id + p.content.slice(0, 40))) return false
    if (filter === 'all') return true
    return p.type === filter
  })

  const opinionCount = posts.filter(p => p.type === 'opinion').length
  const quoteCount = posts.filter(p => p.type === 'quote').length

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-8">
        <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-50 mb-2">Voice</p>
        <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight">Post Queue</h1>
        {!loading && (
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {posts.length} extracted · {opinionCount} take{opinionCount !== 1 ? 's' : ''} · {quoteCount} quote{quoteCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Filter tabs */}
      {!loading && posts.length > 0 && (
        <div className="flex items-center gap-1 mb-8 border-b border-[var(--border-light)] pb-1">
          {(['all', 'opinion', 'quote'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${
                filter === f
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {f === 'all' ? `All (${posts.length})` : f === 'opinion' ? `Takes (${opinionCount})` : `Quotes (${quoteCount})`}
            </button>
          ))}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 skeleton rounded-xl" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && posts.length === 0 && (
        <div className="py-24 text-center border border-dashed border-[var(--border-light)] rounded-xl">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-40">No posts yet</p>
          <p className="text-xs text-[var(--text-tertiary)] opacity-30 mt-2">Upload and process videos to extract takes and quotes</p>
        </div>
      )}

      {/* Ranked list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((post, i) => {
            const key = post.source_upload_id + post.content.slice(0, 40)
            const isOpinion = post.type === 'opinion'
            const date = new Date(post.source_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

            return (
              <div
                key={key}
                className="group relative p-6 border border-[var(--border-light)] rounded-xl bg-[var(--bg-card)] hover:border-[var(--border-medium)] transition-all"
              >
                {/* Rank + type */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 tabular-nums">#{i + 1}</span>
                    <span className={`text-[9px] font-mono uppercase tracking-[0.2em] px-2 py-0.5 rounded-sm ${
                      isOpinion
                        ? 'bg-[var(--accent)]/10 text-[var(--accent)] opacity-80'
                        : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] opacity-60'
                    }`}>
                      {isOpinion ? 'take' : 'quote'}
                    </span>
                  </div>
                  <button
                    onClick={() => handleDismiss(key)}
                    className="opacity-0 group-hover:opacity-20 hover:!opacity-50 text-[var(--text-tertiary)] text-xs transition-opacity"
                    title="Hide"
                  >
                    ✕
                  </button>
                </div>

                {/* Content */}
                <p className={`text-[15px] leading-[1.75] mb-5 ${
                  isOpinion
                    ? 'text-[var(--text-primary)] font-normal'
                    : 'text-[var(--text-secondary)] italic'
                }`}>
                  {isOpinion ? post.content : `"${post.content}"`}
                </p>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-30" title={post.source_file_name}>
                    {date}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleCopy(post.content, i)}
                      className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 hover:opacity-80 transition-opacity"
                    >
                      {copiedIdx === i ? <Check size={11} /> : <Copy size={11} />}
                      {copiedIdx === i ? 'Copied' : 'Copy'}
                    </button>
                    <button
                      onClick={() => handleShare(post.content)}
                      className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 hover:opacity-80 transition-opacity"
                    >
                      <Share2 size={11} /> Post to X
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Scheduling teaser */}
      {!loading && posts.length > 0 && (
        <div className="mt-12 p-5 border border-dashed border-[var(--border-light)] rounded-xl opacity-30">
          <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] mb-1">Coming soon</p>
          <p className="text-xs text-[var(--text-tertiary)]">Auto-schedule — drip these to X automatically, 1–2 per day</p>
        </div>
      )}
    </div>
  )
}
