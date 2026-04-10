'use client'

export const runtime = 'edge'

import { useState, useEffect, useRef, useMemo } from 'react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { 
  Calendar, Filter, Search, Plus, Loader2, Sparkles, SlidersHorizontal, 
  ArrowUpRight, BookOpen, Layers, Zap, TrendingUp, Target, Brain, 
  Radio, Quote, AlertCircle, ArrowRight, Terminal, Clock, Database, ChevronRight
} from 'lucide-react'
import { LogCard, type LogEntry } from '@/components/LogCard'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function TimelinePage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'archive' | 'script' | 'neural'>('archive')
  const [synthesis, setSynthesis] = useState<any>(null)
  const [entities, setEntities] = useState<any[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      // Fetch log entries
      const { data: logs, error: logsError } = await supabase
        .from('log_entries')
        .select('*')
        .eq('user_id', session.user.id)
        .order('logged_at', { ascending: false })

      if (logsError) console.error('LOGS_FETCH_ERROR:', logsError)

      // Recent Synthesis
      const { data: synthData } = await supabase
        .from('user_synthesis')
        .select('*')
        .eq('user_id', session.user.id)
        .order('synthesized_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (synthData) setSynthesis(synthData)

      // Top Entities
      const { data: entityData } = await supabase
        .from('entities')
        .select('*')
        .eq('user_id', session.user.id)
        .order('mention_count', { ascending: false })
        .limit(20)
      
      if (entityData) setEntities(entityData)

      if (logs) {
        const uploadIds = Array.from(new Set(logs.map(l => l.source_upload_id).filter(id => !!id))) as string[]
        
        if (uploadIds.length > 0) {
          const { data: uploads, error: uploadsError } = await supabase
            .from('video_uploads')
            .select('id, transcript_segments, transcript, analysis, thumbnail_url')
            .in('id', uploadIds)

          if (!uploadsError && uploads) {
            const uploadMap = new Map(uploads.map(u => [u.id, u]))
            const mergedEntries = logs.map(log => {
              const upload = log.source_upload_id ? uploadMap.get(log.source_upload_id) : null
              return {
                ...log,
                thumbnail_url: upload?.thumbnail_url || log.thumbnail_url,
                video_uploads: upload
              }
            })
            setEntries(mergedEntries as any)
          } else {
            setEntries(logs as any)
          }
        } else {
          setEntries(logs as any)
        }
      }
      
      setIsLoading(false)
    }
    load()
  }, [supabase])

  const filteredEntries = useMemo(() => {
    return entries.filter(e => 
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.entry_type.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [entries, searchQuery])

  const groupedEntries = useMemo(() => {
    const groups: Record<string, LogEntry[]> = {}
    filteredEntries.forEach(entry => {
      const date = format(parseISO(entry.logged_at), 'yyyy-MM-dd')
      if (!groups[date]) groups[date] = []
      groups[date].push(entry)
    })
    return groups
  }, [filteredEntries])

  const dates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a))

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 animate-pulse">
        <div className="p-4 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)]">
           <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)]" />
        </div>
        <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-[var(--text-tertiary)]">Syncing Narrative Manifold...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] relative font-sans">
      {/* Background ambience */}
      <div className="absolute top-0 right-0 w-[40%] h-[400px] bg-gradient-to-bl from-[var(--accent)]/5 to-transparent pointer-events-none" />

      {/* Persistent Terminal Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border-light)] bg-[var(--bg-card)]/60 backdrop-blur-3xl px-8 py-6">
        <div className="max-w-[1400px] mx-auto flex flex-col lg:flex-row lg:items-center justify-between gap-8">
          
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
               <div className="flex items-center gap-2 mb-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse shadow-[0_0_8px_var(--accent)]" />
                  <span className="text-[9px] font-mono font-bold uppercase tracking-[0.4em] text-[var(--accent)]">Signal Stream: Live</span>
               </div>
               <h1 className="text-2xl font-black tracking-tighter uppercase italic">The Narrative Archive</h1>
            </div>

            <nav className="flex items-center gap-1 p-1 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl">
               {[
                 { id: 'archive', label: 'Records', icon: Layers },
                 { id: 'neural', label: 'Neural', icon: Sparkles },
                 { id: 'script', label: 'Script', icon: BookOpen }
               ].map(tab => (
                 <button 
                  key={tab.id}
                  onClick={() => setViewMode(tab.id as any)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${
                    viewMode === tab.id ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-xl' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                  }`}
                 >
                   <tab.icon size={14} /> {tab.label}
                 </button>
               ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input 
                type="text"
                placeholder="Search Narrative Vectors..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-secondary)]/50 border border-[var(--border-light)] rounded-xl pl-12 pr-6 py-2.5 text-xs w-64 lg:w-[400px] focus:border-[var(--accent)]/50 focus:bg-[var(--bg-secondary)] outline-none transition-all placeholder:text-[var(--text-tertiary)]/30"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-8 py-16">
        {viewMode === 'archive' ? (
          /* High-Fidelity Record View */
          dates.length > 0 ? (
            <div className="space-y-24">
              {dates.map((dateStr) => {
                const dateObj = parseISO(dateStr)
                const entriesForDate = groupedEntries[dateStr]
                
                return (
                  <section key={dateStr} className="relative group">
                    <div className="flex items-center gap-6 mb-12">
                       <h2 className="text-[12px] font-mono font-black text-[var(--text-primary)] uppercase tracking-[0.4em] whitespace-nowrap">
                          {isToday(dateObj) ? 'SYSTEM_TODAY' : isYesterday(dateObj) ? 'SYSTEM_YESTERDAY' : format(dateObj, 'MMM_dd_yyyy').toUpperCase()}
                       </h2>
                       <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--border-light)] to-transparent" />
                       <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-30 font-bold uppercase tracking-widest">
                          {entriesForDate.length} LOG_SIGNALS
                       </span>
                    </div>

                    <div className="grid grid-cols-1 gap-1">
                      {entriesForDate.map((entry) => (
                        <LogCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <EmptyState message="Zero Narrative Captured" />
          )
        ) : viewMode === 'neural' ? (
          <NeuralFYP key="neural-view" synthesis={synthesis} entities={entities} />
        ) : (
          /* Professional Infinite Script View */
          <div className="max-w-4xl mx-auto space-y-32 pb-40">
             {filteredEntries.map((entry: any, idx) => {
                const upload = (Array.isArray(entry.video_uploads) ? entry.video_uploads[0] : entry.video_uploads)
                let segments = upload?.transcript_segments || entry.meta?.transcript_segments || []
                
                if (segments.length === 0 && upload?.transcript) {
                  segments = [{ start: 0, text: upload.transcript }]
                }
                
                return (
                  <article key={entry.id} className="relative group/article">
                     <div className="flex items-center gap-6 mb-16 opacity-30 group-hover/article:opacity-100 transition-opacity duration-700">
                        <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--accent)]">
                           <Terminal size={14} />
                        </div>
                        <span className="text-[10px] font-mono font-black uppercase tracking-[0.5em] text-[var(--text-tertiary)] whitespace-nowrap">
                           {format(parseISO(entry.logged_at), 'MMM dd · HH:mm')} // SIGNAL_{idx + 1}
                        </span>
                        <div className="h-[1px] flex-1 bg-gradient-to-r from-[var(--border-light)] via-[var(--border-light)] to-transparent" />
                     </div>

                     {segments.length > 0 ? (
                        <div className="space-y-12">
                           {segments.map((seg: any, sIdx: number) => (
                              <div key={sIdx} className="flex gap-16 group/seg">
                                 <div className="flex flex-col items-center gap-4 pt-1">
                                    <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-30 w-12 text-right font-black tracking-tighter group-hover/seg:opacity-100 transition-opacity">
                                       {formatTime(seg.start)}
                                    </span>
                                    <div className="w-[1px] flex-1 bg-[var(--border-light)]/50 group-hover/seg:bg-[var(--accent)]/30 transition-colors" />
                                 </div>
                                 <p className="text-[20px] leading-[1.8] text-[var(--text-secondary)] font-light tracking-wide group-hover/seg:text-[var(--text-primary)] transition-colors">
                                    {seg.text}
                                 </p>
                              </div>
                           ))}
                        </div>
                     ) : (
                        <div className="pl-28 py-10 opacity-40 italic border-l border-[var(--border-light)]">
                           <p className="text-[12px] font-mono font-black uppercase tracking-[0.3em] text-[var(--text-tertiary)]">
                              [ NO ANALYTICAL LOG RECOVERED FOR THIS SIGNAL ]
                           </p>
                        </div>
                     )}
                  </article>
                )
             })}
             {filteredEntries.length === 0 && <EmptyState message="The script manifold is empty." />}
          </div>
        )}
      </main>
    </div>
  )
}

