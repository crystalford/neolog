"use client"

import { useEffect, useState } from 'react'
import { QuickCaptureModal } from '@/components/QuickCaptureModal'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Plus, Search, Filter, Trash2, Tag, Archive, PenLine, 
  Link as LinkIcon, Image, Quote, Code, FileText, Zap,
  Globe, Rss, ChevronDown, MoreHorizontal, ArrowRight
} from 'lucide-react'

interface Capture {
  id: string
  title: string | null
  content: string
  type: string
  source_platform: string | null
  source_url: string | null
  tags: string[]
  created_at: string
  processed: boolean // true = in vault, false = in inbox
}

const typeIcons: Record<string, typeof LinkIcon> = {
  link: LinkIcon,
  image: Image,
  quote: Quote,
  code: Code,
  text: FileText,
  prompt: Zap,
}

export default function CapturesPage() {
  const [captures, setCaptures] = useState<Capture[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [captureModalOpen, setCaptureModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'inbox' | 'vault' | 'sources'>('all')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { capabilities } = useUserMaturity(userId)

  useEffect(() => {
    loadCaptures()
  }, [])

  const loadCaptures = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)

    const { data } = await supabase
      .from('vault_assets')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    setCaptures((data || []).map(item => ({
      ...item,
      processed: item.tags && item.tags.length > 0,
    })))
    setLoading(false)
  }

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} capture${ids.length > 1 ? 's' : ''}?`)) return

    await supabase
      .from('vault_assets')
      .delete()
      .in('id', ids)

    setCaptures(prev => prev.filter(c => !ids.includes(c.id)))
    setSelectedIds([])
  }

  const handleStartDraft = (capture: Capture) => {
    router.push(`/write?from_capture=${capture.id}`)
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const filteredCaptures = captures.filter(c => {
    if (activeTab === 'inbox' && c.processed) return false
    if (activeTab === 'vault' && !c.processed) return false
    if (activeTab === 'sources') return false

    if (typeFilter && c.type !== typeFilter) return false

    if (search) {
      const q = search.toLowerCase()
      const matchesTitle = (c.title || '').toLowerCase().includes(q)
      const matchesContent = (c.content || '').toLowerCase().includes(q)
      const matchesTags = c.tags?.some(t => t.toLowerCase().includes(q))
      if (!matchesTitle && !matchesContent && !matchesTags) return false
    }
    return true
  })

  const inboxCount = captures.filter(c => !c.processed).length
  const vaultCount = captures.filter(c => c.processed).length

  if (loading) {
    return (
      <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-12 skeleton rounded-2xl" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 skeleton rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  if (activeTab === 'sources') {
    return (
      <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-[var(--text-primary)]">Captures</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Everything you've saved. The raw material library.</p>
          </div>
          <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary btn-sm">
            <Plus size={16} />
            Add Capture
          </button>
        </div>

        <div className="rounded-2xl border border-[var(--border-light)] bg-[var(--bg-primary)] p-8 text-center">
          <Globe size={32} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">Configure Sources</h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md mx-auto">Add RSS feeds, social profiles, or monitors to automatically capture content.</p>
          <Link href="/sources" className="btn btn-secondary">
            <Rss size={16} />
            Manage Sources
          </Link>
        </div>
      </main>
    )
  }

  return (
    <>
      <QuickCaptureModal isOpen={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">Captures</h1>
            <p className="text-base text-[var(--text-secondary)] mt-2">Everything you've saved. The raw material library.</p>
          </div>
          <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
            <Plus size={18} />
            Add Capture
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-2 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-8 w-fit">
          {[
            { id: 'all', label: 'All', count: captures.length },
            { id: 'inbox', label: 'Inbox', count: inboxCount },
            { id: 'vault', label: 'Vault', count: vaultCount },
            ...(capabilities.showSourcesMonitors ? [{ id: 'sources', label: 'Sources', count: null }] : []),
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`px-5 py-2 rounded-xl text-base font-medium transition-colors ${activeTab === tab.id ? 'bg-white/90 text-[var(--text-primary)] shadow' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'}`}>
              {tab.label}
              {tab.count !== null && <span className="ml-2 text-xs text-[var(--text-tertiary)] font-normal">{tab.count}</span>}
            </button>
          ))}
        </div>

        {/* Search & Filters */}
        <div className="flex gap-4 mb-8">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input type="text" placeholder="Search captures..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border-light)] bg-white/80 text-base focus:outline-none focus:border-[var(--accent)] shadow" />
          </div>
          <button onClick={() => setShowFilters(!showFilters)} className={`btn btn-secondary text-base px-5 py-3 font-medium ${showFilters ? 'bg-[var(--bg-tertiary)]' : ''}`}>
            <Filter size={18} />
            Filters
            <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Filter Drawer */}
        {showFilters && (
          <div className="mb-8 p-5 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
            <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">Type</p>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setTypeFilter(null)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${!typeFilter ? 'bg-[var(--accent)] text-white shadow' : 'bg-white/80 text-[var(--text-secondary)] border border-[var(--border-light)]'}`}>All types</button>
              {['link', 'image', 'quote', 'code', 'text', 'prompt'].map(type => (
                <button key={type} onClick={() => setTypeFilter(type)} className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors capitalize ${typeFilter === type ? 'bg-[var(--accent)] text-white shadow' : 'bg-white/80 text-[var(--text-secondary)] border border-[var(--border-light)]'}`}>{type}</button>
              ))}
            </div>
          </div>
        )}

        {/* Bulk Actions */}
        {selectedIds.length > 0 && (
          <div className="mb-6 p-4 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] flex items-center justify-between shadow">
            <span className="text-base text-[var(--text-secondary)]">{selectedIds.length} selected</span>
            <div className="flex gap-3">
              <button onClick={() => handleDelete(selectedIds)} className="btn btn-secondary text-base px-5 py-3 font-medium text-[var(--error)]"><Trash2 size={16} />Delete</button>
              <button onClick={() => setSelectedIds([])} className="btn btn-secondary text-base px-5 py-3 font-medium">Clear</button>
            </div>
          </div>
        )}

        {/* Captures List */}
        {filteredCaptures.length > 0 ? (
          <div className="space-y-3">
            {filteredCaptures.map((capture, i) => {
              const Icon = typeIcons[capture.type] || FileText
              const isSelected = selectedIds.includes(capture.id)

              return (
                <div key={capture.id} className={`group p-5 rounded-2xl border transition-colors shadow ${isSelected ? 'border-[var(--accent)] bg-[var(--accent)]/10' : `border-[var(--border-light)] bg-white/90 hover:border-[var(--accent)] ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : ''}`}`}>
                  <div className="flex items-start gap-4">
                    <input type="checkbox" checked={isSelected} onChange={(e) => {
                      if (e.target.checked) setSelectedIds([...selectedIds, capture.id])
                      else setSelectedIds(selectedIds.filter(id => id !== capture.id))
                    }} className="mt-1 w-5 h-5 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]" />

                    <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0"><Icon size={20} className="text-[var(--text-secondary)]" /></span>

                    <div className="flex-1 min-w-0">
                      <p className="text-base font-medium text-[var(--text-primary)] truncate">{capture.title || capture.content.slice(0, 60)}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-tertiary)]">
                        <span className="capitalize">{capture.type}</span>
                        {capture.source_platform && (<><span>·</span><span>{capture.source_platform}</span></>)}
                        <span>·</span>
                        <span>{formatRelativeTime(capture.created_at)}</span>
                      </div>
                      {capture.tags && capture.tags.length > 0 && (
                        <div className="flex gap-2 mt-2">
                          {capture.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="px-3 py-1 rounded-full bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] font-medium">#{tag}</span>
                          ))}
                          {capture.tags.length > 3 && (<span className="text-[11px] text-[var(--text-tertiary)] font-medium">+{capture.tags.length - 3}</span>)}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleStartDraft(capture)} className="p-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" title="Start draft from this"><PenLine size={18} /></button>
                      <button className="p-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" title="More options"><MoreHorizontal size={18} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-16 text-center shadow">
            <Archive size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
            <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">{search ? 'No matches found' : 'Nothing captured yet'}</h2>
            <p className="text-base text-[var(--text-secondary)] mb-6">{search ? 'Try a different search term or clear filters.' : 'Ideas are everywhere. Start capturing.'}</p>
            {!search && (
              <button onClick={() => setCaptureModalOpen(true)} className="btn btn-primary text-lg px-6 py-3 font-semibold">
                <Zap size={18} />
                Capture your first idea
              </button>
            )}
          </div>
        )}
      </main>
    </>
  )
}
'use client'

import { useEffect, useState } from 'react'
import { QuickCaptureModal } from '@/components/QuickCaptureModal'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useUserMaturity } from '@/hooks/useUserMaturity'
import {
  Plus, Search, Filter, Trash2, Tag, Archive, PenLine, 
  Link as LinkIcon, Image, Quote, Code, FileText, Zap,
  Globe, Rss, ChevronDown, MoreHorizontal, ArrowRight
} from 'lucide-react'

interface Capture {
  id: string
  title: string | null
  content: string
  type: string
  source_platform: string | null
  source_url: string | null
  tags: string[]
  created_at: string
  processed: boolean // true = in vault, false = in inbox
}

const typeIcons: Record<string, typeof LinkIcon> = {
  link: LinkIcon,
  image: Image,
  quote: Quote,
  code: Code,
  text: FileText,
  prompt: Zap,
}

  const [captures, setCaptures] = useState<Capture[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [captureModalOpen, setCaptureModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'inbox' | 'vault' | 'sources'>('all')
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()
  const { capabilities } = useUserMaturity(userId)

  useEffect(() => {
    loadCaptures()
  }, [])

  const loadCaptures = async () => {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      router.push('/login')
      return
    }

    setUserId(session.user.id)

    const { data } = await supabase
      .from('vault_assets')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })

    setCaptures((data || []).map(item => ({
      ...item,
      processed: item.tags && item.tags.length > 0, // Simple heuristic: tagged = processed
    })))
    setLoading(false)
  }

  const handleDelete = async (ids: string[]) => {
    if (!confirm(`Delete ${ids.length} capture${ids.length > 1 ? 's' : ''}?`)) return

    await supabase
      .from('vault_assets')
      .delete()
      .in('id', ids)

    setCaptures(prev => prev.filter(c => !ids.includes(c.id)))
    setSelectedIds([])
  }

  const handleStartDraft = (capture: Capture) => {
    // Navigate to write page with capture reference
    router.push(`/write?from_capture=${capture.id}`)
  }

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  // Filter captures
  const filteredCaptures = captures.filter(c => {
    // Tab filter
    if (activeTab === 'inbox' && c.processed) return false
    if (activeTab === 'vault' && !c.processed) return false
    if (activeTab === 'sources') return false // Handled separately
    
    // Type filter
    if (typeFilter && c.type !== typeFilter) return false
    
    // Search filter
    if (search) {
      const q = search.toLowerCase()
      const matchesTitle = (c.title || '').toLowerCase().includes(q)
      const matchesContent = (c.content || '').toLowerCase().includes(q)
      const matchesTags = c.tags?.some(t => t.toLowerCase().includes(q))
      if (!matchesTitle && !matchesContent && !matchesTags) return false
    }
    
    return true
  })

  const inboxCount = captures.filter(c => !c.processed).length
  const vaultCount = captures.filter(c => c.processed).length

  if (loading) {
    return (
      <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
        <div className="animate-pulse space-y-8">
          <div className="h-8 w-48 skeleton rounded" />
          <div className="h-12 skeleton rounded-2xl" />
          <div className="space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-20 skeleton rounded-2xl" />
            ))}
          </div>
        </div>
      </main>
    )
  }

  // Sources tab content
  if (activeTab === 'sources') {
    return (
      <main className="px-6 lg:px-8 py-8 max-w-5xl mx-auto animate-fade-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl text-[var(--text-primary)]">Captures</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Everything you've saved. The raw material library.
            </p>
          </div>
          <button
            onClick={() => {/* Open capture modal */}}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            Add Capture
          <button
            onClick={() => setCaptureModalOpen(true)}
            className="btn btn-primary btn-sm"
          >
            <Plus size={16} />
            Add Capture
          </button>
            { id: 'inbox', label: 'Inbox', count: inboxCount },
            { id: 'vault', label: 'Vault', count: vaultCount },
            ...(capabilities.showSourcesMonitors ? [{ id: 'sources', label: 'Sources', count: null }] : []),
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'bg-[var(--bg-primary)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {tab.label}
              {tab.count !== null && (
                <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">
                  {tab.count}
                </span>
              )}
            <button
              onClick={() => setCaptureModalOpen(true)}
              className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            >
              <Plus size={18} />
              Add Capture
            </button>
          <h2 className="font-display text-lg text-[var(--text-primary)] mb-2">
            Configure Sources
          </h2>
          <p className="text-sm text-[var(--text-secondary)] mb-4 max-w-md mx-auto">
            Add RSS feeds, social profiles, or monitors to automatically capture content.
          </p>
          <Link href="/sources" className="btn btn-secondary">
            <Rss size={16} />
            Manage Sources
          </Link>
        </div>
      </main>
    )
  }

  return (
    <>
      <QuickCaptureModal isOpen={captureModalOpen} onClose={() => setCaptureModalOpen(false)} />
      <main className="px-8 py-10 max-w-5xl mx-auto animate-fade-up bg-gradient-to-b from-[var(--bg-primary)] to-[var(--bg-secondary)] min-h-screen">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="font-display text-3xl font-bold text-[var(--text-primary)] tracking-tight">Captures</h1>
          <p className="text-base text-[var(--text-secondary)] mt-2">Everything you've saved. The raw material library.</p>
        </div>
        <button
          onClick={() => {/* Open capture modal */}}
          className="btn btn-primary text-lg px-6 py-3 font-semibold shadow-md focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        >
          <Plus size={18} />
          Add Capture
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 p-2 rounded-2xl bg-[var(--bg-secondary)] border border-[var(--border-light)] mb-8 w-fit">
        {[
          { id: 'all', label: 'All', count: captures.length },
          { id: 'inbox', label: 'Inbox', count: inboxCount },
          { id: 'vault', label: 'Vault', count: vaultCount },
          ...(capabilities.showSourcesMonitors ? [{ id: 'sources', label: 'Sources', count: null }] : []),
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-5 py-2 rounded-xl text-base font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white/90 text-[var(--text-primary)] shadow'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            {tab.label}
            {tab.count !== null && (
              <span className="ml-2 text-xs text-[var(--text-tertiary)] font-normal">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex gap-4 mb-8">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search captures..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-[var(--border-light)] bg-white/80 text-base focus:outline-none focus:border-[var(--accent)] shadow"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`btn btn-secondary text-base px-5 py-3 font-medium ${showFilters ? 'bg-[var(--bg-tertiary)]' : ''}`}
        >
          <Filter size={18} />
          Filters
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Filter Drawer */}
      {showFilters && (
        <div className="mb-8 p-5 rounded-2xl border border-[var(--border-light)] bg-[var(--bg-secondary)]">
          <p className="text-xs uppercase tracking-[0.15em] text-[var(--text-tertiary)] mb-3">Type</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setTypeFilter(null)}
              className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors ${
                !typeFilter
                  ? 'bg-[var(--accent)] text-white shadow'
                  : 'bg-white/80 text-[var(--text-secondary)] border border-[var(--border-light)]'
              }`}
            >
              All types
            </button>
            {['link', 'image', 'quote', 'code', 'text', 'prompt'].map(type => (
              <button
                key={type}
                onClick={() => setTypeFilter(type)}
                className={`px-4 py-2 rounded-xl text-xs font-medium transition-colors capitalize ${
                  typeFilter === type
                    ? 'bg-[var(--accent)] text-white shadow'
                    : 'bg-white/80 text-[var(--text-secondary)] border border-[var(--border-light)]'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bulk Actions */}
      {selectedIds.length > 0 && (
        <div className="mb-6 p-4 rounded-2xl bg-[var(--bg-tertiary)] border border-[var(--border-light)] flex items-center justify-between shadow">
          <span className="text-base text-[var(--text-secondary)]">
            {selectedIds.length} selected
          </span>
          <div className="flex gap-3">
            <button
              onClick={() => handleDelete(selectedIds)}
              className="btn btn-secondary text-base px-5 py-3 font-medium text-[var(--error)]"
            >
              <Trash2 size={16} />
              Delete
            </button>
            <button
              onClick={() => setSelectedIds([])}
              className="btn btn-secondary text-base px-5 py-3 font-medium"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Captures List */}
      {filteredCaptures.length > 0 ? (
        <div className="space-y-3">
          {filteredCaptures.map((capture, i) => {
            const Icon = typeIcons[capture.type] || FileText
            const isSelected = selectedIds.includes(capture.id)

            return (
              <div
                key={capture.id}
                className={`group p-5 rounded-2xl border transition-colors shadow ${
                  isSelected
                    ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                    : `border-[var(--border-light)] bg-white/90 hover:border-[var(--accent)] ${i % 2 === 1 ? 'bg-[var(--bg-secondary)]/40' : ''}`
                }`}
              >
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds([...selectedIds, capture.id])
                      } else {
                        setSelectedIds(selectedIds.filter(id => id !== capture.id))
                      }
                    }}
                    className="mt-1 w-5 h-5 rounded border-[var(--border-medium)] text-[var(--accent)] focus:ring-[var(--accent)]"
                  />

                  {/* Icon */}
                  <span className="flex items-center justify-center w-12 h-12 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0">
                    <Icon size={20} className="text-[var(--text-secondary)]" />
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-medium text-[var(--text-primary)] truncate">
                      {capture.title || capture.content.slice(0, 60)}
                    </p>
                    <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-tertiary)]">
                      <span className="capitalize">{capture.type}</span>
                      {capture.source_platform && (
                        <>
                          <span>·</span>
                          <span>{capture.source_platform}</span>
                        </>
                      )}
                      <span>·</span>
                      <span>{formatRelativeTime(capture.created_at)}</span>
                    </div>
                    {capture.tags && capture.tags.length > 0 && (
                      <div className="flex gap-2 mt-2">
                        {capture.tags.slice(0, 3).map(tag => (
                          <span
                            key={tag}
                            className="px-3 py-1 rounded-full bg-[var(--bg-tertiary)] text-[11px] text-[var(--text-secondary)] font-medium"
                          >
                            #{tag}
                          </span>
                        ))}
                        {capture.tags.length > 3 && (
                          <span className="text-[11px] text-[var(--text-tertiary)] font-medium">
                            +{capture.tags.length - 3}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartDraft(capture)}
                      className="p-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      title="Start draft from this"
                    >
                      <PenLine size={18} />
                    </button>
                    <button
                      className="p-3 rounded-xl text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      title="More options"
                    >
                      <MoreHorizontal size={18} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-light)] bg-white/70 p-16 text-center shadow">
          <Archive size={36} className="mx-auto text-[var(--text-tertiary)] mb-4" />
          <h2 className="font-display text-xl text-[var(--text-primary)] mb-2 font-semibold">
            {search ? 'No matches found' : 'Nothing captured yet'}
          </h2>
          <p className="text-base text-[var(--text-secondary)] mb-6">
            {search 
              ? 'Try a different search term or clear filters.'
              : 'Ideas are everywhere. Start capturing.'}
          </p>
          {!search && (
            <button className="btn btn-primary text-lg px-6 py-3 font-semibold">
              <Zap size={18} />
              Capture your first idea
            </button>
          )}
        </div>
      )}
    </main>
      </main>
    </>
  )
}
