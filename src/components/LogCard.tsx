'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Bookmark, BarChart3, Radio } from 'lucide-react'
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
    session: 'Recorded Session',
    capture: 'Thought Captured',
    note: 'Narrative Log',
    idea: 'Cognitive Map',
    health: 'Bio Metric',
  }
  return map[type] || 'Archived'
}

/**
 * Aggressive check to see if a string looks like a technical filename or timestamp.
 */
function isTechnicalString(s: string): boolean {
  if (!s) return true
  const lower = s.toLowerCase()
  
  // 1. Extension check
  if (/\.(mp4|mov|wav|avi|mkv|jpg|png|heic)$/i.test(s)) return true
  
  // 2. Digit density check (e.g. "20260216 112018")
  const digits = s.replace(/\D/g, '').length
  if (digits > 8 && (digits / s.length) > 0.35) return true
  
  // 3. Common hardware/technical prefixes
  const techKeywords = ['dji', 'mimo', 'gopro', 'pixel', 'iphone', 'img_', 'vid_', 'whatsapp', 'screen recording', 'recording', 'export'];
  if (techKeywords.some(p => lower.includes(p))) return true
  
  // 4. UUID or high-entropy hex strings
  if (/[a-f0-9]{8,}/i.test(s) && (s.match(/[a-f]/ig) || []).length > 2) return true

  return false
}

function cleanTitle(entry: LogEntry): string {
  // 1. If AI generated a high-quality title in meta, use it.
  if (entry.meta?.title && entry.meta.title.length > 5 && !isTechnicalString(entry.meta.title)) {
    return entry.meta.title
  }

  const rawTitle = entry.title || ''
  
  // 2. If the current title looks technical, fallback to summary or date
  if (isTechnicalString(rawTitle) || !rawTitle) {
     const summary = entry.meta?.summary || entry.body || ''
     if (summary.length > 10) {
        // Extract a narrative title from the summary (first 80 chars)
        const sentence = summary.split('.')[0]
        return sentence.length > 100 ? sentence.slice(0, 100) + '...' : sentence
     }
     return format(new Date(entry.logged_at), 'MMMM d, yyyy · H:mm')
  }

  return rawTitle
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
    <div className={`group relative flex gap-8 px-8 py-10 transition-all duration-500 border-b border-[var(--border-light)] hover:bg-[var(--bg-secondary)] last:border-0 overflow-hidden ${isExpanded ? 'bg-[var(--bg-secondary)]' : ''}`}>
      {/* Narrative Sidecard */}
      <div className="flex flex-col items-end flex-shrink-0 w-24 pt-1">
        <div className="flex items-center gap-2 mb-2 text-[var(--accent)]">
           <Radio size={10} className="animate-pulse" />
           <span className="font-mono text-[9px] font-black uppercase tracking-[0.25em]">
             {actionLabel}
           </span>
        </div>
        <span className="font-mono text-[10px] uppercase font-bold text-[var(--text-tertiary)] opacity-80">
          {reltime(entry.logged_at)}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-8">
          <div className="flex-1 min-w-0">
             <div className="flex items-start gap-4 mb-3">
                <h3 className="font-serif text-[24px] font-medium tracking-tight text-[var(--text-primary)] leading-snug group-hover:text-[var(--accent)] transition-colors duration-500">
                  {displayTitle}
                </h3>
             </div>
             
             {hasBody && !isExpanded && (
               <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] line-clamp-2 font-light opacity-90 max-w-3xl tracking-wide">
                 {entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').trim()}
               </p>
             )}
          </div>

          <div className="flex items-center gap-6 flex-shrink-0">
             {thumbnail && !isExpanded && (
                <div className="relative group/thumb">
                   <div className="w-24 h-24 rotate-1 rounded-sm overflow-hidden border border-[var(--border-medium)] bg-[var(--bg-tertiary)] shadow-xl group-hover:rotate-0 transition-all duration-700">
                      <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                   </div>
                   <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg-primary)]/40 to-transparent pointer-events-none" />
                </div>
             )}

             <div className="flex flex-col items-end gap-2">
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
                     className="p-2 text-[var(--text-tertiary)] hover:text-red-400 opacity-20 group-hover:opacity-100 transition-all bg-[var(--bg-tertiary)]/50 rounded-sm border border-[var(--border-light)]"
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
                  className={`flex items-center gap-3 px-4 py-2 border rounded-sm font-mono text-[10px] uppercase tracking-widest transition-all ${
                    isExpanded 
                    ? 'bg-[var(--accent)] text-[var(--bg-primary)] border-[var(--accent)]' 
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-light)] hover:border-[var(--accent)] hover:text-[var(--accent)]'
                  }`}
                >
                  {isExpanded ? 'Collapse' : 'Examine'}
                  <div className={`transition-transform duration-500 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={14} />
                  </div>
                </button>
             </div>
          </div>
        </div>

        {/* Tactical Indicators */}
        {!isExpanded && (
          <div className="flex items-center gap-6 mt-6 pt-4 border-t border-[var(--border-light)]/40">
             {entry.software_tags && entry.software_tags.length > 0 && (
               <div className="flex gap-3">
                 {entry.software_tags.map(tag => (
                   <span key={tag} className="text-[9px] font-mono font-bold tracking-widest text-[var(--accent)] uppercase opacity-70">
                     #{tag}
                   </span>
                 ))}
               </div>
             )}
             {entry.meta?.mood && (
               <div className="flex items-center gap-2 px-3 py-1 bg-[var(--accent-softer)] border border-[var(--accent-glow)] rounded-full">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-[var(--accent)]">{entry.meta.mood}</span>
               </div>
             )}
             {showPrivacyBadge && !entry.is_public && (
                <div className="text-[9px] font-mono text-red-500/60 uppercase tracking-[0.3em] font-black">Restricted</div>
             )}
          </div>
        )}

        {/* Intelligence Workspace */}
        {isExpanded && (
          <div className="mt-12 animate-in fade-in slide-in-from-top-4 duration-700">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.5em]">Syncing Intelligence...</span>
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="relative border border-[var(--border-medium)] bg-[var(--bg-primary)] shadow-2xl rounded-sm overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/60 to-transparent" />
                <div className="p-10">
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
              </div>
            ) : (
              <div className="py-20 text-center border border-dashed border-[var(--border-light)] opacity-20 italic">
                No archived intelligence for this node.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
