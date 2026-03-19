'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  RefreshCw, CheckSquare, Square, ChevronDown, ChevronUp,
  ArrowLeft, Code2, BookOpen, Palette, Briefcase, User, HelpCircle,
  ExternalLink, Clock, Download, GitBranch, CheckCircle2, XCircle, ArrowRightLeft,
  Sparkles, Plus
} from 'lucide-react'
import type {
  ProjectDocument, ProjectDocumentType,
  ProjectDocumentDecision, ProjectDocumentActionItem, ProjectDocumentRoadmapItem
} from '@/types/database'

const PROJECT_TYPES: { value: ProjectDocumentType; label: string; icon: any }[] = [
  { value: 'tech',     label: 'Tech',     icon: Code2 },
  { value: 'book',     label: 'Book',     icon: BookOpen },
  { value: 'creative', label: 'Creative', icon: Palette },
  { value: 'business', label: 'Business', icon: Briefcase },
  { value: 'personal', label: 'Personal', icon: User },
  { value: 'other',    label: 'Other',    icon: HelpCircle },
]

type Mention = {
  id: string
  context: string
  full_context: string | null
  sentiment: string | null
  created_at: string
  source_type: string
  video_upload_id: string | null
  video_uploads: { id: string; file_name: string; recorded_at: string | null; created_at: string; duration_seconds: number | null } | null
}

type PageData = {
  entity: {
    id: string; name: string; slug: string; status: string | null
    mention_count: number; first_mentioned_at: string | null; last_mentioned_at: string | null
    metadata: any
  }
  document: ProjectDocument | null
  mentions: Mention[]
}

