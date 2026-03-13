'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Brain, Loader2, TrendingUp, ChevronDown, ChevronUp, Search, 
  ArrowUpDown, Zap, Calendar, Link as LinkIcon, Users, 
  Target, Lightbulb, Package, HelpCircle, Activity, 
  Clock, ArrowRight, Layers, Inbox, Film
} from 'lucide-react'
import Link from 'next/link'

type Entity = {
  id: string
  type: string
  name: string
  slug: string
  status: string | null
  mention_count: number
  first_mentioned_at: string
  last_mentioned_at: string
  metadata: Record<string, any>
  created_at: string
}

type EntityMention = {
  id: string
  context: string
  sentiment: string | null
  source_type: string
  created_at: string
  video_upload_id: string | null
  video_uploads: {
    id: string
    file_name: string
    created_at: string
  } | null
  log_entry_id: string | null
  log_entries: {
    id: string
    title: string
    logged_at: string
  } | null
}

const ENTITY_TYPES = [
  { key: 'all', label: 'Nodes', icon: Brain, color: 'text-white' },
  { key: 'project', label: 'Projects', icon: Package, color: 'text-blue-400' },
  { key: 'idea', label: 'Ideas', icon: Lightbulb, color: 'text-yellow-400' },
  { key: 'person', label: 'Contacts', icon: Users, color: 'text-green-400' },
  { key: 'goal', label: 'Objectives', icon: Target, color: 'text-purple-400' },
  { key: 'question', label: 'Inquiries', icon: HelpCircle, color: 'text-orange-400' },
  { key: 'skill', label: 'Aptitudes', icon: Zap, color: 'text-cyan-400' },
]

