'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
  Calendar, CheckCircle2, Clock, 
  MoreHorizontal, RotateCcw, Send, 
  SkipForward, Trash2, XCircle,
  MessageSquare, Sparkles, AlertCircle
} from 'lucide-react'

export const runtime = 'edge'

type SocialPost = {
  id: string
  content: string
  platform: string
  status: 'pending' | 'approved' | 'scheduled' | 'posted' | 'skipped'
  source_name?: string
  created_at: string
  scheduled_at?: string
}

export default function QueuePage() {
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'scheduled' | 'history'>('pending')

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const status = activeTab === 'pending' ? 'pending' : activeTab === 'scheduled' ? 'scheduled' : 'posted'
      const res = await fetch(`/api/social-queue?status=${status}`)
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts || [])
      }
    } catch (err) {
      console.error('Failed to fetch queue:', err)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  const [refiningId, setRefiningId] = useState<string | null>(null)

  const handleUpdateStatus = async (id: string, status: SocialPost['status'], scheduled_at?: string) => {
    try {
      const res = await fetch('/api/social-queue', {
        method: 'PATCH',
        body: JSON.stringify({ id, status, scheduled_at })
      })
      if (res.ok) {
        setPosts(prev => prev.filter(p => p.id !== id))
      }
    } catch (err) {
      console.error('Failed to update post:', err)
    }
  }

  const handleRefine = async (id: string, currentContent: string) => {
    setRefiningId(id)
    try {
      const res = await fetch('/api/social-queue/refine', {
        method: 'POST',
        body: JSON.stringify({ content: currentContent })
      })
      if (res.ok) {
        const data = await res.json()
        setPosts(prev => prev.map(p => p.id === id ? { ...p, content: data.refinedContent } : p))
      }
    } catch (err) {
      console.error('Failed to refine post:', err)
    } finally {
      setRefiningId(null)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
             <div className="p-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
               <Sparkles size={16} />
             </div>
             <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)]">
               X Narrator
             </h2>
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">The Approval Queue</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-3 max-w-xl">
            Narrative-driven social posts synthesized from your recordings. Review, refine, and drip them into the world.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] shadow-sm">
          {(['pending', 'scheduled', 'history'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                activeTab === tab
                  ? 'bg-white text-black shadow-lg'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-gradient-to-r from-[var(--border-light)] via-[var(--border-medium)] to-[var(--border-light)]" />

      {/* Main Content */}
      {loading ? (
        <div className="space-y-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-48 rounded-3xl bg-[var(--bg-secondary)]/50 animate-pulse border border-[var(--border-light)]" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 border border-dashed border-[var(--border-light)] rounded-[2.5rem] bg-[var(--bg-secondary)]/10">
          <AlertCircle size={40} className="text-[var(--text-tertiary)] opacity-20 mb-4" />
          <h3 className="text-lg font-medium text-[var(--text-secondary)]">Queue is empty</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-2">No {activeTab} posts found. Keep recording to generate new content.</p>
        </div>
      ) : (
        <div className="grid gap-6">
          {posts.map((post) => {
            const isRefining = refiningId === post.id

            return (
              <div 
                key={post.id}
                className="group relative flex flex-col gap-6 p-8 border border-[var(--border-light)] rounded-[2.5rem] bg-[var(--bg-card)] hover:border-[var(--accent)]/30 hover:shadow-2xl hover:shadow-[var(--accent)]/5 transition-all duration-500"
              >
              {/* Post Meta */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2">
                    <div className="w-8 h-8 rounded-full bg-black border border-white/10 flex items-center justify-center text-[10px] font-bold text-white shadow-xl z-20">X</div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Platform: X.com</span>
                    <span className="text-[9px] text-[var(--text-tertiary)] opacity-50 flex items-center gap-1">
                      <Clock size={10} /> {new Date(post.created_at).toLocaleDateString()} · From {post.source_name || 'Analysis'}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  <span className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest border ${
                    post.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                    post.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                    'bg-green-500/10 text-green-500 border-green-500/20'
                  }`}>
                    {post.status}
                  </span>
                </div>
              </div>

              {/* Content Editor */}
              <div className="relative">
                <div className="absolute -left-4 top-0 bottom-0 w-1 bg-[var(--accent)]/10 rounded-full group-hover:bg-[var(--accent)]/30 transition-colors" />
                <textarea 
                  className="w-full min-h-[120px] bg-transparent border-none p-0 text-xl leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-tertiary)]/30 focus:ring-0 resize-none font-medium"
                  value={post.content}
                  onChange={(e) => setPosts(prev => prev.map(p => p.id === post.id ? { ...p, content: e.target.value } : p))}
                />
              </div>

              {/* Interaction Bar */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-light)]/50">
                <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--text-tertiary)]">
                   <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)]">
                      <MessageSquare size={12} />
                      {post.content.length} / 280 characters
                   </div>
                   <button 
                      onClick={() => handleRefine(post.id, post.content)}
                      disabled={isRefining}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors border border-[var(--accent)]/20 disabled:opacity-50"
                   >
                      {isRefining ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Refine with AI
                   </button>

                </div>

                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => handleUpdateStatus(post.id, 'skipped')}
                    className="p-3 rounded-2xl text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/5 transition-all"
                    title="Skip/Dismiss"
                  >
                    <Trash2 size={18} />
                  </button>
                  
                  {activeTab === 'pending' ? (
                    <button 
                      onClick={() => handleUpdateStatus(post.id, 'scheduled', new Date(Date.now() + 86400000).toISOString())}
                      className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs uppercase tracking-[0.15em] shadow-xl shadow-[var(--accent)]/20 hover:scale-105 active:scale-95 transition-all"
                    >
                      <CheckCircle2 size={16} />
                      Approve & Drip
                    </button>
                  ) : (
                    <button 
                      className="px-6 py-3 rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-primary)] font-bold text-xs uppercase tracking-[0.15em] border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)] transition-all"
                    >
                      Reschedule
                    </button>
                  )}
                </div>
              </div>

              {/* Detail toggle */}
              <div className="absolute top-4 right-4 h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] opacity-0 group-hover:opacity-40 hover:!opacity-100 cursor-pointer transition-all">
                <MoreHorizontal size={20} />
              </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Footer Drip Stats */}
      <div className="bg-[var(--bg-card)] border border-[var(--border-light)] rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
        <div className="flex items-center gap-6">
           <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-[#4f46e5] flex items-center justify-center text-white shadow-2xl">
              <RotateCcw size={32} />
           </div>
           <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)] mb-1">Drip Status</p>
              <h4 className="text-xl font-bold">1 Post / Day</h4>
              <p className="text-xs text-[var(--text-tertiary)]">Optimized for EST morning slots.</p>
           </div>
        </div>

        <div className="flex items-center gap-8">
           <div className="text-center">
              <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)]">Queued</p>
              <p className="text-2xl font-bold">12</p>
           </div>
           <div className="w-px h-10 bg-[var(--border-light)]" />
           <div className="text-center">
              <p className="text-[9px] font-mono uppercase text-[var(--text-tertiary)]">Dripped</p>
              <p className="text-2xl font-bold">48</p>
           </div>
           <button className="px-6 py-3 rounded-2xl bg-black text-white text-[10px] font-bold uppercase tracking-widest border border-white/10 hover:border-white/30 transition-all shadow-2xl">
             Settings
           </button>
        </div>
      </div>
    </div>
  )
}
