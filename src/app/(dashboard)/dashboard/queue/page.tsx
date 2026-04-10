'use client'

export const runtime = 'edge'

import { useState, useEffect, useCallback } from 'react'
import { 
  Calendar, CheckCircle2, Clock, 
  MoreHorizontal, RotateCcw, Send, 
  SkipForward, Trash2, XCircle,
  MessageSquare, Sparkles, AlertCircle, TrendingUp, Shuffle, Settings2, Zap,
  Terminal, Share2, Radio, Target, ChevronRight, ArrowUpRight, Loader2
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  const [scatterEnabled, setScatterEnabled] = useState(true)
  const [runwayDays, setRunwayDays] = useState(0)
  const [refiningId, setRefiningId] = useState<string | null>(null)
  
  const supabase = createClient()

  const fetchQueue = useCallback(async () => {
    setLoading(true)
    try {
      const status = activeTab === 'pending' ? 'pending' : activeTab === 'scheduled' ? 'scheduled' : 'posted'
      
      // RESTORING USE OF API ROUTE:
      // This route contains necessary fallbacks to extract posts from video analysis 
      // when the social_queue table is empty or missing.
      const res = await fetch(`/api/social-queue?status=${status}`)
      if (res.ok) {
        const data = await res.json()
        setPosts(data.posts || [])
        
        // Calculate runway based on scheduled posts
        if (activeTab === 'scheduled') {
           const days = new Set(data.posts.map((p: any) => new Date(p.scheduled_at).toLocaleDateString())).size
           setRunwayDays(days)
        }
      } else {
        console.error('API_ERROR:', res.statusText)
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

  const handleUpdateStatus = async (id: string, status: SocialPost['status'], scheduled_at?: string) => {
    try {
      // Also using API route for updates for consistency and server-side verification
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

  // ... rest of the UI remains the same
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-sans relative overflow-hidden">
      {/* Ambience */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[var(--accent)]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto px-6 py-16 space-y-12 relative z-10">
        
        {/* Technical Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-4">
               <div className="p-2 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20 shadow-[0_0_15px_var(--accent)/10]">
                 <Share2 size={20} />
               </div>
               <div className="flex flex-col">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">Social Distribution Terminal</span>
                  <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase opacity-50">Pipeline Active // Scatter Enabled</span>
               </div>
            </div>
            <h1 className="text-4xl font-light tracking-tight">Post Approval Queue</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-4 max-w-xl leading-relaxed">
              Synthesized social signals awaiting narrative verification. Review and approve to initialize the scatter drip sequence.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <nav className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-2xl shadow-sm">
              {(['pending', 'scheduled', 'history'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                    activeTab === tab
                      ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-2xl'
                      : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>

            <button 
              onClick={() => setScatterEnabled(!scatterEnabled)}
              className={`flex items-center gap-2 px-6 py-3 rounded-2xl border transition-all ${
                scatterEnabled 
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)] shadow-xl shadow-[var(--accent)]/20' 
                  : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border-light)]'
              }`}
            >
              <Shuffle size={14} className={scatterEnabled ? 'animate-pulse' : ''} />
              <span className="text-[10px] font-bold uppercase tracking-widest">Scatter Alpha</span>
            </button>
          </div>
        </div>

        {/* Global Production Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="p-8 rounded-[2rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl flex items-center gap-6 group hover:border-[var(--accent)]/30 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center border border-emerald-500/20 group-hover:scale-105 transition-transform">
                 <Radio size={24} />
              </div>
              <div>
                 <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Queue Health</p>
                 <h4 className="text-xl font-bold">Stable</h4>
              </div>
           </div>
           
           <div className="p-8 rounded-[2rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl flex items-center gap-6 group hover:border-blue-500/30 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center border border-blue-500/20 group-hover:scale-105 transition-transform">
                 <Zap size={24} />
              </div>
              <div>
                 <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] mb-1">Drip Velocity</p>
                 <h4 className="text-xl font-bold">1 / 18hrs</h4>
              </div>
           </div>

           <div className="p-8 rounded-[2rem] bg-gradient-to-br from-[var(--accent)]/10 to-transparent border border-[var(--accent)]/20 shadow-xl flex items-center gap-6 group hover:border-[var(--accent)]/40 transition-all">
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
                 <Target size={24} />
              </div>
              <div>
                 <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--accent)] mb-1">Planned Runway</p>
                 <h4 className="text-xl font-bold">{runwayDays} Days</h4>
              </div>
           </div>
        </div>

        <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-light)] to-transparent" />

        {/* Post List */}
        {loading ? (
          <div className="space-y-8">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-56 rounded-[2.5rem] bg-[var(--bg-secondary)]/30 animate-pulse border border-[var(--border-light)]" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-40 border-2 border-dashed border-[var(--border-light)] rounded-[3rem] bg-[var(--bg-card)]/30 backdrop-blur-3xl">
            <AlertCircle size={48} className="text-[var(--text-tertiary)] opacity-10 mb-6" />
            <h3 className="text-xl font-light text-[var(--text-secondary)]">Narrative Stream Empty</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-3 max-w-sm text-center uppercase tracking-widest leading-loose">
              Initiate new recordings to generate <br /> automated social artifacts.
            </p>
          </div>
        ) : (
          <div className="grid gap-10">
            {posts.map((post) => {
              const isRefining = refiningId === post.id

              return (
                <div 
                  key={post.id}
                  className="group relative flex flex-col gap-8 p-10 border border-[var(--border-light)] rounded-[3rem] bg-[var(--bg-card)]/50 backdrop-blur-2xl hover:border-[var(--accent)]/40 hover:shadow-[0_0_50px_rgba(124,106,245,0.05)] transition-all duration-700"
                >
                  {/* Status Pulse Decoration */}
                  <div className="absolute top-0 left-12 w-12 h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                  {/* Post Meta Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 rounded-2xl bg-black border border-white/10 flex items-center justify-center text-lg font-black text-white shadow-2xl transition-transform group-hover:scale-110">X</div>
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2">
                           <span className="text-[10px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-primary)]">X Protocol Artifact</span>
                           <div className="w-1 h-3 rounded-full bg-emerald-500 animate-pulse" />
                        </div>
                        <span className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase opacity-60 flex items-center gap-2 mt-1">
                          <Terminal size={10} /> {new Date(post.created_at || Date.now()).toLocaleTimeString()} // SOURCE: {post.source_name || 'NEURAL_EXTRACT'}
                        </span>
                      </div>
                    </div>
                    
                    <div className={`px-4 py-1.5 rounded-full text-[9px] font-mono font-black uppercase tracking-widest border shadow-sm ${
                      post.status === 'pending' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                      post.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                    }`}>
                      {post.status}
                    </div>
                  </div>

                  {/* Content Area */}
                  <div className="relative">
                    <div className="absolute -left-6 top-1 bottom-1 w-[2px] bg-[var(--accent)]/20 rounded-full group-hover:bg-[var(--accent)]/60 transition-all duration-500" />
                    <textarea 
                      className="w-full min-h-[140px] bg-transparent border-none p-0 text-2xl font-light tracking-tight leading-relaxed text-[var(--text-primary)] placeholder-[var(--text-tertiary)]/20 focus:ring-0 resize-none"
                      value={post.content}
                      onChange={(e) => setPosts(prev => prev.map(p => p.id === post.id ? { ...p, content: e.target.value } : p))}
                    />
                  </div>

                  {/* Toolsets & Actions */}
                  <div className="flex flex-col md:flex-row items-center justify-between pt-8 border-t border-[var(--border-light)]/40 gap-6">
                    <div className="flex flex-wrap items-center gap-4">
                       <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--bg-secondary)]/50 border border-[var(--border-light)] text-[10px] font-mono font-bold text-[var(--text-tertiary)]">
                          <MessageSquare size={14} className="opacity-40" />
                          {post.content.length} <span className="opacity-30">/</span> 280
                       </div>
                       
                       <button 
                          onClick={() => handleRefine(post.id, post.content)}
                          disabled={refiningId === post.id}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent)]/5 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all border border-[var(--accent)]/20 disabled:opacity-50 text-[10px] font-bold uppercase tracking-widest shadow-sm"
                       >
                          {refiningId === post.id ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          Refine Intelligence
                       </button>
                    </div>

                    <div className="flex items-center gap-3">
                      <button 
                        onClick={() => handleUpdateStatus(post.id, 'skipped')}
                        className="p-3 rounded-2xl text-[var(--text-tertiary)] hover:text-red-400 hover:bg-red-400/5 transition-all group/trash"
                        title="Purge Artifact"
                      >
                        <Trash2 size={20} className="group-hover/trash:scale-110 transition-transform" />
                      </button>
                      
                      {activeTab === 'pending' ? (
                        <button 
                          onClick={() => handleUpdateStatus(post.id, 'scheduled', new Date(Date.now() + 86400000).toISOString())}
                          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-[10px] uppercase tracking-[0.25em] shadow-xl shadow-[var(--accent)]/30 hover:scale-[1.03] active:scale-95 transition-all group/btn"
                        >
                          <CheckCircle2 size={18} />
                          Approve & Drip
                          <ChevronRight size={16} className="opacity-40 group-hover:translate-x-1 transition-transform" />
                        </button>
                      ) : (
                        <button 
                          className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-[var(--bg-secondary)] text-[var(--text-primary)] font-bold text-[10px] uppercase tracking-widest border border-[var(--border-light)] hover:bg-[var(--bg-tertiary)] transition-all"
                        >
                          <Clock size={18} />
                          Reschedule Drip
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Bottom Technical Tag */}
                  <div className="absolute bottom-4 right-10 text-[8px] font-mono text-[var(--text-tertiary)] opacity-10 font-bold uppercase tracking-widest pointer-events-none">
                    MANIFEST_ID_{post.id.slice(0, 8)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Global Pipeline Footer */}
        <div className="p-10 rounded-[3rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-2xl flex flex-col md:flex-row items-center justify-between gap-10 relative overflow-hidden group">
           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/20 to-transparent" />
           
           <div className="flex items-center gap-8 relative z-10">
              <div className="w-20 h-20 rounded-[2rem] bg-gradient-to-br from-[var(--accent)] to-indigo-600 flex items-center justify-center text-white shadow-2xl group-hover:rotate-[10deg] transition-transform duration-700">
                 <Radio size={40} />
              </div>
              <div className="space-y-1">
                 <p className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">Drip Cycle: Active</p>
                 <h4 className="text-3xl font-black italic uppercase tracking-tighter">Scatter Mode V1</h4>
                 <p className="text-xs text-[var(--text-tertiary)] font-light">Optimized temporal distribution across all authorized manifolds.</p>
              </div>
           </div>

           <div className="flex items-center gap-12 relative z-10">
              <div className="text-center space-y-1">
                 <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Queued</p>
                 <p className="text-4xl font-black italic">{posts.length}</p>
              </div>
              <div className="h-16 w-px bg-[var(--border-light)]" />
              <div className="text-center space-y-1">
                 <p className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Dripped</p>
                 <p className="text-4xl font-black italic text-emerald-500">48</p>
              </div>
              <button className="px-8 py-4 rounded-2xl bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] text-[10px] font-bold uppercase tracking-widest border border-white/5 transition-all flex items-center gap-3">
                <Settings2 size={16} /> Production Config
              </button>
           </div>
        </div>

      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.05);
          border-radius: 10px;
        }
      `}</style>
    </div>
  )
}
