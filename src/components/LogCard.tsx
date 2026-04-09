'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown, ChevronUp, ChevronRight, AlertCircle, Bookmark, BarChart3, Radio, Plus } from 'lucide-react'
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
  video_uploads?: {
    transcript_segments: any[]
    analysis: any
    thumbnail_url?: string | null
  } | null
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
    capture: 'Thought',
    note: 'Log',
    idea: 'Mapping',
    health: 'Bio',
  }
  return map[type] || 'Archived'
}

/**
 * Normalizes titles by removing narrative boilerplate.
 */
function normalizeTitle(title: string): string {
  if (!title) return ''
  return title
    .replace(/^the user expressed (a|an|the|some|intense)?/i, '')
    .replace(/^the user attempted to/i, '')
    .replace(/^the user is/i, '')
    .replace(/^the user/i, '')
    .replace(/^this feels like/i, '')
    .replace(/^recorded a video:/i, '')
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase()) // Re-capitalize
}

function isTechnicalString(s: string): boolean {
  if (!s) return true
  const lower = s.toLowerCase()
  if (/\.(mp4|mov|wav|avi|mkv|jpg|png|heic)$/i.test(s)) return true
  const digits = s.replace(/\D/g, '').length
  if (digits > 8 && (digits / s.length) > 0.35) return true
  const techKeywords = ['dji', 'mimo', 'gopro', 'pixel', 'iphone', 'img_', 'vid_', 'whatsapp', 'screen recording', 'recording', 'export'];
  if (techKeywords.some(p => lower.includes(p))) return true
  if (/[a-f0-9]{8,}/i.test(s) && (s.match(/[a-f]/ig) || []).length > 2) return true
  return false
}

function cleanTitle(entry: LogEntry): string {
  let finalTitle = ''

  if (entry.meta?.title && entry.meta.title.length > 5 && !isTechnicalString(entry.meta.title)) {
    finalTitle = entry.meta.title
  } else {
    const rawTitle = entry.title || ''
    if (isTechnicalString(rawTitle) || !rawTitle) {
       const summary = entry.meta?.summary || entry.body || ''
       if (summary.length > 10) {
          const sentence = summary.split('.')[0]
          finalTitle = sentence
       } else {
          finalTitle = format(new Date(entry.logged_at), 'MMMM d, yyyy · H:mm')
       }
    } else {
      finalTitle = rawTitle
    }
  }

  return normalizeTitle(finalTitle)
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

  const upload = Array.isArray(entry.video_uploads) ? entry.video_uploads[0] : entry.video_uploads
  const thumbnail = entry.thumbnail_url || upload?.thumbnail_url || entry.asset?.image_url
  const hasBody = entry.body && entry.body.trim().length > 0
  const actionLabel = getActionLabel(entry.entry_type)
  const displayTitle = cleanTitle(entry)

  const toggleExpansion = async (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (isExpanded) { setIsExpanded(false); return }
    setIsExpanded(true)

    // If we already have the data (from a join), don't fetch
    if (entry.video_uploads && !fullUploadData) {
      const upload = Array.isArray(entry.video_uploads) ? entry.video_uploads[0] : entry.video_uploads
      if (upload) {
        setFullUploadData({
          ...upload,
          id: entry.source_upload_id || entry.id,
          file_name: entry.title,
          recorded_at: entry.logged_at,
          logged_at: entry.logged_at,
        } as any)
      }
      return
    }

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
  }

  return (
    <div className={`group relative flex gap-8 px-8 py-12 transition-all duration-700 border-b border-[var(--border-light)] hover:bg-[var(--bg-secondary)] last:border-0 ${isExpanded ? 'bg-[var(--bg-secondary)] py-16' : ''}`}>
      {/* Dynamic Sidebar */}
      <div className="flex flex-col items-end flex-shrink-0 w-24 pt-2">
        <span className="font-mono text-[9px] font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-60 mb-1">
          {actionLabel}
        </span>
        <span className="font-mono text-[10px] font-bold text-[var(--text-tertiary)] opacity-40">
          {format(new Date(entry.logged_at), 'H:mm')}
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-10">
          <div className="flex-1 min-w-0">
             <button 
                onClick={toggleExpansion}
                className="text-left group/title focus:outline-none block w-full"
             >
                <h3 className="font-sans text-[26px] font-semibold tracking-tight text-[var(--text-primary)] leading-[1.2] mb-4 transition-all group-hover/title:translate-x-1 duration-500">
                  {displayTitle}
                </h3>
                
                {hasBody && !isExpanded && (
                  <p className="text-[16px] leading-[1.6] text-[var(--text-secondary)] line-clamp-2 font-light opacity-60">
                    {entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').trim()}
                  </p>
                )}
             </button>
          </div>

          <div className="flex items-center gap-6 flex-shrink-0 pt-2">
             {thumbnail && !isExpanded && (
                <div className="w-20 h-20 rounded-sm overflow-hidden border border-[var(--border-light)] bg-[var(--bg-tertiary)] transition-all duration-700 hover:scale-105 active:scale-95 shadow-2xl">
                   <img src={thumbnail} alt="" className="w-full h-full object-cover" />
                </div>
             )}

             <div className="flex flex-col items-end gap-3">
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
                     className="p-2 text-[var(--text-tertiary)] hover:text-red-500 opacity-20 group-hover:opacity-100 transition-all rounded-full hover:bg-red-500/10"
                  >
                    {isDeleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={14} />}
                  </button>
                )}

                <button
                  onClick={toggleExpansion}
                  className={`flex items-center gap-3 px-5 py-2.5 rounded-full font-mono text-[10px] font-black uppercase tracking-widest transition-all duration-500 ${
                    isExpanded 
                    ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] scale-110 shadow-glow' 
                    : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--text-primary)] border border-transparent hover:border-[var(--border-medium)]'
                  }`}
                >
                  {isExpanded ? 'Shrink' : 'Explore'}
                  <div className={`transition-transform duration-700 ${isExpanded ? 'rotate-180' : ''}`}>
                    <ChevronDown size={14} strokeWidth={3} />
                  </div>
                </button>
             </div>
          </div>
        </div>

        {/* Minimal Context Taps */}
        {!isExpanded && (
          <div className="flex items-center gap-6 mt-8">
             {entry.software_tags && entry.software_tags.length > 0 && (
               <div className="flex gap-4">
                 {entry.software_tags.map(tag => (
                   <span key={tag} className="text-[10px] font-mono font-black tracking-[0.2em] text-[var(--text-tertiary)] uppercase opacity-30 hover:opacity-100 transition-opacity">
                     {tag}
                   </span>
                 ))}
               </div>
             )}
             {entry.meta?.mood && (
               <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-tertiary)]" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)]">{entry.meta.mood}</span>
               </div>
             )}
          </div>
        )}

        {/* Intelligence Stream */}
        {isExpanded && (
          <div className="mt-16 animate-in fade-in slide-in-from-top-6 duration-1000">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-32 gap-6 opacity-30">
                <Loader2 size={32} className="animate-spin" />
                <span className="text-[11px] font-mono uppercase tracking-[0.6em]">Tuning Feed...</span>
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="bg-transparent">
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
              <div className="py-24 text-center border border-dashed border-[var(--border-light)] rounded-lg opacity-20 text-[10px] uppercase font-mono tracking-widest">
                No signal data found
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
