'use client'export const runtime = 'edge'


import { useState, useEffect, useCallback } from 'react'
import {
  Network, Loader2, ChevronDown, ChevronUp, Search,
  ArrowUpDown, Calendar, Users,
  Target, Lightbulb, Package,
  Clock, ArrowRight, Inbox, Film,
  GitBranch, Heart, FileText
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
  { key: 'all',      label: 'All',       icon: Network,   color: 'text-white' },
  { key: 'project',  label: 'Projects',  icon: Package,   color: 'text-blue-400' },
  { key: 'idea',     label: 'Ideas',     icon: Lightbulb, color: 'text-yellow-400' },
  { key: 'person',   label: 'People',    icon: Users,     color: 'text-green-400' },
  { key: 'goal',     label: 'Goals',     icon: Target,    color: 'text-purple-400' },
  { key: 'decision', label: 'Decisions', icon: GitBranch, color: 'text-amber-400' },
  { key: 'value',    label: 'Values',    icon: Heart,     color: 'text-pink-400' },
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
    return ENTITY_TYPES.find(t => t.key === type) || { icon: Network, color: 'text-white' }
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

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 md:py-12 space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 border-b border-[var(--border-light)] pb-6">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--accent)] mb-2">
            Knowledge Graph
          </h2>
          <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Entities</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            Everything extracted from your uploads — people, projects, ideas, goals, and more.
          </p>
        </div>

        <div className="text-right hidden sm:block">
          <p className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-widest">Total</p>
          <p className="text-xl font-bold text-[var(--text-primary)]">{typeCounts.all || 0}</p>
        </div>
      </div>

      {/* Search + Filter Row */}
      <div className="flex flex-col sm:flex-row items-center gap-4 bg-[var(--bg-secondary)] p-2 rounded-2xl border border-[var(--border-light)] shadow-sm">
        <div className="relative flex-1 group w-full">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] group-focus-within:text-[var(--accent)] transition-colors" />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 text-sm bg-transparent border-none focus:ring-0 text-[var(--text-primary)] placeholder-[var(--text-tertiary)]/50"
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
                {typeCounts[type.key] !== undefined && (
                  <span className={`text-[9px] ${isActive ? 'opacity-70' : 'opacity-40'}`}>
                    {typeCounts[type.key]}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={() => setSort(s => s === 'mentions' ? 'recent' : s === 'recent' ? 'oldest' : 'mentions')}
          className="p-2.5 rounded-xl bg-black/20 border border-white/5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all flex items-center justify-center"
          title={`Sort: ${sort}`}
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
          <Network size={48} className="mx-auto mb-4 opacity-20 text-[var(--accent)]" />
          <p className="text-lg font-medium text-[var(--text-secondary)]">Nothing here yet</p>
          <p className="text-sm text-[var(--text-tertiary)] mt-2">
            Upload videos and entities will be extracted automatically.
          </p>
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
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
                      {entity.name}
                    </h3>
                    <div className="flex items-center gap-3 mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-tight">
                      <span className={isExpanded ? 'text-[var(--accent)] font-bold' : config.color}>{entity.type}</span>
                      <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {entity.type === 'project' && (
                    <Link
                      href={`/dashboard/projects/${entity.slug}`}
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] border border-[var(--border-light)] hover:border-[var(--accent)]/50 hover:text-[var(--accent)] transition-all flex-shrink-0"
                      title="View project document"
                    >
                      <FileText size={9} />
                      Doc
                    </Link>
                  )}

                  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in slide-in-from-top-2">
                    {/* Left Column */}
                    <div className="space-y-6">
                      <div className="bg-black/20 p-5 rounded-2xl border border-white/5 space-y-4">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                          Mentions
                        </h4>
                        <div className="flex items-end justify-between">
                          <span className="text-3xl font-bold">{entity.mention_count}</span>
                          <div className="text-right">
                            <p className="text-[9px] text-[var(--text-tertiary)] uppercase font-bold">First seen</p>
                            <p className="text-xs font-medium">{formatRelativeTime(entity.first_mentioned_at)}</p>
                          </div>
                        </div>
                        <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[var(--accent)] shadow-[0_0_10px_var(--accent)]"
                            style={{ width: `${Math.min(100, (entity.mention_count / 20) * 100)}%` }}
                          />
                        </div>
                      </div>

                      {entity.metadata && Object.keys(entity.metadata).length > 0 && (
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Details</h4>
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

                    {/* Right Column: Appearances */}
                    <div className="lg:col-span-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-mono font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Appearances</h4>
                        <span className="text-[10px] font-mono text-[var(--accent)]/60">{mentions.length} total</span>
                      </div>

                      {loadingMentions ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                          <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                          <span className="text-[10px] font-mono uppercase tracking-[0.2em]">Loading...</span>
                        </div>
                      ) : mentions.length === 0 ? (
                        <div className="p-12 text-center border border-dashed border-white/5 rounded-3xl">
                          <Clock size={32} className="mx-auto mb-3 opacity-20" />
                          <p className="text-sm text-[var(--text-tertiary)]">No appearances yet.</p>
                        </div>
                      ) : (
                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
                          {mentions.map((mention) => {
                            const isVideo = mention.source_type === 'video' || !!mention.video_upload_id
                            const title = isVideo
                              ? (mention.video_uploads?.file_name || 'Unknown file')
                              : (mention.log_entries?.title || 'Log entry')

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
                                      <span className="opacity-20">·</span>
                                      <span>{new Date(mention.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                    </div>
                                    {mention.sentiment && (
                                      <div className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tighter ${
                                        mention.sentiment === 'positive' ? 'bg-emerald-500/10 text-emerald-400' :
                                        mention.sentiment === 'negative' ? 'bg-red-500/10 text-red-500' :
                                        'bg-white/5 text-[var(--text-tertiary)]'
                                      }`}>
                                        {mention.sentiment}
                                      </div>
                                    )}
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
                                      View source <ArrowRight size={12} />
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )}
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
