'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Bookmark } from 'lucide-react'
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
    note: 'Note Written',
    idea: 'Idea Mapped',
    health: 'Health Logged',
  }
  return map[type] || 'Activity Logged'
}

function cleanTitle(entry: LogEntry): string {
  if (entry.meta?.title && entry.meta.title.length > 0) return entry.meta.title
  const title = entry.title || ''
  const isFilename = title.includes('.') && (title.endsWith('.mp4') || title.endsWith('.mov') || title.endsWith('.wav'))
  if (isFilename) return format(new Date(entry.logged_at), 'MMMM d, yyyy')
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
    <div className="group relative flex gap-10 px-8 py-14 transition-all duration-700 hover:bg-[#0a0a10]/40 border-b border-[var(--border-light)] last:border-0 overflow-hidden">
      {/* Dossier Sidebar Meta */}
      <div className="flex flex-col items-end flex-shrink-0 w-24 pt-1">
        <span className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--accent)] mb-2">
          {actionLabel}
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)] opacity-60">
          {reltime(entry.logged_at)}
        </span>
        
        {/* Dossier Thread Line */}
        <div className="mt-8 mr-[3px] w-[0.5px] h-full bg-gradient-to-b from-[var(--timeline-thread)] via-[var(--timeline-thread)] to-transparent opacity-40 relative">
           <div className="absolute top-0 right-[-2.5px] w-[6px] h-[0.5px] bg-[var(--accent)] opacity-50" />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-8 mb-6">
          <div className="flex-1 max-w-3xl">
             <h3 className="font-serif text-[26px] font-medium tracking-tight text-[var(--text-primary)] leading-[1.2] mb-4 group-hover:text-[var(--accent)] transition-colors duration-700">
               {displayTitle}
             </h3>
             
             {hasBody && !isExpanded && (
               <p className="text-[16px] leading-relaxed text-[var(--text-secondary)] line-clamp-2 font-light opacity-70 tracking-wide max-w-2xl">
                 {entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').trim()}
               </p>
             )}
          </div>

          <div className="flex flex-col items-end gap-4">
             {thumbnail && (
               <div className="relative group/thumb">
                 <div className="absolute inset-0 bg-[var(--accent)] mix-blend-overlay opacity-0 group-hover/thumb:opacity-20 transition-opacity z-10" />
                 <div className="w-32 h-32 rounded-sm overflow-hidden border border-[var(--border-medium)] bg-[var(--bg-tertiary)] shadow-2xl transition-transform duration-700 group-hover:scale-[1.02]">
                    <img src={thumbnail} alt="" className="w-full h-full object-cover grayscale-[0.3] group-hover:grayscale-0 transition-all duration-1000" />
                 </div>
                 <div className="absolute -top-1 -right-1 p-1 bg-[var(--bg-primary)] border border-[var(--border-light)] rounded-full">
                    <Bookmark size={10} className="text-[var(--text-tertiary)]" />
                 </div>
               </div>
             )}

             <div className="flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                {!isPublicView && (
                  <button
                     disabled={isDeleting}
                     onClick={async (e) => {
                       e.preventDefault(); e.stopPropagation()
                       if (!confirm('Destroy this log entry?')) return
                       setIsDeleting(true)
                       try {
                         const res = await fetch(`/api/log-entries/${entry.id}`, { method: 'DELETE' })
                         if (res.ok) window.location.reload()
                       } finally {
                         setIsDeleting(false)
                       }
                     }}
                     className="p-2.5 text-[var(--text-tertiary)] hover:text-red-400 transition-all bg-[var(--bg-secondary)] rounded-sm border border-[var(--border-light)] hover:border-red-900/30"
                  >
                    {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}
             </div>
          </div>
        </div>

        {/* Action Tray */}
        <div className="flex items-center justify-between pt-4 border-t border-[var(--border-light)]/50">
          <div className="flex items-center gap-6">
            {entry.software_tags && entry.software_tags.length > 0 && (
              <div className="flex gap-2">
                {entry.software_tags.map(tag => (
                  <span key={tag} className="text-[9px] font-mono tracking-[0.1em] text-[var(--text-tertiary)] uppercase opacity-60 flex items-center gap-1.5 before:content-[''] before:w-1 before:h-1 before:bg-[var(--accent)]/30 before:rounded-full">
                    {tag}
                  </span>
                ))}
              </div>
            )}
            
            {entry.meta?.mood && !isExpanded && (
               <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-light)] bg-[var(--bg-tertiary)]/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">{entry.meta.mood}</span>
               </div>
            )}
          </div>

          <div className="flex items-center gap-6">
            {showPrivacyBadge && !entry.is_public && (
              <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-red-400/40 uppercase">
                Restricted Access
              </span>
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
              className="group/btn flex items-center gap-4 text-[11px] font-mono uppercase tracking-[0.4em] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-all duration-300"
            >
              <span className="relative pb-1 after:content-[''] after:absolute after:bottom-0 after:left-0 after:w-0 after:h-[1px] after:bg-[var(--accent)] after:transition-all group-hover/btn:after:w-full">
                {isExpanded ? 'Minimize' : 'Detail'}
              </span>
              <div className={`transition-transform duration-500 ${isExpanded ? 'rotate-180' : 'group-hover/btn:translate-x-1'}`}>
                <ChevronDown size={14} />
              </div>
            </button>
          </div>
        </div>

        {/* Expanded Intelligence Dossier */}
        {isExpanded && (
          <div className="mt-12 animate-in fade-in slide-in-from-top-6 duration-700">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4 opacity-40">
                <Loader2 size={32} className="animate-spin text-[var(--accent)]" />
                <span className="text-[10px] font-mono uppercase tracking-[0.3em]">Decrypting Session...</span>
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="relative border border-[var(--border-medium)] bg-[var(--bg-secondary)] shadow-2xl rounded-sm overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[var(--accent)]/40 to-transparent" />
                
                {!fullUploadData && entry.source_upload_id && (
                  <div className="flex items-center gap-3 px-8 py-4 bg-orange-500/5 border-b border-orange-500/10 text-[10px] text-orange-400 uppercase tracking-[0.2em] font-mono">
                    <AlertCircle size={14} /> Intelligence Snapshot · Primary Source Unavailable
                  </div>
                )}
                
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
              <div className="text-center py-20 border border-dashed border-[var(--border-light)] opacity-30 italic font-light text-sm">
                Primary Intelligence Data Missing for this Node.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
