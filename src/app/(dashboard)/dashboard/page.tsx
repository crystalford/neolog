'use client'

export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import {
  Activity, Brain, Zap, Target,
  Mic, ImageIcon, Sparkles, AlertCircle, TrendingUp,
  ShieldCheck, Share2, Radio, Terminal, Cpu, Clock, ChevronRight, ArrowUpRight
} from 'lucide-react'

export default function LiveMindDashboard() {
  const [recentEntities, setRecentEntities] = useState<any[]>([])
  const [recentUploads, setRecentUploads] = useState<any[]>([])
  const [activeDirectives, setActiveDirectives] = useState<any[]>([])
  const [openQuestions, setOpenQuestions] = useState<any[]>([])
  const [corpusStats, setCorpusStats] = useState({ voice: 0, face: 0, voiceMinutes: 0, qualifiedFaces: 0 })
  const [lastUploadContrib, setLastUploadContrib] = useState<{ voiceSecs: number; frames: number } | null>(null)
  const [synthesis, setSynthesis] = useState<{ spine: string; synthesized_at: string; commitments_open: any[] } | null>(null)
  const [uploadsSinceSynthesis, setUploadsSinceSynthesis] = useState(0)
  const [totalEntityCount, setTotalEntityCount] = useState(0)
  const [totalUploadCount, setTotalUploadCount] = useState(0)
  const [pendingPostsCount, setPendingPostsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function loadData() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const [
        { data: entities },
        { data: uploads },
        { data: goals },
        { data: questions },
        { data: corpus },
        { data: synthData },
        { count: entityCount },
        { count: uploadCount },
        { count: pendingCount },
      ] = await Promise.all([
        supabase.from('entities').select('*').eq('user_id', session.user.id).order('last_mentioned_at', { ascending: false, nullsFirst: false }).limit(5),
        supabase.from('video_uploads').select('id, file_name, created_at, status, duration_seconds').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('entities').select('*').eq('user_id', session.user.id).eq('type', 'goal').order('mention_count', { ascending: false }).limit(4),
        supabase.from('entities').select('id, name').eq('user_id', session.user.id).eq('type', 'question').order('last_mentioned_at', { ascending: false, nullsFirst: false }).limit(4),
        supabase.from('neural_corpus').select('type, fidelity_score, meta, source_upload_id, created_at').eq('user_id', session.user.id),
        supabase.from('user_synthesis').select('spine, synthesized_at, commitments_open').eq('user_id', session.user.id).order('synthesized_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('entities').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id),
        supabase.from('video_uploads').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('status', 'processed'),
        supabase.from('social_queue').select('id', { count: 'exact', head: true }).eq('user_id', session.user.id).eq('status', 'pending'),
      ])

      setRecentEntities(entities || [])
      setRecentUploads(uploads || [])
      setTotalEntityCount(entityCount || 0)
      setTotalUploadCount(uploadCount || 0)
      setPendingPostsCount(pendingCount || 0)
      setOpenQuestions(questions || [])
      setActiveDirectives(goals?.map(g => ({
        id: g.id,
        title: g.name,
        progress: Math.min(100, (g.mention_count || 0) * 5),
        priority: g.metadata?.priority || 'NORMAL',
      })) || [])

      if (corpus) {
        const voiceEntries = corpus.filter((c: any) => c.type === 'voice')
        const faceEntries = corpus.filter((c: any) => c.type === 'face')
        const voiceMinutes = voiceEntries.reduce((acc: number, v: any) => {
          const secs = v.meta?.duration_seconds
          return acc + (typeof secs === 'number' ? secs / 60 : 5)
        }, 0)
        const qualifiedFaces = faceEntries.filter((f: any) => (f.fidelity_score ?? 0.7) >= 0.6).length
        setCorpusStats({ voice: voiceEntries.length, face: faceEntries.length, voiceMinutes: Math.round(voiceMinutes), qualifiedFaces })
      }

      if (synthData) {
        setSynthesis(synthData as any)
        if (synthData.synthesized_at && uploads) {
          const sinceCount = uploads.filter(u => new Date(u.created_at) > new Date(synthData.synthesized_at)).length
          setUploadsSinceSynthesis(sinceCount)
        }
      } else if (uploads) {
        setUploadsSinceSynthesis(uploads.length)
      }

      setLoading(false)
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20 font-mono text-xs text-[var(--text-tertiary)] uppercase tracking-[0.3em] animate-pulse">
        Loading...
      </div>
    )
  }

  const voicePct = Math.min(100, Math.round((corpusStats.voiceMinutes / 180) * 100))
  const facePct = Math.min(100, Math.round((corpusStats.qualifiedFaces / 25) * 100))

  return (
    <div className="min-h-full bg-[var(--bg-primary)] text-[var(--text-primary)] relative overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-b from-[var(--accent)]/5 to-transparent pointer-events-none" />
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[var(--accent)]/10 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-7xl mx-auto space-y-8 px-6 py-12 relative z-10">
        
        {/* System Header */}
        <div className="flex flex-col md:flex-row gap-8 items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
               <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" />
               <span className="text-[10px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">System Live</span>
            </div>
            <h1 className="text-4xl font-light tracking-tight">The Control Room</h1>
            <p className="text-sm text-[var(--text-tertiary)] max-w-md mt-4 leading-relaxed">
              Your neural engine is synthesizing {totalEntityCount} active entities across {totalUploadCount} processed signals.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full md:w-auto">
             {[
               { label: 'Intelligence', val: 'Active', icon: <Radio size={14} />, color: 'var(--accent)' },
               { label: 'Voice Corpus', val: `${corpusStats.voiceMinutes}m`, icon: <Mic size={14} />, color: '#10b981' },
               { label: 'Social Sync', val: 'Connected', icon: <Share2 size={14} />, color: '#3b82f6' },
               { label: 'Queue', val: `${pendingPostsCount} Pending`, icon: <Terminal size={14} />, color: '#f59e0b' },
             ].map((stat, i) => (
                <div key={i} className="px-5 py-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-light)] shadow-sm backdrop-blur-xl">
                   <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-1">
                      {stat.icon}
                      <span className="text-[9px] font-mono uppercase tracking-widest">{stat.label}</span>
                   </div>
                   <p className="text-sm font-bold truncate" style={{ color: stat.color }}>{stat.val}</p>
                </div>
             ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Main Production Focus */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* Action Hub */}
            <div className="p-1 rounded-3xl bg-gradient-to-br from-[var(--accent)]/30 via-transparent to-transparent border border-[var(--border-light)] shadow-2xl overflow-hidden group">
               <div className="p-8 rounded-[1.4rem] bg-[var(--bg-card)]/90 backdrop-blur-3xl flex flex-col md:flex-row items-center justify-between gap-8 h-full">
                  <div className="flex items-center gap-6">
                     <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--accent)] to-violet-600 flex items-center justify-center text-white shadow-[0_0_30px_rgba(124,106,245,0.3)] group-hover:scale-105 transition-transform">
                        <Zap size={32} />
                     </div>
                     <div>
                        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)] mb-1">Attention Required</p>
                        <h2 className="text-2xl font-bold">Launch Production</h2>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          {pendingPostsCount} posts are awaiting review in the Narrative Queue.
                        </p>
                     </div>
                  </div>
                  <Link 
                    href="/dashboard/queue"
                    className="w-full md:w-auto px-8 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-xs uppercase tracking-[0.2em] shadow-xl shadow-[var(--accent)]/30 hover:shadow-[var(--accent)]/50 hover:-translate-y-1 transition-all flex items-center justify-center gap-2"
                  >
                     Approve Queue <ChevronRight size={16} />
                  </Link>
               </div>
            </div>

            {/* Narrative Spine (Spine Center) */}
            <div className="p-8 rounded-[2.5rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl relative overflow-hidden">
               <div className="absolute top-0 right-0 p-8 opacity-[0.03] rotate-12 pointer-events-none">
                  <Sparkles size={180} />
               </div>
               
               <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                     <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                        <Terminal size={18} />
                     </div>
                     <h2 className="text-sm font-bold uppercase tracking-[0.15em] text-[var(--text-secondary)]">The Active Narrative</h2>
                  </div>
                  <Link href="/dashboard/synthesis" className="text-[10px] font-mono text-[var(--accent)] hover:underline flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity">
                    Access Synthesis <ArrowUpRight size={14} />
                  </Link>
               </div>

               {synthesis?.spine ? (
                 <div className="space-y-8">
                    <div className="relative">
                       <div className="absolute -left-6 top-0 bottom-0 w-1 bg-[var(--accent)]/20 rounded-full" />
                       <h3 className="text-2xl md:text-3xl font-light italic leading-snug text-[var(--text-primary)]">
                         "{synthesis.spine}"
                       </h3>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-8">
                       <div className="space-y-4">
                          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
                             <Target size={12} className="text-amber-400" /> Commitments
                          </p>
                          <div className="space-y-3">
                             {synthesis.commitments_open?.slice(0, 3).map((c: any, i: number) => (
                               <div key={i} className="flex gap-3 text-sm text-[var(--text-secondary)]">
                                  <span className="text-[var(--accent)] font-mono">0{i+1}.</span>
                                  <span>{typeof c === 'string' ? c : c.commitment}</span>
                               </div>
                             ))}
                          </div>
                       </div>

                       <div className="space-y-4 pt-1">
                          <p className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
                             <TrendingUp size={12} className="text-emerald-400" /> Momentum
                          </p>
                          <div className="p-4 rounded-2xl bg-[var(--bg-secondary)]/50 border border-[var(--border-light)]">
                             <p className="text-xs italic leading-relaxed text-[var(--text-secondary)]">
                               Your narrative is centering around the intersection of {recentEntities.slice(0,2).map(e => e.name).join(' & ')}.
                             </p>
                          </div>
                          {uploadsSinceSynthesis >= 10 && (
                            <Link href="/dashboard/synthesis" className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-amber-500 animate-pulse">
                              <AlertCircle size={12} /> {uploadsSinceSynthesis} signals recovery pending
                            </Link>
                          )}
                       </div>
                    </div>
                 </div>
               ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                     <Radio size={40} className="text-[var(--text-tertiary)]/20 mb-4" />
                     <h3 className="text-lg font-medium">No Narrative Spine Extracted</h3>
                     <p className="text-sm text-[var(--text-tertiary)] mt-2 mb-8 max-w-sm">
                        Perform a cross-corpus synthesis to extract your current narrative trajectory and commitments.
                     </p>
                     <Link href="/dashboard/synthesis" className="px-6 py-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[10px] font-bold uppercase tracking-widest hover:bg-[var(--bg-tertiary)] transition-colors">
                       Initialize Synthesis
                     </Link>
                  </div>
               )}
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* Active Directives */}
               <div className="p-8 rounded-[2.5rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                     <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Active Directives</h2>
                     <Target size={16} className="text-rose-400" />
                  </div>
                  <div className="space-y-4">
                    {activeDirectives.length > 0 ? (
                      activeDirectives.map((d) => (
                        <div key={d.id} className="space-y-2">
                           <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-[var(--text-secondary)]">{d.title}</span>
                              <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{d.progress}%</span>
                           </div>
                           <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                              <div className="h-full bg-rose-500/50" style={{ width: `${d.progress}%` }} />
                           </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-tertiary)] italic">Defining goals provides the system with alignment signals.</p>
                    )}
                  </div>
               </div>

               {/* Recent Signals */}
               <div className="p-8 rounded-[2.5rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl">
                  <div className="flex items-center justify-between mb-6">
                     <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Recent Signals</h2>
                     <Database size={16} className="text-emerald-400" />
                  </div>
                  <div className="space-y-3">
                    {recentUploads.length > 0 ? (
                      recentUploads.slice(0, 4).map(upload => (
                        <Link key={upload.id} href={`/dashboard/uploads?id=${upload.id}`} className="flex items-center justify-between group">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium truncate group-hover:text-[var(--accent)] transition-colors">
                              {upload.file_name?.replace(/\.[^.]+$/, '').replace(/[_\-]+/g, ' ') || 'Untitled Session'}
                            </p>
                            <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60 uppercase">{new Date(upload.created_at).toLocaleDateString()}</p>
                          </div>
                          <span className={`ml-2 flex-shrink-0 text-[10px] font-mono px-2 py-0.5 rounded border ${
                            upload.status === 'processed' ? 'border-emerald-500/20 text-emerald-500' : 
                            upload.status === 'error' ? 'border-red-500/20 text-red-400' : 
                            'border-amber-500/20 text-amber-500'
                          }`}>
                            {upload.status}
                          </span>
                        </Link>
                      ))
                    ) : (
                      <p className="text-xs text-[var(--text-tertiary)]">Standby for new signals.</p>
                    )}
                  </div>
               </div>
            </div>

          </div>

          {/* Sidebar Area */}
          <div className="lg:col-span-4 space-y-8">
             {/* Neural Health Manifest */}
             <div className="p-8 rounded-[2.5rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl">
                <div className="flex items-center justify-between mb-8">
                   <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Manifest Status</h2>
                   <ShieldCheck size={18} className="text-emerald-400" />
                </div>
                
                <div className="space-y-8">
                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <Mic size={14} className="text-emerald-400" />
                            <span className="text-xs font-bold uppercase tracking-wider">Voice Identity</span>
                         </div>
                         <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{voicePct}%</span>
                      </div>
                      <div className="h-6 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center">
                         <div className="h-full bg-emerald-500 rounded-md shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all duration-1000" style={{ width: `${voicePct}%` }} />
                      </div>
                      <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase text-center">{corpusStats.voiceMinutes} / 180 MINUTES SECURED</p>
                   </div>

                   <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <div className="flex items-center gap-2">
                            <ImageIcon size={14} className="text-indigo-400" />
                            <span className="text-xs font-bold uppercase tracking-wider">Visual Fidelity</span>
                         </div>
                         <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{facePct}%</span>
                      </div>
                      <div className="h-6 p-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center">
                         <div className="h-full bg-indigo-500 rounded-md shadow-[0_0_15px_rgba(99,102,241,0.3)] transition-all duration-1000" style={{ width: `${facePct}%` }} />
                      </div>
                      <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase text-center">{corpusStats.qualifiedFaces} / 25 KEYFRAMES QUALIFIED</p>
                   </div>

                   <div className="pt-4 border-t border-[var(--border-light)]">
                      <p className="text-[9px] font-mono text-[var(--text-tertiary)] mb-4 uppercase tracking-[0.2em] text-center">Active Calibration</p>
                      <div className="grid grid-cols-3 gap-2">
                         {[1,2,3,4,5,6].map(i => (
                            <div key={i} className={`h-1.5 rounded-full ${i <= 4 ? 'bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]' : 'bg-[var(--bg-secondary)]'}`} />
                         ))}
                      </div>
                   </div>
                </div>
             </div>

             {/* Intelligence Scan (Entities) */}
             <div className="p-8 rounded-[2.5rem] bg-[var(--bg-card)] border border-[var(--border-light)] shadow-xl">
                <div className="flex items-center justify-between mb-6">
                   <h2 className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">Neural Mapping</h2>
                   <Cpu size={18} className="text-purple-400" />
                </div>
                <div className="space-y-5">
                   {recentEntities.slice(0, 5).map(entity => (
                      <div key={entity.id} className="group">
                         <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium group-hover:text-[var(--accent)] transition-colors">{entity.name}</span>
                            <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-60">{entity.type}</span>
                         </div>
                         <div className="flex items-center gap-2">
                            <div className="flex-1 h-0.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                               <div className="h-full bg-[var(--accent)] opacity-40 group-hover:opacity-100 transition-all" style={{ width: `${Math.min((entity.mention_count || 1) * 8, 100)}%` }} />
                            </div>
                         </div>
                      </div>
                   ))}
                   <Link href="/dashboard/entities" className="block text-center pt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors">
                     Open Graph View
                   </Link>
                </div>
             </div>

             {/* Quick Actions */}
             <div className="space-y-3">
                <Link href="/dashboard/studio" className="flex items-center justify-between p-6 rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] hover:border-[var(--accent)]/30 hover:shadow-lg transition-all group">
                   <div className="flex items-center gap-4">
                      <div className="p-3 rounded-2xl bg-black text-white group-hover:bg-[var(--accent)] transition-colors">
                         <Terminal size={18} />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-widest">Open Studio</span>
                   </div>
                   <ChevronRight size={16} className="text-[var(--text-tertiary)]" />
                </Link>
             </div>
          </div>

        </div>
      </div>
    </div>
  )
}
