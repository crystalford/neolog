'use client'

import { useState, useEffect } from 'react'
import { 
  Database, Fingerprint, Lightbulb, Users, 
  Search, SlidersHorizontal, ChevronDown, ChevronUp,
  Clock, Map, TrendingUp, Inbox, Film, ArrowRight,
  FileText, Loader2, Sparkles, Network, LayoutGrid
} from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { Entity, EntityMention } from '@/types/database'
import NetworkGraph from './NetworkGraph'

export const runtime = 'edge'

const ENTITY_CONFIGS: Record<string, { icon: any, color: string, bg: string }> = {
  project: { icon: Database, color: 'text-blue-400', bg: 'bg-blue-400/10' },
  person: { icon: Users, color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  topic: { icon: Lightbulb, color: 'text-amber-400', bg: 'bg-amber-400/10' },
  goal: { icon: Fingerprint, color: 'text-purple-400', bg: 'bg-purple-400/10' }
}

export default function BrainPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mentions, setMentions] = useState<any[]>([])
  const [loadingMentions, setLoadingMentions] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'graph'>('grid')
  const [isSynthesizing, setIsSynthesizing] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchEntities()
  }, [])

  const fetchEntities = async () => {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data, error } = await supabase
      .from('entities')
      .select('*')
      .eq('user_id', session.user.id)
      .order('mention_count', { ascending: false })

    if (data) setEntities(data)
    setLoading(false)
  }

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }

    setExpandedId(id)
    setLoadingMentions(true)
    
    const { data, error } = await supabase
      .from('entity_mentions')
      .select(`
        *,
        video_uploads (file_name),
        log_entries (title)
      `)
      .eq('entity_id', id)
      .order('created_at', { ascending: false })
      .limit(10)

    if (data) setMentions(data)
    setLoadingMentions(false)
  }

  const formatRelativeTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    return d.toLocaleDateString()
  }

  const handleGlobalSynthesis = async () => {
    setIsSynthesizing(true)
    try {
      const res = await fetch('/api/synthesize-graph', { method: 'POST' })
      if (!res.ok) {
        const error = await res.json()
        alert(error.error || 'Failed to start synthesis')
      } else {
        alert('Universal synthesis triggered. This may take a few minutes.')
      }
    } catch (err) {
      console.error('Synthesis error:', err)
    } finally {
      setIsSynthesizing(false)
    }
  }

  const handleEntitySynthesis = async (entityId: string, type: string) => {
     // If project, trigger project synthesis
     if (type === 'project') {
       try {
         const res = await fetch(`/api/portfolio/project/${entityId}/generate`, { method: 'POST' })
         if (res.ok) {
           alert('Project synthesis triggered.')
         }
       } catch (err) {
         console.error('Project synthesis error:', err)
       }
     } else {
       alert('Synthesis for this node type coming soon.')
     }
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-[var(--accent)]/10 text-[var(--accent)]">
              <Network size={16} />
            </div>
            <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)]">
              Neural Network Graph
            </h2>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-[var(--text-primary)]">The Brain</h1>
          <p className="text-sm text-[var(--text-tertiary)] max-w-xl">
            A real-time mapping of entities, projects, and thematic nodes extracted from your neural logs.
          </p>
        </div>

        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleGlobalSynthesis}
              disabled={isSynthesizing}
              className="flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100"
            >
              {isSynthesizing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Synthesize Universal Graph
            </button>
            <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] shadow-sm">
               <button 
                 onClick={() => setViewMode('grid')}
                 className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white text-black shadow-lg' : 'text-[var(--text-tertiary)] hover:text-white'}`}
                 title="Grid View"
               >
                 <LayoutGrid size={18} />
               </button>
               <button 
                 onClick={() => setViewMode('graph')}
                 className={`p-2 rounded-lg transition-all ${viewMode === 'graph' ? 'bg-white text-black shadow-lg' : 'text-[var(--text-tertiary)] hover:text-white'}`}
                 title="Graph View"
               >
                 <Network size={18} />
               </button>
            </div>
          </div>
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Filter nodes..."
              className="pl-10 pr-4 py-2 bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-xl text-sm focus:ring-1 focus:ring-[var(--accent)] focus:border-[var(--accent)] outline-none transition-all w-64"
            />
          </div>
        </div>
      </div>


      <div className="h-px bg-gradient-to-r from-transparent via-[var(--border-light)] to-transparent" />

      {/* Main Content View */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 rounded-[2rem] bg-[var(--bg-secondary)]/50 animate-pulse border border-[var(--border-light)]" />
          ))}
        </div>
      ) : entities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 border border-dashed border-[var(--border-light)] rounded-[3rem] bg-[var(--bg-secondary)]/10">
          <Database size={48} className="text-[var(--text-tertiary)] opacity-20 mb-4" />
          <h3 className="text-xl font-medium text-[var(--text-secondary)]">No neural nodes detected yet</h3>
          <p className="text-sm text-[var(--text-tertiary)] mt-2 italic">Entities will emerge as you process your uploads and logs.</p>
        </div>
      ) : viewMode === 'graph' ? (
        <div className="h-[700px] border border-[var(--border-light)] rounded-[3rem] bg-black/40 overflow-hidden relative shadow-2xl">
           <NetworkGraph entities={entities} />
           <div className="absolute top-6 left-6 p-4 rounded-2xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[var(--text-tertiary)] space-y-2">
              <p className="text-[var(--accent)] font-bold mb-1 tracking-widest uppercase">Graph Legend</p>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-400" /> Projects</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-400" /> People</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-400" /> Topics</div>
              <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-400" /> Goals</div>
           </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {entities.map((entity) => {
            const config = ENTITY_CONFIGS[entity.type] || ENTITY_CONFIGS.topic
            const isExpanded = expandedId === entity.id

            return (
              <div 
                key={entity.id}
                className={`group relative flex flex-col transition-all duration-300 rounded-3xl border ${
                  isExpanded 
                  ? 'col-span-1 md:col-span-2 lg:col-span-3 bg-[var(--bg-secondary)] border-[var(--accent)]/40 shadow-2xl z-10' 
                  : 'bg-[var(--bg-card)] border-[var(--border-light)] hover:border-[var(--border-medium)] hover:shadow-lg'
                }`}
              >
                {/* Entity Card Header */}
                <div 
                  className={`flex items-center gap-4 p-5 cursor-pointer ${isExpanded ? 'border-b border-[var(--border-light)]' : ''}`}
                  onClick={() => toggleExpand(entity.id)}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                    isExpanded ? 'bg-[var(--accent)] text-white' : 'bg-black/40 text-[var(--text-secondary)] group-hover:bg-[var(--accent)] group-hover:text-white'
                  }`}>
                    <config.icon size={18} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {entity.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
                      <span className={isExpanded ? 'text-[var(--accent)] font-bold' : config.color}>{entity.type}</span>
                      <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2">
                    {/* Left Column */}
                    <div className="space-y-6">
                      <div className="bg-black/20 p-5 rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Mentions</h4>
                        <div className="flex items-end justify-between">
                          <span className="text-3xl font-bold">{entity.mention_count}</span>
                          <div className="text-right">
                             <p className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">First seen</p>
                             <p className="text-xs font-medium">{formatRelativeTime(entity.first_mentioned_at)}</p>
                          </div>
                        </div>
                      </div>
                      
                      <button 
                        onClick={() => handleEntitySynthesis(entity.id, entity.type)}
                        className="w-full flex items-center justify-between px-5 py-4 rounded-2xl bg-[var(--accent)] text-white font-bold text-[10px] uppercase tracking-widest shadow-xl shadow-[var(--accent)]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                      >
                        Synthesize Insights
                        <Sparkles size={14} />
                      </button>
                    </div>

                    {/* Right Column: Appearances */}
                    <div className="lg:col-span-2 space-y-4">
                       <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] mb-4">Appearances</h4>
                       
                       {loadingMentions ? (
                         <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                            <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Loading...</span>
                         </div>
                       ) : mentions.map((mention) => (
                         <div key={mention.id} className="group/item flex gap-5 bg-black/20 p-5 rounded-2xl border border-white/[0.03] hover:border-[var(--accent)]/30 transition-all">
                            <div className="flex flex-col items-center gap-2 pt-1">
                               <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                               <div className="w-0.5 flex-1 bg-white/5" />
                            </div>
                            <div className="flex-1 space-y-3">
                               <p className="text-sm text-[var(--text-secondary)] italic border-l-2 border-white/5 pl-4">"{mention.context}"</p>
                               <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest font-bold">
                                  <span>{mention.video_uploads?.file_name || mention.log_entries?.title}</span>
                                  <Link href={`#`} className="text-[var(--accent)] flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                    Source <ArrowRight size={12} />
                                  </Link>
                               </div>
                            </div>
                         </div>
                       ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
