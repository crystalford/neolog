'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown } from 'lucide-react'

// ─── Types ───────────────────────────────────────────────────────────────────

export type LogEntry = {
  id: string
  entry_type: string
  title: string
  body?: string | null
  logged_at: string
  software_tags?: string[]
  cost_delta?: number | null
  asset?: { id: string; name: string; category: string; image_url?: string | null } | null
  thumbnail_url?: string | null
  source_upload_id?: string | null
  is_public: boolean
  meta?: Record<string, any>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function reltime(dateStr: string) {
  const d = new Date(dateStr)
  if (isToday(d)) return format(d, 'h:mm a')
  if (isYesterday(d)) return 'Yesterday · ' + format(d, 'h:mm a')
  return format(d, 'h:mm a')
}

function fulltime(dateStr: string) {
  return format(new Date(dateStr), 'MMM d, yyyy · h:mm a')
}

const TYPE_ICON: Record<string, typeof Video> = {
  session: Video,
  capture: Mic,
}

const TYPE_LABEL: Record<string, string> = {
  session: 'Video',
  capture: 'Note',
}

const MOOD_COLORS: Record<string, string> = {
  frustrated: 'bg-red-500/10 text-red-400 border-red-500/20',
  anxious: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  excited: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  calm: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  motivated: 'bg-green-500/10 text-green-400 border-green-500/20',
  scattered: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  focused: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
}

function MoodChip({ mood }: { mood: string }) {
  const words = mood.toLowerCase().split(/[,\s]+/).filter(Boolean).slice(0, 2)
  return (
    <>
      {words.map(w => {
        const cls = MOOD_COLORS[w] || 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border-light)]'
        return (
          <span key={w} className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${cls}`}>
            {w}
          </span>
        )
      })}
    </>
  )
}

// ─── Main Card ───────────────────────────────────────────────────────────────

interface LogCardProps {
  entry: LogEntry
  username?: string
  showPrivacyBadge?: boolean
  isPublicView?: boolean
}

export function LogCard({ entry, username, showPrivacyBadge, isPublicView }: LogCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const thumbnail = entry.thumbnail_url || entry.asset?.image_url
  const TypeIcon = TYPE_ICON[entry.entry_type] || FileText
  const typeLabel = TYPE_LABEL[entry.entry_type] || 'Entry'
  const hasDetails = !!(entry.body && entry.body.trim().length > 0)
  const cleanBody = entry.body
    ?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '')
    .replace(/\nMood:.*$/m, '')
    .trim()

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this log entry?')) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/log-entries/${entry.id}`, { method: 'DELETE' })
      if (res.ok) window.location.reload()
    } catch {}
    finally { setIsDeleting(false) }
  }

  return (
    <article className="group relative border-b border-[var(--border-light)] last:border-b-0">

      {/* Main card row */}
      <div
        className={`flex items-stretch transition-colors ${hasDetails ? 'cursor-pointer hover:bg-[var(--bg-secondary)]/30' : 'hover:bg-[var(--bg-secondary)]/10'}`}
        onClick={() => hasDetails && setExpanded(e => !e)}
      >
        {/* Thumbnail - flush left, portrait crop */}
        {thumbnail && (
          <div className="flex-shrink-0 w-[88px] overflow-hidden border-r border-[var(--border-light)] bg-[var(--bg-secondary)]">
            <img
              src={thumbnail}
              alt=""
              className="w-full h-full object-cover"
              style={{ minHeight: '68px' }}
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">

              {/* Type + timestamp row */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <TypeIcon size={9} className="text-[var(--text-tertiary)] flex-shrink-0" />
                <span className="text-[10px] font-mono text-[var(--text-tertiary)] uppercase tracking-wider">
                  {typeLabel}
                </span>
                <span className="text-[var(--border-medium)] text-[10px]">·</span>
                <time
                  className="text-[10px] font-mono text-[var(--text-tertiary)]"
                  title={fulltime(entry.logged_at)}
                >
                  {reltime(entry.logged_at)}
                </time>
                {showPrivacyBadge && !entry.is_public && (
                  <>
                    <span className="text-[var(--border-medium)] text-[10px]">·</span>
                    <span className="text-[9px] font-mono text-red-400/60 uppercase tracking-wider">private</span>
                  </>
                )}
              </div>

              {/* Title — the main thing */}
              <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug">
                {entry.title}
              </p>

            </div>

            {/* Controls — appear on hover */}
            <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
              {!isPublicView && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(e) }}
                  disabled={isDeleting}
                  className="opacity-0 group-hover:opacity-30 hover:!opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-red-400 p-1.5 rounded"
                >
                  {isDeleting ? <Loader2 size={11} className="animate-spin" /> : <Trash2 size={11} />}
                </button>
              )}
              {hasDetails && (
                <button
                  onClick={e => { e.stopPropagation(); setExpanded(v => !v) }}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 transition-opacity text-[var(--text-tertiary)] p-1.5 rounded"
                >
                  <ChevronDown size={13} className={`transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded details — AI analysis, mood, energy, reflections */}
      {expanded && (
        <div
          className="border-t border-[var(--border-light)] bg-[var(--bg-secondary)]/20 px-4 py-4"
          style={{ paddingLeft: thumbnail ? 'calc(88px + 1rem)' : '1rem' }}
        >
          {cleanBody && (
            <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-3">
              {cleanBody}
            </p>
          )}

          {entry.meta?.reflections && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/15 text-[12px] text-[var(--text-secondary)] leading-relaxed">
              <Sparkles size={10} className="inline mr-1.5 text-[var(--accent)] mb-0.5" />
              {entry.meta.reflections}
            </div>
          )}

          {(entry.meta?.mood || entry.meta?.energy) && (
            <div className="flex items-center gap-2 flex-wrap">
              {entry.meta?.mood && <MoodChip mood={entry.meta.mood} />}
              {entry.meta?.energy && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20">
                  {entry.meta.energy} energy
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  )
}
