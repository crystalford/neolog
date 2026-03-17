'use client'

import { useState } from 'react'
import { format, isToday, isYesterday } from 'date-fns'
import { Video, Mic, FileText, Loader2, Trash2, Sparkles, ChevronDown, ChevronUp, ChevronRight, AlertCircle } from 'lucide-react'
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
  return format(d, 'MMMM d · h:mm a')
}

function getActionLabel(type: string): string {
  const map: Record<string, string> = {
    session: 'Recorded a video',
    capture: 'Captured a thought',
    note: 'Wrote a note',
    idea: 'Mapped an idea',
    health: 'Logged health',
  }
  return map[type] || 'Logged activity'
}

function cleanTitle(entry: LogEntry): string {
  // Priority 1: AI-generated title from meta
  if (entry.meta?.title && entry.meta.title.length > 0) {
    return entry.meta.title
  }

  // Priority 2: Use summary if it's very short, or fallback to date
  const title = entry.title || ''
  const isFilename = title.includes('.') && (title.endsWith('.mp4') || title.endsWith('.mov') || title.endsWith('.wav'))
  
  if (isFilename) {
    return format(new Date(entry.logged_at), 'MMMM d, yyyy · h:mm a')
  }

  return title
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
        const cls = MOOD_COLORS[w] || 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border-[var(--border-light)] font-mono uppercase tracking-widest text-[9px]'
        return (
          <span key={w} className={`inline-flex items-center px-2 py-0.5 rounded-md border ${cls}`}>
            {w}
          </span>
        )
      })}
    </>
  )
}

function SoftwareChip({ tag }: { tag: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--accent)]/10 bg-[var(--accent-soft)] text-[var(--accent)] text-[9px] font-mono font-bold uppercase tracking-wider">
      {tag}
    </span>
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
  const [isExpanded, setIsExpanded] = useState(false)
  const [fullUploadData, setFullUploadData] = useState<VideoUpload | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const thumbnail = entry.thumbnail_url || entry.asset?.image_url
  const hasBody = entry.body && entry.body.trim().length > 0
  
  const actionLabel = getActionLabel(entry.entry_type)
  const displayTitle = cleanTitle(entry)

  return (
    <div className="group relative flex gap-8 px-6 py-10 transition-all duration-700 hover:bg-[var(--accent-softer)]/20 border-b border-[var(--border-light)] last:border-0 overflow-hidden">
      {/* Timeline Thread & Node */}
      <div className="relative flex flex-col items-center flex-shrink-0 w-8">
        <div className="absolute top-0 bottom-0 w-px bg-[var(--timeline-thread)] group-first:top-12 group-last:bottom-12 opacity-40" />
        <div className="relative z-10 w-3.5 h-3.5 mt-2 bg-[var(--bg-primary)] border-2 border-[var(--timeline-node-border)] rounded-full transition-all duration-700 group-hover:scale-125 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_20px_rgba(124,106,245,0.4)]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-6 mb-4">
          <div className="flex flex-col gap-2">
             <div className="flex items-center gap-4">
               <span className="font-mono text-[9px] font-bold uppercase tracking-[0.3em] text-[var(--accent)] opacity-80">
                 {actionLabel}
               </span>
               <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-50">
                 {reltime(entry.logged_at)}
               </span>
             </div>
             <h3 className="font-serif text-[22px] font-medium tracking-tight text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent)] transition-colors duration-500">
               {displayTitle}
             </h3>
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
             {!isPublicView && (
               <button
                  disabled={isDeleting}
                  onClick={async (e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    if (!confirm('Delete this log entry?')) return
                    setIsDeleting(true)
                    try {
                      const res = await fetch(`/api/log-entries/${entry.id}`, { method: 'DELETE' })
                      if (res.ok) window.location.reload()
                    } catch {
                    } finally {
                      setIsDeleting(false)
                    }
                  }}
                  className="p-2 text-[var(--text-tertiary)] hover:text-red-400 transition-colors bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-light)]"
                  title="Delete entry"
               >
                 {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
               </button>
             )}
          </div>
        </div>

        {/* Visual Content + Body */}
        <div className="flex gap-8 items-start">
           {thumbnail && (
             <div className="flex-shrink-0 w-28 h-28 rounded-2xl overflow-hidden border border-[var(--border-light)] bg-[var(--bg-tertiary)] shadow-2xl relative group-second:scale-105 transition-transform duration-700">
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-10" />
                <img src={thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
             </div>
           )}

           <div className="flex-1">
             {hasBody && !isExpanded && (
               <p className="text-[15px] leading-relaxed text-[var(--text-secondary)] line-clamp-3 mb-6 max-w-2xl font-light opacity-80 tracking-wide underline-offset-4 decoration-[var(--accent-softer)]">
                 {entry.body}
               </p>
             )}
             
             {/* Note: Reflections (Synthetic Perspective) removed from card view as requested */}
           </div>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center justify-between mt-4">
          <div className="flex flex-wrap gap-2.5 items-center">
            {entry.software_tags?.map(tag => <SoftwareChip key={tag} tag={tag} />)}
            {(entry.meta?.mood || entry.meta?.energy) && !isExpanded && (
              <div className="flex gap-3 items-center ml-2 border-l border-[var(--border-light)] pl-4">
                {entry.meta?.mood && <MoodChip mood={entry.meta.mood} />}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-5">
            {showPrivacyBadge && !entry.is_public && (
              <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-red-400/60 uppercase">
                Private
              </span>
            )}
            
            {(entry.source_upload_id || entry.meta) && (
              <button
                onClick={async (e) => {
                  e.preventDefault()
                  e.stopPropagation()
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
                    } catch {
                    } finally {
                      setIsLoading(false)
                    }
                  }
                }}
                className="flex items-center gap-3 font-mono text-[10px] font-bold tracking-[0.25em] uppercase text-[var(--accent)] hover:text-white transition-all group/btn"
              >
                <span className="border-b border-transparent group-hover/btn:border-[var(--accent)] pb-0.5">
                  {isExpanded ? 'Collapse' : 'Detailed Analysis'}
                </span>
                {isExpanded ? <ChevronUp size={14} /> : <ChevronRight size={14} className="group-hover/btn:translate-x-1 transition-transform" />}
              </button>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-10 pt-10 border-t border-[var(--border-light)] animate-in fade-in slide-in-from-top-4 duration-700">
            {isLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 size={24} className="animate-spin text-[var(--accent)] opacity-40" />
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="bg-[#0c0c0d]/60 rounded-[2.5rem] p-8 border border-[var(--border-light)] shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[var(--accent)]/30 to-transparent" />
                {!fullUploadData && entry.source_upload_id && (
                  <div className="flex items-center gap-3 px-5 py-3 mb-6 rounded-2xl bg-orange-400/5 border border-orange-400/10 text-[10px] text-orange-400 uppercase tracking-widest font-mono">
                    <AlertCircle size={14} /> Source removed · Analysis Snapshot
                  </div>
                )}
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
              <p className="text-xs text-[var(--text-tertiary)] text-center py-12 opacity-40 italic">Session metadata unavailable.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
