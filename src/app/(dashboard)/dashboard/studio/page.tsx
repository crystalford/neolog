'use client'export const runtime = 'edge'


import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ContentDraft } from '@/types/database'
import {
  Mic, FileText, Hash, Clock, Loader2, CheckCircle2,
  Archive, Copy, Check, ChevronDown, ChevronUp, Sparkles,
  Eye, ArrowRight,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMinutes(secs: number | null) {
  if (!secs) return null
  const m = Math.round(secs / 60)
  return `~${m} min`
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const FORMAT_LABELS: Record<string, string> = {
  video_essay: 'Video Essay',
  article: 'Article',
  thread: 'Thread',
}

const SOURCE_LABELS: Record<string, string> = {
  strong_opinion: 'Strong take',
  idea: 'Idea',
  key_win: 'Key insight',
  synthesis: 'Cross-session',
}

const STATUS_COLORS: Record<string, string> = {
  generating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  draft: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  ready: 'bg-green-500/15 text-green-400 border-green-500/20',
  archived: 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] border-[var(--border-light)]',
}

// ── Draft card ────────────────────────────────────────────────────────────────

function DraftCard({ draft, onStatusChange }: {
  draft: ContentDraft
  onStatusChange: (id: string, status: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(draft.body)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isGenerating = draft.status === 'generating'

  return (
    <div className={`rounded-xl border border-[var(--border-light)] bg-[var(--bg-secondary)] overflow-hidden transition-all ${draft.status === 'archived' ? 'opacity-50' : ''}`}>
      {/* Card header */}
      <div className="p-5">
        {/* Top row: format + status + date */}
        <div className="flex items-center gap-2 mb-3">
          <span className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[var(--accent)] bg-[var(--accent-soft)] px-2 py-0.5 rounded">
            <Mic size={9} />
            {FORMAT_LABELS[draft.format] || draft.format}
          </span>
          {draft.source_type && (
            <span className="text-[10px] font-mono text-[var(--text-tertiary)] bg-[var(--bg-tertiary)]/50 px-2 py-0.5 rounded">
              from {SOURCE_LABELS[draft.source_type] || draft.source_type}
            </span>
          )}
          <span className={`ml-auto text-[10px] font-mono px-2 py-0.5 rounded border ${STATUS_COLORS[draft.status] || STATUS_COLORS.draft}`}>
            {isGenerating ? (
              <span className="flex items-center gap-1"><Loader2 size={8} className="animate-spin" /> Writing...</span>
            ) : draft.status}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-tight mb-2">
          {draft.title}
        </h3>

        {/* Hook preview */}
        {draft.hook && !isGenerating && (
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2 italic">
            "{draft.hook}"
          </p>
        )}

        {/* Meta row */}
        {!isGenerating && (
          <div className="flex items-center gap-3 mt-3 text-[10px] text-[var(--text-tertiary)] font-mono">
            {draft.word_count && (
              <span className="flex items-center gap-1">
                <FileText size={9} />
                {draft.word_count} words
              </span>
            )}
            {draft.estimated_duration_seconds && (
              <span className="flex items-center gap-1">
                <Clock size={9} />
                {formatMinutes(draft.estimated_duration_seconds)}
              </span>
            )}
            <span className="ml-auto">{formatDate(draft.created_at)}</span>
          </div>
        )}

        {/* Action row */}
        {!isGenerating && (
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <Eye size={11} />
              {expanded ? 'Collapse' : 'Read script'}
              {expanded ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>

            <div className="ml-auto flex items-center gap-2">
              {draft.status === 'draft' && (
                <button
                  onClick={() => onStatusChange(draft.id, 'ready')}
                  className="flex items-center gap-1 text-[10px] font-mono text-green-400 hover:text-green-300 px-2 py-1 rounded border border-green-500/20 bg-green-500/8 transition-colors"
                >
                  <CheckCircle2 size={10} />
                  Mark ready
                </button>
              )}
              {draft.status === 'ready' && (
                <button
                  onClick={() => onStatusChange(draft.id, 'draft')}
                  className="text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  Back to draft
                </button>
              )}
              {draft.status !== 'archived' && (
                <button
                  onClick={() => onStatusChange(draft.id, 'archived')}
                  className="flex items-center gap-1 text-[10px] font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <Archive size={10} />
                  Archive
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Expanded script */}
      {expanded && draft.body && (
        <div className="border-t border-[var(--border-light)]">
          <div className="flex items-center justify-between px-5 py-3 bg-[var(--bg-tertiary)]/30">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">
              Teleprompter script
            </span>
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-[11px] text-[var(--accent)] hover:opacity-70 transition-opacity"
            >
              {copied ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy all</>}
            </button>
          </div>
          <div className="px-5 py-5">
            <p className="text-sm text-[var(--text-primary)] leading-[1.85] whitespace-pre-wrap font-mono">
              {draft.body}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

type FilterTab = 'all' | 'ready' | 'draft' | 'archived'

export default function StudioPage() {
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const supabase = createClient()

  useEffect(() => {
    loadDrafts()
    // Poll while any drafts are generating
    const interval = setInterval(() => {
      if (drafts.some(d => d.status === 'generating')) loadDrafts()
    }, 8000)
    return () => clearInterval(interval)
  }, [drafts.some(d => d.status === 'generating')])

  async function loadDrafts() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('content_drafts')
      .select('*')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(100)

    setDrafts((data as ContentDraft[]) || [])
    setLoading(false)
  }

  async function handleStatusChange(id: string, status: string) {
    await supabase.from('content_drafts').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: status as any } : d))
  }

  const filtered = drafts.filter(d => {
    if (activeTab === 'all') return d.status !== 'archived'
    return d.status === activeTab
  })

  const counts = {
    all: drafts.filter(d => d.status !== 'archived').length,
    ready: drafts.filter(d => d.status === 'ready').length,
    draft: drafts.filter(d => d.status === 'draft').length,
    archived: drafts.filter(d => d.status === 'archived').length,
  }

  const generatingCount = drafts.filter(d => d.status === 'generating').length

  if (loading) return (
    <div className="p-8 text-[var(--text-tertiary)] font-mono text-xs uppercase tracking-widest animate-pulse">
      Loading...
    </div>
  )

  return (
    <div className="max-w-3xl mx-auto px-6 py-8 pb-32 space-y-6">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Mic size={16} className="text-[var(--accent)]" />
          <h1 className="text-lg font-semibold text-[var(--text-primary)]">Studio</h1>
          {generatingCount > 0 && (
            <span className="flex items-center gap-1.5 text-[11px] text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full">
              <Loader2 size={10} className="animate-spin" />
              {generatingCount} writing...
            </span>
          )}
        </div>
        <p className="text-xs text-[var(--text-tertiary)] ml-7">
          Video essay scripts generated from your recordings — ready to read verbatim
        </p>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1">
        {(['all', 'ready', 'draft', 'archived'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab
                ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
            }`}
          >
            {tab === 'ready' && <CheckCircle2 size={10} className="text-green-400" />}
            <span className="capitalize">{tab}</span>
            {counts[tab] > 0 && (
              <span className="text-[10px] opacity-60">{counts[tab]}</span>
            )}
          </button>
        ))}
      </div>

      {/* Draft list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-light)] border-dashed bg-[var(--bg-secondary)]/30 p-12 text-center">
          <Sparkles size={28} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-30" />
          {drafts.length === 0 ? (
            <>
              <p className="text-sm text-[var(--text-tertiary)] mb-1">No scripts yet</p>
              <p className="text-xs text-[var(--text-tertiary)] opacity-60 max-w-sm mx-auto">
                Scripts are generated automatically when you upload recordings. Strong opinions and high-confidence ideas become full video essay scripts.
              </p>
            </>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">Nothing in {activeTab}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(draft => (
            <DraftCard key={draft.id} draft={draft} onStatusChange={handleStatusChange} />
          ))}
        </div>
      )}
    </div>
  )
}