export default function ProjectDocPage({ params }: { params: { slug: string } }) {
  const { slug } = params
  const [data, setData] = useState<PageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [synthesizing, setSynthesizing] = useState(false)
  const [expandedMentions, setExpandedMentions] = useState<Set<string>>(new Set())
  const [projectType, setProjectType] = useState<ProjectDocumentType>('tech')
  const [manualNotes, setManualNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const [delta, setDelta] = useState<any | null>(null)
  const [deltaOpen, setDeltaOpen] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch(`/api/project-documents/${slug}`)
    if (res.ok) {
      const d: PageData = await res.json()
      setData(d)
      setProjectType((d.document?.project_type as ProjectDocumentType) || d.entity.metadata?.project_type || 'tech')
      setManualNotes(d.document?.manual_notes || '')
      // Load delta (best-effort, may 404 if no history yet)
      if (d.document) {
        fetch(`/api/project-documents/${slug}/delta`)
          .then(r => r.ok ? r.json() : null)
          .then(d => { if (d?.has_changes) setDelta(d) })
          .catch(() => {})
      }
    }
    setLoading(false)
  }, [slug])

  useEffect(() => { load() }, [load])

  const handleSynthesize = async () => {
    setSynthesizing(true)
    await fetch(`/api/project-documents/${slug}/synthesize`, { method: 'POST' })
    // Poll until document appears / updates (simple approach: wait then reload)
    setTimeout(() => {
      setSynthesizing(false)
      load()
    }, 12000)
  }

  const handleTypeChange = async (type: ProjectDocumentType) => {
    setProjectType(type)
    await fetch(`/api/project-documents/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_type: type }),
    })
  }

  const handleNotesChange = (val: string) => {
    setManualNotes(val)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingNotes(false)
    saveTimer.current = setTimeout(async () => {
      setSavingNotes(true)
      await fetch(`/api/project-documents/${slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_notes: val }),
      })
      setSavingNotes(false)
    }, 1200)
  }

  const handleExport = async (format: 'markdown' | 'linear' | 'notion') => {
    setExportOpen(false)
    const res = await fetch(`/api/project-documents/${slug}/export?format=${format}`)
    if (!res.ok) return
    const text = await res.text()
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-${format}.${format === 'linear' ? 'csv' : 'md'}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const toggleMention = (id: string) => {
    setExpandedMentions(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
        <div className="h-8 w-48 skeleton rounded" />
        <div className="h-32 skeleton rounded-xl" />
        <div className="h-48 skeleton rounded-xl" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-[var(--text-tertiary)] text-sm">Project not found.</p>
      </div>
    )
  }

  const { entity, document: doc, mentions } = data
  const isTech = projectType === 'tech' || projectType === 'business'
  const isNarrative = projectType === 'book' || projectType === 'creative'

  const formatDate = (d: string | null) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const formatTimestamp = (secs: number) => {
    const m = Math.floor(secs / 60)
    const s = Math.floor(secs % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">

      {/* Back link */}
      <Link href="/dashboard/projects" className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-40 hover:opacity-80 mb-6 transition-opacity">
        <ArrowLeft size={11} /> Projects
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-medium text-[var(--text-primary)] tracking-tight mb-2">{entity.name}</h1>
          <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--text-tertiary)] opacity-40">
            <span>{entity.mention_count} mention{entity.mention_count !== 1 ? 's' : ''}</span>
            {entity.first_mentioned_at && <span>since {formatDate(entity.first_mentioned_at)}</span>}
            {entity.last_mentioned_at && <span>last {formatDate(entity.last_mentioned_at)}</span>}
            {entity.status && entity.status !== 'mentioned' && <span className="uppercase">{entity.status}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Export */}
          {doc && (
            <div className="relative">
              <button
                onClick={() => setExportOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-light)] text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)] transition-all"
              >
                <Download size={11} />
                Export
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-1 w-40 bg-[var(--bg-card)] border border-[var(--border-light)] rounded-lg shadow-xl z-20 overflow-hidden">
                  {(['markdown', 'notion', 'linear'] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => handleExport(fmt)}
                      className="w-full text-left px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {fmt === 'markdown' ? 'Markdown' : fmt === 'notion' ? 'Notion paste' : 'Linear CSV'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Regenerate */}
          <button
            onClick={handleSynthesize}
            disabled={synthesizing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--border-light)] text-[10px] font-mono uppercase tracking-widest text-[var(--text-secondary)] hover:border-[var(--border-medium)] hover:text-[var(--text-primary)] disabled:opacity-40 transition-all"
          >
            <RefreshCw size={11} className={synthesizing ? 'animate-spin' : ''} />
            {synthesizing ? 'Generating…' : doc ? 'Regenerate' : 'Generate Doc'}
          </button>
        </div>
      </div>

      {/* Project type selector */}
      <div className="flex items-center gap-1 mb-8 pb-4 border-b border-[var(--border-light)]">
        <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-30 mr-2">Type</span>
        {PROJECT_TYPES.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.value}
              onClick={() => handleTypeChange(t.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-mono uppercase tracking-widest transition-all ${
                projectType === t.value
                  ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)] border border-[var(--border-light)]'
                  : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
              }`}
            >
              <Icon size={10} />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* No doc yet */}
      {!doc && !synthesizing && (
        <div className="py-16 text-center border border-dashed border-[var(--border-light)] rounded-xl mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-40 mb-2">No document yet</p>
          <p className="text-xs text-[var(--text-tertiary)] opacity-30">
            {entity.mention_count === 0
              ? 'No discussions recorded yet. Upload a video and mention this project.'
              : `${entity.mention_count} session${entity.mention_count !== 1 ? 's' : ''} captured. Click "Generate Doc" to synthesize.`}
          </p>
        </div>
      )}

      {synthesizing && (
        <div className="py-8 space-y-4 mb-8">
          {[1, 2, 3].map(i => <div key={i} className="h-28 skeleton rounded-xl" />)}
        </div>
      )}

      {/* ── Document sections ── */}
      {doc && !synthesizing && (
        <div className="space-y-5 mb-8">

          {/* Overview */}
          {doc.overview && (
            <Section label="Overview">
              <p className="text-[15px] leading-[1.85] text-[var(--text-secondary)] font-light">{doc.overview}</p>
            </Section>
          )}

          {/* Origin Story */}
          {doc.origin_story && (
            <Section label="Origin Story">
              <p className="text-[14px] leading-[1.85] text-[var(--text-secondary)] font-light italic">{doc.origin_story}</p>
            </Section>
          )}

          {/* Narrative Overview (book/creative) */}
          {isNarrative && doc.narrative_overview && (
            <Section label="Narrative Arc">
              <p className="text-[14px] leading-[1.85] text-[var(--text-secondary)] font-light">{doc.narrative_overview}</p>
            </Section>
          )}

          {/* Technical Notes (tech/business) */}
          {isTech && doc.technical_notes && (
            <Section label="Technical Notes">
              <p className="text-[13px] leading-[1.85] text-[var(--text-secondary)] font-light font-mono whitespace-pre-wrap">{doc.technical_notes}</p>
            </Section>
          )}

          {/* Decisions Log */}
          {doc.decisions_log?.length > 0 && (
            <Section label={`Decisions (${doc.decisions_log.length})`}>
              <div className="space-y-4">
                {(doc.decisions_log as ProjectDocumentDecision[]).map((d, i) => {
                  const statusColor =
                    d.status === 'implemented' ? 'bg-emerald-500/10 text-emerald-400' :
                    d.status === 'reversed'    ? 'bg-red-500/10 text-red-400' :
                    d.status === 'superseded'  ? 'bg-yellow-500/10 text-yellow-400' :
                    'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                  const StatusIcon =
                    d.status === 'implemented' ? CheckCircle2 :
                    d.status === 'reversed'    ? XCircle :
                    d.status === 'superseded'  ? ArrowRightLeft :
                    GitBranch
                  return (
                    <div key={i} className={`border-l-2 pl-4 ${d.status === 'reversed' ? 'border-red-500/30 opacity-60' : 'border-[var(--border-light)]'}`}>
                      <div className="flex items-start gap-2 mb-1">
                        <p className="text-[14px] font-medium text-[var(--text-primary)] flex-1">{d.decision}</p>
                        {d.status && (
                          <span className={`flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm flex-shrink-0 ${statusColor}`}>
                            <StatusIcon size={9} />
                            {d.status}
                          </span>
                        )}
                      </div>
                      {d.reasoning && <p className="text-[12px] text-[var(--text-tertiary)] leading-relaxed">{d.reasoning}</p>}
                      {d.lifecycle_note && (
                        <p className="text-[11px] text-[var(--text-tertiary)] italic mt-1 opacity-70">{d.lifecycle_note}</p>
                      )}
                      <div className="flex items-center gap-3 mt-1">
                        {d.date && <p className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-30">{d.date}</p>}
                        {d.source_upload_id && d.source_timestamp_seconds != null && (
                          <Link
                            href={`/dashboard/timeline/${d.source_upload_id}?t=${Math.floor(d.source_timestamp_seconds)}`}
                            className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-30 hover:opacity-80 hover:text-[var(--accent)] transition-all flex items-center gap-1"
                          >
                            <Clock size={9} />
                            {formatTimestamp(d.source_timestamp_seconds)}
                          </Link>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Section>
          )}

          {/* Action Items */}
          {doc.action_items?.length > 0 && (
            <Section label={`Action Items (${doc.action_items.filter((a: ProjectDocumentActionItem) => a.status === 'open').length} open)`}>
              <div className="space-y-2">
                {(doc.action_items as ProjectDocumentActionItem[]).map((a, i) => (
                  <div key={i} className={`flex items-start gap-3 ${a.status === 'done' ? 'opacity-40' : ''}`}>
                    {a.status === 'done'
                      ? <CheckSquare size={14} className="flex-shrink-0 mt-0.5 text-emerald-500" />
                      : <Square size={14} className="flex-shrink-0 mt-0.5 text-[var(--text-tertiary)] opacity-40" />
                    }
                    <div className="flex-1 min-w-0">
                      <span className={`text-[13px] leading-relaxed ${a.status === 'done' ? 'line-through text-[var(--text-tertiary)]' : 'text-[var(--text-secondary)]'}`}>{a.item}</span>
                      {a.source_upload_id && a.source_timestamp_seconds != null && (
                        <Link
                          href={`/dashboard/timeline/${a.source_upload_id}?t=${Math.floor(a.source_timestamp_seconds)}`}
                          className="ml-2 text-[10px] font-mono text-[var(--text-tertiary)] opacity-30 hover:opacity-80 hover:text-[var(--accent)] transition-all inline-flex items-center gap-1"
                        >
                          <Clock size={9} />
                          {formatTimestamp(a.source_timestamp_seconds)}
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Roadmap */}
          {doc.roadmap?.length > 0 && (
            <Section label="Roadmap">
              <div className="space-y-2">
                {(doc.roadmap as ProjectDocumentRoadmapItem[]).map((r, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-sm flex-shrink-0 ${
                      r.priority === 'high' ? 'bg-red-500/10 text-red-400' :
                      r.priority === 'medium' ? 'bg-yellow-500/10 text-yellow-400' :
                      'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                    }`}>{r.priority}</span>
                    <span className={`text-[13px] leading-relaxed flex-1 ${r.status === 'done' ? 'line-through text-[var(--text-tertiary)] opacity-40' : 'text-[var(--text-secondary)]'}`}>{r.item}</span>
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 uppercase flex-shrink-0">{r.status}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Delta: what changed since last synthesis */}
          {delta && (
            <div className="rounded-xl border border-[var(--accent)]/20 bg-[var(--accent)]/[0.04] overflow-hidden">
              <button
                onClick={() => setDeltaOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-[var(--accent)]" />
                  <span className="text-[11px] font-mono uppercase tracking-widest text-[var(--accent)]">
                    What changed — {delta.changes.length} update{delta.changes.length !== 1 ? 's' : ''} since last synthesis
                  </span>
                </div>
                {deltaOpen ? <ChevronUp size={12} className="text-[var(--accent)]" /> : <ChevronDown size={12} className="text-[var(--accent)]" />}
              </button>
              {deltaOpen && (
                <div className="px-5 pb-5 space-y-2 border-t border-[var(--accent)]/10 pt-4">
                  {delta.changes.map((c: any, i: number) => {
                    if (c.type === 'new_decision') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <Plus size={11} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Decision</span>{c.decision.decision}</span>
                      </div>
                    )
                    if (c.type === 'decision_status') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <ArrowRightLeft size={11} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Decision</span>{c.decision.decision} <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{c.prev_status} → {c.decision.status}</span></span>
                      </div>
                    )
                    if (c.type === 'new_action_item') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <Plus size={11} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Action</span>{c.item.item}</span>
                      </div>
                    )
                    if (c.type === 'action_item_done') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <CheckCircle2 size={11} className="text-emerald-400 mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Done</span>{c.item.item}</span>
                      </div>
                    )
                    if (c.type === 'new_roadmap_item') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <Plus size={11} className="text-[var(--accent)] mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Roadmap</span>{c.item.item}</span>
                      </div>
                    )
                    if (c.type === 'roadmap_status') return (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                        <ArrowRightLeft size={11} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                        <span><span className="text-[var(--text-tertiary)] font-mono uppercase text-[9px] mr-1.5">Roadmap</span>{c.item.item} <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{c.prev_status} → {c.item.status}</span></span>
                      </div>
                    )
                    return null
                  })}
                  {delta.snapshot_date && (
                    <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 pt-2">
                      vs. synthesis on {formatDate(delta.snapshot_date)} ({delta.snapshot_mention_count} session{delta.snapshot_mention_count !== 1 ? 's' : ''})
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Synthesis meta */}
          {doc.last_synthesized_at && (
            <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-20 text-right">
              Synthesized {formatDate(doc.last_synthesized_at)} · {doc.synthesis_model} · {doc.mention_count_at_synthesis} session{doc.mention_count_at_synthesis !== 1 ? 's' : ''}
            </p>
          )}
        </div>
      )}

      {/* ── Manual Notes ── */}
      <Section label="Your Notes">
        <textarea
          value={manualNotes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="Add anything the AI missed — context, links, personal notes. This persists across regenerations."
          className="w-full min-h-[120px] bg-transparent text-[13px] text-[var(--text-secondary)] leading-relaxed resize-none outline-none placeholder:text-[var(--text-tertiary)] placeholder:opacity-30"
        />
        {savingNotes && <p className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 mt-1">Saving…</p>}
      </Section>

      {/* ── Session Timeline ── */}
      {mentions.length > 0 && (
        <div className="mt-8">
          <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-40 mb-4">
            Session Timeline · {mentions.length} recording{mentions.length !== 1 ? 's' : ''}
          </p>
          <div className="space-y-2">
            {mentions.map(m => {
              const source = m.video_uploads
              const date = source?.recorded_at || source?.created_at || m.created_at
              const dateStr = new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              const isExpanded = expandedMentions.has(m.id)
              const hasFullContext = !!m.full_context

              return (
                <div key={m.id} className="border border-[var(--border-light)] rounded-xl overflow-hidden">
                  {/* Header row */}
                  <button
                    onClick={() => toggleMention(m.id)}
                    className="w-full flex items-center justify-between gap-3 px-5 py-3 text-left hover:bg-[var(--bg-secondary)] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Clock size={11} className="flex-shrink-0 text-[var(--text-tertiary)] opacity-30" />
                      <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-50 flex-shrink-0">{dateStr}</span>
                      {source && (
                        <span className="text-[10px] text-[var(--text-tertiary)] opacity-30 truncate">{source.file_name}</span>
                      )}
                      {!hasFullContext && (
                        <span className="text-[8px] font-mono text-[var(--text-tertiary)] opacity-20 uppercase tracking-widest">brief</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {source && m.video_upload_id && (
                        <Link
                          href={`/dashboard/timeline/${m.video_upload_id}`}
                          onClick={e => e.stopPropagation()}
                          className="text-[var(--text-tertiary)] opacity-20 hover:opacity-60 transition-opacity"
                        >
                          <ExternalLink size={10} />
                        </Link>
                      )}
                      {isExpanded ? <ChevronUp size={12} className="opacity-30" /> : <ChevronDown size={12} className="opacity-30" />}
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-[var(--border-light)]">
                      {m.full_context ? (
                        <p className="text-[13px] leading-[1.85] text-[var(--text-secondary)] font-light mt-4">{m.full_context}</p>
                      ) : (
                        <p className="text-[13px] leading-[1.85] text-[var(--text-secondary)] font-light mt-4 opacity-60 italic">{m.context}</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="p-6 border border-[var(--border-light)] rounded-xl bg-[var(--bg-card)]">
      <p className="text-[9px] font-mono uppercase tracking-[0.3em] text-[var(--text-tertiary)] opacity-40 mb-4">{label}</p>
      {children}
    </div>
  )
}
