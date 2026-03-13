'use client'

import { useState } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, ExternalLink, Sparkles } from 'lucide-react'

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
  if (isYesterday(d)) return 'Yesterday'
  return format(d, 'MMM d')
}

function fulltime(dateStr: string) {
  return format(new Date(dateStr), 'MMM d, yyyy · h:mm a')
}

const TYPE_ICON: Record<string, typeof Video> = {
  session: Video,
  capture: Mic,
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

  const thumbnail = entry.thumbnail_url || entry.asset?.image_url
  const TypeIcon = TYPE_ICON[entry.entry_type] || FileText
  const hasOpenDetail = !!entry.source_upload_id

  // Link to full detail view in uploads (auto-expands that upload)
  const detailHref = hasOpenDetail
    ? `/dashboard/uploads?id=${entry.source_upload_id}`
    : null

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
    <article className="group relative px-4 py-4 hover:bg-[var(--bg-secondary)]/40 transition-colors border-b border-[var(--border-light)] last:border-b-0">
      <div className="flex gap-3">

        {/* Type icon indicator */}
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-8 h-8 rounded-full bg-[var(--bg-secondary)] border border-[var(--border-light)] flex items-center justify-center">
            <TypeIcon size={13} className="text-[var(--text-tertiary)]" />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* Header: title + timestamp */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-snug line-clamp-2">
              {entry.title}
            </p>
            <time
              title={fulltime(entry.logged_at)}
              className="flex-shrink-0 text-[11px] text-[var(--text-tertiary)] mt-0.5 font-mono"
            >
              {reltime(entry.logged_at)}
            </time>
          </div>

          {/* Body summary — 2 lines max */}
          {entry.body && (
            <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed line-clamp-2 mb-2">
              {entry.body.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').replace(/\nMood:.*$/m, '').trim()}
            </p>
          )}

          {/* Thumbnail — 16:9, full-width below text */}
          {thumbnail && (
            <div className="mt-2 mb-3 rounded-xl overflow-hidden border border-[var(--border-light)] bg-[var(--bg-secondary)] aspect-video max-h-52">
              <img
                src={thumbnail}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          )}

          {/* Reflection snippet if interesting */}
          {entry.meta?.reflections && (
            <div className="mt-2 mb-3 px-3 py-2 rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/15 text-[12px] text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              <Sparkles size={10} className="inline mr-1.5 text-[var(--accent)] mb-0.5" />
              {entry.meta.reflections}
            </div>
          )}

          {/* Footer: chips + actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mood chips */}
            {entry.meta?.mood && <MoodChip mood={entry.meta.mood} />}
            {entry.meta?.energy && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent)]/20">
                {entry.meta.energy} energy
              </span>
            )}

            {/* Privacy badge */}
            {showPrivacyBadge && !entry.is_public && (
              <span className="text-[9px] font-mono text-red-400/70 uppercase tracking-wider">private</span>
            )}

            {/* Spacer */}
            <div className="flex-1" />

            {/* Delete (private view only) */}
            {!isPublicView && (
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="opacity-0 group-hover:opacity-40 hover:!opacity-100 transition-opacity text-[var(--text-tertiary)] hover:text-red-400"
              >
                {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              </button>
            )}

            {/* Open full detail */}
            {detailHref && (
              <Link
                href={detailHref}
                className="flex items-center gap-1 text-[11px] font-mono text-[var(--accent)] hover:text-[var(--accent)] opacity-60 hover:opacity-100 transition-opacity"
              >
                view <ExternalLink size={10} />
              </Link>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}