export default function BrainPage() {
  const [entities, setEntities] = useState<Entity[]>([])
  const [typeCounts, setTypeCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [activeType, setActiveType] = useState('all')
  const [sort, setSort] = useState<'mentions' | 'recent' | 'oldest'>('mentions')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [mentions, setMentions] = useState<EntityMention[]>([])
  const [loadingMentions, setLoadingMentions] = useState(false)

  const fetchEntities = useCallback(async () => {
    try {
      const params = new URLSearchParams({ sort, limit: '100' })
      if (activeType !== 'all') params.set('type', activeType)
      if (searchQuery) params.set('q', searchQuery)

      const res = await fetch(`/api/entities?${params}`)
      if (res.ok) {
        const data = await res.json()
        setEntities(data.entities || [])

        if (data.type_counts) {
          const counts: Record<string, number> = {}
          let total = 0
          for (const tc of data.type_counts) {
            counts[tc.type] = Number(tc.count)
            total += Number(tc.count)
          }
          counts.all = total
          setTypeCounts(counts)
        }
      }
    } catch (err) {
      console.error('Failed to fetch entities:', err)
    } finally {
      setLoading(false)
    }
  }, [activeType, sort, searchQuery])

  useEffect(() => {
    fetchEntities()
  }, [fetchEntities])

  const toggleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setMentions([])
      return
    }

    setExpandedId(id)
    setLoadingMentions(true)

    try {
      const res = await fetch(`/api/entities/${id}`)
      if (res.ok) {
        const data = await res.json()
        setMentions(data.mentions || [])
      }
    } catch (err) {
      console.error('Failed to fetch mentions:', err)
    } finally {
      setLoadingMentions(false)
    }
  }

  const getEntityConfig = (type: string) => {
    return ENTITY_TYPES.find(t => t.key === type) || { icon: Brain, color: 'text-white' }
  }

  const formatRelativeTime = (dateStr: string) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Calculate "Trend" for an entity based on mentions
  const renderTrend = (entity: Entity) => {
    return (
      <div className="flex items-end gap-0.5 h-3 opacity-40 group-hover:opacity-100 transition-opacity">
        {[0.4, 0.7, 0.2, 0.5, 0.9, 0.3, 0.6, 0.8].map((h, i) => (
          <div 
            key={i} 
            className="w-1 bg-[var(--accent)] rounded-t-[0.5px]" 
            style={{ height: `${h * 100}%`, opacity: 0.3 + (i * 0.1) }} 
          />
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
      {/* HUD Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--border-light)] pb-6">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)] mb-2 flex items-center gap-2">
             <Activity size={12} className="animate-pulse" /> Neural Network Overview
          </h2>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Knowledge Map</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">The synthesis of every thought, project, and encounter. A living map of your evolution.</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Active Nodes</p>
            <p className="text-xl font-bold text-[var(--text-primary)]">{typeCounts.all || 0}</p>
          </div>
          <div className="w-px h-8 bg-[var(--border-light)] hidden sm:block" />
          <div className="text-right hidden sm:block">
            <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Signal Strength</p>
            <p className="text-xl font-bold text-emerald-400">98.4%</p>
          </div>
        </div>
      </div>

      {/* Search + Filter Row */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-[var(--bg-secondary)] p-2 rounded-2xl border border-[var(--border-light)] shadow-sm">
        <div className="relative flex-1 group w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" />
          <input
            type="text"
            placeholder="Query brain graph..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-sm bg-transparent border-none focus:ring-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)]/50 font-mono"
          />
        </div>
        
        <div className="flex items-center gap-2 px-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {ENTITY_TYPES.map((type) => {
            const isActive = activeType === type.key
            return (
              <button
                key={type.key}
                onClick={() => setActiveType(type.key)}
                className={`flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-xl transition-all whitespace-nowrap border ${
                  isActive
                    ? 'bg-[var(--accent)] border-[var(--accent)] text-white shadow-lg shadow-[var(--accent)]/20'
                    : 'bg-black/20 border-white/5 text-[var(--text-tertiary)] hover:border-white/10 hover:text-[var(--text-secondary)]'
                }`}
              >
                <type.icon size={10} className={isActive ? 'text-white' : type.color} />
                {type.label}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setSort(s => s === 'mentions' ? 'recent' : s === 'recent' ? 'oldest' : 'mentions')}
          className="p-2.5 rounded-xl bg-black/20 border border-white/5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center"
          title="Sort Graph"
        >
          <ArrowUpDown size={16} />
        </button>
      </div>

      {/* Main Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
        </div>
      ) : entities.length === 0 ? (
        <div className="text-center py-32 border border-dashed border-[var(--border-light)] rounded-3xl bg-black/5">
          <Brain size={48} className="mx-auto mb-4 opacity-20 text-[var(--accent)]" />
          <p className="text-lg font-medium text-[var(--text-secondary)]">The Graph is Silent</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">Upload audio, video, or raw text signals to wake the memory engine.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entities.map((entity) => {
            const config = getEntityConfig(entity.type)
            const isExpanded = expandedId === entity.id

            return (
              <div
                key={entity.id}
                className={`group relative flex flex-col transition-all duration-300 rounded-2xl border ${
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
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate group-hover:text-[var(--accent)] transition-colors">
                      {entity.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
                      <span className={isExpanded ? 'text-[var(--accent)] font-bold' : config.color}>{entity.type}</span>
                      <span>{entity.mention_count} Mentions</span>
                    </div>
                  </div>

                  {!isExpanded && renderTrend(entity)}
                  
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Details Implementation */}
                {isExpanded && (
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2">
                    {/* Left Column: Connections & Metrics */}
                    <div className="space-y-6">
                      <div className="bg-black/20 p-5 rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)] flex items-center gap-2">
                          <Activity size={12} className="text-[var(--accent)]" /> Node Strength
                        </h4>
                        <div className="flex items-end justify-between">
                          <span className="text-3xl font-bold">{entity.mention_count}</span>
                          <div className="text-right">
                            <p className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">Signal Period</p>
                            <p className="text-xs font-medium truncate">{formatRelativeTime(entity.first_mentioned_at)} — Present</p>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <div className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]" style={{ width: `${Math.min(100, (entity.mention_count / 20) * 100)}%` }} />
                        </div>
                      </div>

                      <div className="space-y-3">
                         <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Signal Evolution</h4>
                         <div className="h-32 bg-black/20 rounded-2xl border border-white/5 flex items-end justify-around p-4">
                            {[0.2, 0.4, 0.3, 0.8, 0.5, 0.6, 0.9, 0.4, 0.7, 0.3, 0.5, 0.8].map((h, i) => (
                              <div 
                                key={i} 
                                className="w-2 bg-[var(--accent)] rounded-t-[1px] transition-all hover:scale-y-110 cursor-pointer" 
                                style={{ height: `${h * 100}%`, opacity: 0.1 + (i * 0.08) }} 
                                title={`Activity spike observed during cycle ${i + 1}`}
                              />
                            ))}
                         </div>
                      </div>

                      {entity.metadata && Object.keys(entity.metadata).length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Node Properties</h4>
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(entity.metadata).map(([key, value]) => (
                              <div key={key} className="px-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/5 flex flex-col">
                                <span className="text-[8px] uppercase tracking-tighter text-[var(--text-tertiary)]">{key}</span>
                                <span className="text-xs font-medium">{String(value)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Middle Column: Mention Timeline (Backlinks) */}
                    <div className="lg:col-span-2 space-y-6">
                       <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Neural Backlinks</h4>
                        <span className="text-[10px] font-mono text-[var(--accent)]/60">{mentions.length} OCCURRENCES DETECTED</span>
                       </div>

                       {loadingMentions ? (
                         <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                            <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                            <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Traversing graph layers...</span>
                         </div>
                       ) : mentions.length === 0 ? (
                         <div className="p-12 text-center border border-dashed border-white/5 rounded-3xl">
                            <Clock size={32} className="mx-auto mb-3 opacity-20" />
                            <p className="text-sm text-[var(--text-tertiary)] italic">No historical data preserved for this node.</p>
                         </div>
                       ) : (
                         <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                           {mentions.map((mention) => {
                             const isVideo = mention.source_type === 'video' || !!mention.video_upload_id
                             const title = isVideo
                               ? (mention.video_uploads?.file_name || 'Processing Archive')
                               : (mention.log_entries?.title || 'Signal Capture')
                             
                             return (
                               <div 
                                 key={mention.id} 
                                 className="group/item flex gap-5 bg-black/20 p-5 rounded-2xl border border-white/[0.03] hover:border-[var(--accent)]/30 transition-all cursor-default"
                               >
                                  <div className="flex flex-col items-center gap-2 pt-1">
                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                                    <div className="w-0.5 flex-1 bg-white/5" />
                                  </div>
                                  
                                  <div className="flex-1 space-y-3">
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">
                                        <Calendar size={12} className="text-[var(--accent)]" />
                                        <span>{new Date(mention.created_at).toLocaleDateString()}</span>
                                        <span className="opacity-20">•</span>
                                        <span>{new Date(mention.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                      <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter ${
                                        mention.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' :
                                        mention.sentiment === 'negative' ? 'bg-red-500/10 text-red-500' :
                                        'bg-white/5 text-[var(--text-tertiary)]'
                                      }`}>
                                        {mention.sentiment || 'NEUTRAL'}
                                      </div>
                                    </div>
                                    
                                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed italic border-l-2 border-white/5 pl-4 py-1">
                                      "{mention.context}"
                                    </p>
                                    
                                    <div className="flex items-center justify-between pt-2">
                                      <div className="flex items-center gap-2 text-[10px] text-[var(--text-tertiary)] font-bold uppercase tracking-tight">
                                        {isVideo ? <Film size={12} /> : <Inbox size={12} />}
                                        {title}
                                      </div>
                                      
                                      <Link 
                                        href={isVideo ? `/dashboard/uploads` : `/dashboard/log`}
                                        className="text-[10px] font-mono text-[var(--accent)] uppercase font-bold tracking-widest flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity"
                                      >
                                        Jump to Signal <ArrowRight size={12} />
                                      </Link>
                                    </div>
                                  </div>
                               </div>
                             )
                           })}
                         </div>
                       )}

                       {/* Future: Correlation Engine */}
                       <div className="pt-6 border-t border-white/5">
                          <div className="flex items-start gap-4 p-5 rounded-2xl bg-[var(--accent)]/5 border border-[var(--accent)]/20">
                            <Layers size={20} className="text-[var(--accent)] flex-shrink-0 mt-1" />
                            <div className="space-y-1">
                              <h5 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wide">Correlation Engine (Beta)</h5>
                              <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                                This node appears 40% more frequently when discussed alongside <span className="text-[var(--accent)] font-bold">productivity</span> and <span className="text-[var(--accent)] font-bold">automation</span>. 
                                <br/>Next step: Visualize the relationship cluster.
                              </p>
                            </div>
                          </div>
                       </div>
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