function NeuralFYP({ synthesis, entities }: { synthesis: any; entities: any[] }) {
  if (!synthesis) {
    return (
      <div className="flex flex-col items-center justify-center py-48 gap-8 border-2 border-dashed border-[var(--border-light)] rounded-[3rem] bg-[var(--bg-card)]/30 backdrop-blur-3xl">
        <div className="w-16 h-16 rounded-3xl bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center text-[var(--text-tertiary)] animate-bounce">
           <Brain size={32} />
        </div>
        <p className="text-[11px] font-mono uppercase tracking-[0.6em] font-black text-[var(--text-tertiary)]">Standby for Synthesis...</p>
        <Link href="/dashboard/studio" className="px-6 py-3 rounded-xl bg-[var(--accent)] text-white text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-[var(--accent)]/20 hover:scale-105 active:scale-95 transition-all">
          Initialize Hub
        </Link>
      </div>
    )
  }

  const momentumArr = [
    ...(synthesis.momentum?.accelerating?.map((m: any) => ({ type: 'momentum-up', title: m, category: 'Accelerating Vector' })) || []),
    ...(synthesis.momentum?.stalling?.map((m: any) => ({ type: 'momentum-down', title: m, category: 'Stalled Directive' })) || []),
    ...(synthesis.momentum?.dormant?.map((m: any) => ({ type: 'momentum-dormant', title: m, category: 'Dormant Thread' })) || []),
  ]

  return (
    <div className="space-y-16 animate-in fade-in duration-1000 slide-in-from-bottom-8">
      
      {/* Cinematic Chapter Header */}
      <section className="relative group p-12 rounded-[3.5rem] bg-gradient-to-br from-[var(--bg-secondary)] to-transparent border border-[var(--border-light)] overflow-hidden">
         <div className="absolute top-0 right-0 p-12 opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-1000">
            <Radio size={280} />
         </div>
         <div className="relative space-y-6">
            <div className="flex items-center gap-3">
               <span className="px-4 py-1.5 rounded-full bg-[var(--accent)] text-white text-[9px] font-mono font-black uppercase tracking-[0.3em] shadow-lg shadow-[var(--accent)]/20">Current Chapter Spine</span>
               <div className="h-[1px] w-24 bg-[var(--border-light)]" />
            </div>
            <h2 className="text-4xl md:text-6xl font-black italic tracking-tighter text-[var(--text-primary)] max-w-4xl leading-[0.95] uppercase">
              "{synthesis.spine}"
            </h2>
            <p className="text-sm text-[var(--text-tertiary)] max-w-2xl font-light italic">
               Narrative trajectory synthesized on {new Date(synthesis.synthesized_at).toLocaleDateString()} from {entities.length} active cognitive nodes.
            </p>
         </div>
      </section>

      {/* Intelligence Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
         {momentumArr.map((m: any, i: number) => (
           <NeuralCard 
             key={`momentum-${i}`}
             icon={m.type === 'momentum-up' ? <TrendingUp size={20} /> : m.type === 'momentum-down' ? <Zap size={20} /> : <Radio size={20} />}
             type={m.category}
             title={m.title}
             variant={m.type === 'momentum-up' ? 'accent' : 'dim'}
           />
         ))}

         {synthesis.commitments_open?.map((c: any, i: number) => (
           <NeuralCard 
             key={`commitment-${i}`}
             icon={<Target size={20} />}
             type="Active Commitment"
             title={typeof c === 'string' ? c : c.commitment}
             subtitle={typeof c === 'object' ? c.context : undefined}
             variant="warning"
           />
         ))}

         {synthesis.contradictions?.map((c: any, i: number) => (
           <NeuralCard 
             key={`contradiction-${i}`}
             icon={<AlertCircle size={20} />}
             type="Cognitive Dissonance"
             title={c.topic}
             body={`Previously held: "${c.position_a}" // Recent Signal: "${c.position_b}"`}
             variant="danger"
           />
         ))}

         {synthesis.narratives?.map((n: any, i: number) => (
           <NeuralCard 
             key={`narrative-${i}`}
             icon={<Brain size={20} />}
             type={`Arc: ${n.arc_type}`}
             title={n.title}
             body={n.description}
             variant="info"
           />
         ))}

         {entities.slice(0, 9).map((e: any, i: number) => (
           <NeuralCard 
             key={`entity-${i}`}
             icon={<Radio size={16} />}
             type={`Active Node: ${e.mention_count}x`}
             title={e.name}
             subtitle={e.summary}
             variant="ghost"
           />
         ))}
      </div>
    </div>
  )
}

function NeuralCard({ icon, type, title, body, subtitle, variant }: { icon: any, type: string, title: string, body?: string, subtitle?: string, variant: string }) {
  const variantStyles: any = {
    accent: 'border-[var(--accent)]/40 bg-[var(--accent)]/5 shadow-[0_0_40px_-10px_rgba(124,106,245,0.15)]',
    dim: 'border-[var(--border-light)] opacity-70 hover:opacity-100',
    warning: 'border-amber-500/30 bg-amber-500/5 shadow-[0_0_40px_-10px_rgba(245,158,11,0.1)]',
    danger: 'border-rose-500/30 bg-rose-500/5 shadow-[0_0_40px_-10px_rgba(244,63,94,0.1)]',
    info: 'border-blue-500/30 bg-blue-500/5 shadow-[0_0_40px_-10px_rgba(59,130,246,0.1)]',
    ghost: 'border-transparent hover:border-[var(--border-light)] bg-white/[0.01]',
  }

  return (
    <div className={`p-10 rounded-[2.5rem] border transition-all duration-700 hover:-translate-y-2 hover:shadow-2xl flex flex-col gap-8 group ${variantStyles[variant] || variantStyles.dim}`}>
       <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
             <div className="p-3 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors">
                {icon}
             </div>
             <span className="text-[10px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-60 group-hover:opacity-100 transition-all">
                {type}
             </span>
          </div>
          <ArrowUpRight size={18} className="text-[var(--text-tertiary)] opacity-0 group-hover:opacity-40 transition-opacity" />
       </div>

       <div className="space-y-4">
          <h3 className="text-2xl font-bold tracking-tight text-[var(--text-primary)] leading-tight uppercase italic">{title}</h3>
          {subtitle && <p className="text-[11px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-50 leading-relaxed font-bold">{subtitle}</p>}
          {body && <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] font-light italic border-l-2 border-[var(--accent)]/20 pl-6 group-hover:border-[var(--accent)] transition-colors">{body}</p>}
       </div>

       <div className="mt-auto pt-6 opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-widest text-[var(--accent)]">
             Review Vector Data <ArrowRight size={14} />
          </button>
       </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-48 gap-8 border-2 border-dashed border-[var(--border-light)] rounded-[3rem] opacity-30">
      <Sparkles size={48} className="text-[var(--text-tertiary)]" />
      <p className="text-[12px] font-mono uppercase tracking-[0.6em] font-black text-[var(--text-tertiary)]">{message}</p>
    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
