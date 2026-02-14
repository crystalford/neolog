'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Lightbulb, FolderOpen, Users, Target, HelpCircle,
  Zap, CheckCircle2, AlertTriangle, BookOpen, Loader2,
  TrendingUp, ChevronDown, ChevronUp, Search, ArrowUpDown,
} from 'lucide-react'

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
  created_at: string
  video_upload_id: string
  video_uploads: {
    id: string
    file_name: string
    created_at: string
  } | null
}

const ENTITY_TYPES = [
  { key: 'all', label: 'All', icon: Brain },
  { key: 'project', label: 'Projects', icon: FolderOpen },
  { key: 'idea', label: 'Ideas', icon: Lightbulb },
  { key: 'person', label: 'People', icon: Users },
  { key: 'goal', label: 'Goals', icon: Target },
  { key: 'question', label: 'Questions', icon: HelpCircle },
  { key: 'habit', label: 'Habits', icon: Zap },
  { key: 'commitment', label: 'Commitments', icon: CheckCircle2 },
  { key: 'skill', label: 'Skills', icon: BookOpen },
  { key: 'blocker', label: 'Blockers', icon: AlertTriangle },
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

  const typeIcon = (type: string) => {
    const config = ENTITY_TYPES.find(t => t.key === type)
    return config?.icon || Brain
  }

  const typeColor = (type: string) => {
    const colors: Record<string, string> = {
      project: 'text-blue-400',
      idea: 'text-yellow-400',
      person: 'text-green-400',
      goal: 'text-purple-400',
      question: 'text-orange-400',
      habit: 'text-teal-400',
      commitment: 'text-pink-400',
      skill: 'text-cyan-400',
      blocker: 'text-red-400',
      topic: 'text-indigo-400',
    }
    return colors[type] || 'text-[var(--text-tertiary)]'
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / (1000 * 60))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="max-w-5xl mx-auto px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h2 className="text-2xl font-display font-bold text-[var(--text-primary)] mb-2 flex items-center gap-3">
          <Brain size={28} className="text-[var(--accent)]" />
          Brain
        </h2>
        <p className="text-[var(--text-secondary)]">
          Your accumulated intelligence across all recordings. Every idea, project, person, and question — tracked and growing over time.
        </p>
      </div>

      {/* Search + Sort */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search entities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-lg text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
          />
        </div>
        <button
          onClick={() => setSort(s => s === 'mentions' ? 'recent' : s === 'recent' ? 'oldest' : 'mentions')}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[var(--bg-card)] border border-[var(--border-medium)] rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
        >
          <ArrowUpDown size={14} />
          {sort === 'mentions' ? 'Most mentioned' : sort === 'recent' ? 'Most recent' : 'Oldest first'}
        </button>
      </div>

      {/* Type Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {ENTITY_TYPES.map((type) => {
          const Icon = type.icon
          const count = typeCounts[type.key] || 0
          const isActive = activeType === type.key

          return (
            <button
              key={type.key}
              onClick={() => setActiveType(type.key)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/20'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
              }`}
            >
              <Icon size={13} />
              {type.label}
              {count > 0 && (
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                  isActive ? 'bg-[var(--accent)]/20' : 'bg-[var(--bg-tertiary)]'
                }`}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Entity List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : entities.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-tertiary)]">
          <Brain size={40} className="mx-auto mb-3 opacity-50" />
          <p className="font-medium">No entities yet</p>
          <p className="text-sm mt-1">Upload and process recordings to start building your knowledge graph</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entities.map((entity) => {
            const Icon = typeIcon(entity.type)
            const isExpanded = expandedId === entity.id

            return (
              <div
                key={entity.id}
                className="border border-[var(--border-medium)] rounded-xl bg-[var(--bg-card)] overflow-hidden"
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-[var(--bg-tertiary)] transition-colors"
                  onClick={() => toggleExpand(entity.id)}
                >
                  <Icon size={16} className={typeColor(entity.type)} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--text-primary)] truncate">
                      {entity.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] capitalize">
                        {entity.type}
                      </span>
                      {entity.status && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-400/10 text-blue-400 capitalize">
                          {entity.status}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Mention count */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <TrendingUp size={12} className="text-[var(--text-tertiary)]" />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">
                      {entity.mention_count}x
                    </span>
                  </div>

                  {/* Recency */}
                  <span className="text-[10px] text-[var(--text-tertiary)] flex-shrink-0 hidden sm:block">
                    {formatRelativeTime(entity.last_mentioned_at)}
                  </span>

                  <button className="p-1 text-[var(--text-tertiary)]">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {/* Expanded: mention timeline */}
                {isExpanded && (
                  <div className="border-t border-[var(--border-light)] px-4 py-4">
                    {loadingMentions ? (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" />
                      </div>
                    ) : mentions.length === 0 ? (
                      <p className="text-xs text-[var(--text-tertiary)]">No mentions found</p>
                    ) : (
                      <div className="space-y-3">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                          Mention Timeline ({mentions.length} recording{mentions.length !== 1 ? 's' : ''})
                        </h4>
                        {mentions.map((mention) => (
                          <div
                            key={mention.id}
                            className="flex items-start gap-3 border-l-2 border-[var(--border-medium)] pl-3"
                          >
                            <div className="flex-1">
                              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                                {mention.context}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                {mention.sentiment && (
                                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                                    mention.sentiment === 'positive' ? 'bg-green-400/10 text-green-400' :
                                    mention.sentiment === 'negative' ? 'bg-red-400/10 text-red-400' :
                                    'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                                  }`}>
                                    {mention.sentiment}
                                  </span>
                                )}
                                <span className="text-[10px] text-[var(--text-tertiary)]">
                                  {mention.video_uploads?.file_name || 'Recording'}
                                </span>
                                <span className="text-[10px] text-[var(--text-tertiary)]">
                                  {formatRelativeTime(mention.created_at)}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Entity metadata */}
                    {entity.metadata && Object.keys(entity.metadata).length > 0 && (
                      <div className="mt-4 pt-3 border-t border-[var(--border-light)]">
                        <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                          Details
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(entity.metadata).map(([key, value]) => (
                            <span
                              key={key}
                              className="text-[10px] px-2 py-1 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                            >
                              {key}: {String(value)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="mt-3 pt-3 border-t border-[var(--border-light)] flex items-center gap-4 text-[10px] text-[var(--text-tertiary)]">
                      <span>First seen: {new Date(entity.first_mentioned_at).toLocaleDateString()}</span>
                      <span>Last seen: {new Date(entity.last_mentioned_at).toLocaleDateString()}</span>
                      <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
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
