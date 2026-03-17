'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Bookmark, BarChart3 } from 'lucide-react'
import { SessionDetail } from './SessionDetail'
import type { VideoUpload } from '@/types/database'

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
  return format(d, 'MMM d · h:mm a')
}

function getActionLabel(type: string): string {
  const map: Record<string, string> = {
    session: 'Recorded',
    capture: 'Captured',
    note: 'Drafted',
    idea: 'Mapped',
    health: 'Logged',
  }
  return map[type] || 'Logged'
}

function cleanTitle(entry: LogEntry): string {
  // 1. If we have a meta title, use it.
  if (entry.meta?.title && entry.meta.title.length > 0) return entry.meta.title

  const title = entry.title || ''
  const isFilename = title.includes('.') && (title.endsWith('.mp4') || title.endsWith('.mov') || title.endsWith('.wav'))
  
  // 2. If it's a filename, try to use summary as title
  if (isFilename || !title) {
    const summary = entry.meta?.summary || entry.body || ''
    if (summary.length > 5) {
      // Take first 80 chars for a tight title
      return summary.split(' ').slice(0, 10).join(' ') + '...'
    }
    return format(new Date(entry.logged_at), 'MMMM d, h:mm a')
  }

  return title
}

// ─── Main Card ───────────────────────────────────────────────────────────────

interface LogCardProps {
  entry: LogEntry
  username?: string
  showPrivacyBadge?: boolean
  isPublicView?: boolean
}

export function LogCard({ entry, username, showPrivacyBadge, isPublicView }: LogCardProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullUploadData, setFullUploadData] = useState<VideoUpload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const thumbnail = entry.thumbnail_url || entry.asset?.image_url
  const hasBody = entry.body && entry.body.trim().length > 0
  const actionLabel = getActionLabel(entry.entry_type)
  const displayTitle = cleanTitle(entry)

  return (
    <div className={`group relative flex gap-6 px-6 py-8 transition-all duration-300 border-b border-[var(--border-light)] hover:bg-[var(--bg-secondary)] last:border-0 overflow-hidden ${isExpanded ? 'bg-[var(--bg-secondary)]' : ''}`}>
      {/* Analyst Sidebar */}
      <div className="flex flex-col items-end flex-shrink-0 w-20 pt-1">
        <span className="font-mono text-[8px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-40 mb-1">
          {actionLabel}
        </span>
        <span className="font-mono text-[9px] uppercase font-medium text-[var(--text-tertiary)] opacity-60">
          {reltime(entry.logged_at)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-6">
          <div className="flex-1 min-w-0">
             <div className="flex items-center gap-3 mb-2">
                <h3 className="font-serif text-[20px] font-medium tracking-tight text-[var(--text-primary)] leading-snug group-hover:text-[var(--text-primary)] transition-colors">
                  {displayTitle}
                </h3>
                {entry.is_public === false && showPrivacyBadge && (
                  <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-red-900/40" title="Restricted Access" />
                )}
             </div>
             
             {hasBody && !isExpanded && (
               <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] line-clamp-1 font-light opacity-60 max-w-3xl">
                 {entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').trim()}
               </p>
             )}
          </div>

          <div className="flex items-center gap-4 flex-shrink-0">
             {thumbnail && !isExpanded && (
                <div className="w-10 h-10 rounded-sm overflow-hidden border border-[var(--border-light)] bg-[var(--bg-tertiary)] opacity-40 group-hover:opacity-100 transition-opacity">
                   <img src={thumbnail} alt="" className="w-full h-full object-cover grayscale" />
                </div>
             )}

             <div className="flex items-center">
                {!isPublicView && (
                  <button
                     disabled={isDeleting}
                     onClick={async (e) => {
                       e.preventDefault(); e.stopPropagation()
                       if (!confirm('Destroy record?')) return
                       setIsDeleting(true)
                       try {
                         const res = await fetch(`/api/log-entries/${entry.id}`, { method: 'DELETE' })
                         if (res.ok) window.location.reload()
                       } finally {
                         setIsDeleting(false)
                       }
                     }}
                     className="p-2 text-[var(--text-tertiary)] hover:text-red-400 opacity-0 group-hover:opacity-60 transition-all"
                  >
                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                  </button>
                )}

                <button
                  onClick={async (e) => {
                    e.preventDefault(); e.stopPropagation()
                    if (isExpanded) { setIsExpanded(false); return }
                    setIsExpanded(true)
                    if (!fullUploadData && entry.source_upload_id) {
                      setIsLoading(true)
                      try {
                        const res = await fetch(`/api/video-upload/${entry.source_upload_id}`)
                        if (res.ok) {
                          const data = await res.json()
                          setFullUploadData(data.upload)
                        }
                      } finally {
                        setIsLoading(false)
                      }
                    }
                  }}
                  className={`p-2 transition-all duration-300 ${isExpanded ? 'text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                >
                  <div className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={14} />
                  </div>
                </button>
             </div>
          </div>
        </div>

        {/* Action Indicators (Minimalist) */}
        {!isExpanded && (
          <div className="flex items-center gap-4 mt-3">
             {entry.software_tags && entry.software_tags.length > 0 && (
               <div className="flex gap-1.5">
                 {entry.software_tags.map(tag => (
                   <span key={tag} className="text-[8px] font-mono tracking-wider text-[var(--text-tertiary)] uppercase opacity-40">
                     {tag}
                   </span>
                 ))}
               </div>
             )}
             {entry.meta?.mood && (
               <span className="text-[8px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] opacity-30 flex items-center gap-1">
                 <BarChart3 size={10} /> {entry.meta.mood}
               </span>
             )}
          </div>
        )}

        {/* Expanded Intelligence Stream */}
        {isExpanded && (
          <div className="mt-8 animate-in fade-in duration-500">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-30">
                <Loader2 size={24} className="animate-spin" />
                <span className="text-[9px] font-mono uppercase tracking-widest">Accessing Stream...</span>
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="border-t border-[var(--border-medium)] pt-8">
                  <SessionDetail 
                    upload={fullUploadData || ({ 
                       id: entry.source_upload_id || entry.id,
                       file_name: entry.title,
                       recorded_at: entry.logged_at,
                       analysis: entry.meta,
                       mime_type: 'video/mp4',
                       thumbnail_url: entry.thumbnail_url
                    } as any)} 
                  />
              </div>
            ) : (
              <div className="py-10 text-center opacity-20 text-[10px] uppercase font-mono tracking-widest">
                Data Stream Unavailable
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
