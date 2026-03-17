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

function cleanTitle(title: string, loggedAt: string): string {
  const thirdPersonPattern = /^(the (user|creator|founder)|[a-z]+ (is|was|has been|discusses|explores|reflects) )/i
  if (thirdPersonPattern.test(title.trim())) {
    return format(new Date(loggedAt), 'MMM d, yyyy · h:mm a')
  }
  return title
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
    <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-[var(--accent)]/20 bg-[var(--accent-soft)] text-[var(--accent)] text-[9px] font-mono font-bold uppercase tracking-wider">
      {tag}
    </span>
  )
}

function EntryTypeBadge({ type }: { type: string }) {
  const Icon = type === 'session' ? Video : type === 'capture' ? Mic : FileText
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-60">
      <Icon size={10} />
      {type}
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
  const hasReflections = entry.meta?.reflections

  return (
    <div className="group relative flex gap-6 px-4 py-8 transition-all duration-500 hover:bg-[var(--accent-softer)]/30 border-b border-[var(--border-light)] last:border-0 overflow-hidden">
      {/* Timeline Thread & Node */}
      <div className="relative flex flex-col items-center flex-shrink-0 w-8">
        <div className="absolute top-0 bottom-0 w-px bg-[var(--timeline-thread)] group-first:top-10 group-last:bottom-10" />
        <div className="relative z-10 w-4 h-4 mt-2 bg-[var(--timeline-node-bg)] border-2 border-[var(--timeline-node-border)] rounded-full shadow-[0_0_15px_rgba(124,106,245,0.25)] transition-all duration-500 group-hover:scale-125 group-hover:border-[var(--accent)] group-hover:shadow-[0_0_20px_rgba(124,106,245,0.4)]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-4 mb-3">
          <div className="flex flex-col gap-1.5">
             <div className="flex items-center gap-4">
               <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-70">
                 {reltime(entry.logged_at)}
               </span>
               <EntryTypeBadge type={entry.entry_type} />
             </div>
             <h3 className="font-serif text-[17px] font-medium tracking-tight text-[var(--text-primary)] leading-snug">
               {cleanTitle(entry.title, entry.logged_at)}
             </h3>
          </div>

          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
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
                  className="p-1.5 text-[var(--text-tertiary)] hover:text-red-400 transition-colors"
                  title="Delete entry"
               >
                 {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
               </button>
             )}
          </div>
        </div>

        {/* Visual Content + Body */}
        <div className="flex gap-6 items-start">
           {thumbnail && (
             <div className="flex-shrink-0 w-24 h-24 rounded-2xl overflow-hidden border border-[var(--border-light)] bg-[var(--bg-tertiary)] shadow-lg shadow-black/20">
                <img src={thumbnail} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
             </div>
           )}

           <div className="flex-1">
             {hasBody && !isExpanded && (
               <p className="text-[14px] leading-relaxed text-[var(--text-secondary)] line-clamp-3 mb-4 max-w-2xl font-light opacity-90">
                 {entry.body?.replace(/\*\*Open Questions:\*\*[\s\S]*/m, '').replace(/\nMood:.*$/m, '').trim()}
               </p>
             )}

             {/* Intelligence Perspectives */}
             {hasReflections && (
               <div className={`mt-4 relative p-5 rounded-2xl border border-[var(--accent)]/10 bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-tertiary)] overflow-hidden transition-all duration-500 ${isExpanded ? 'max-w-none shadow-xl' : 'max-w-2xl shadow-md hover:shadow-lg'}`}>
                 <div className="absolute top-0 right-0 p-4 opacity-10">
                   <Sparkles size={48} className="text-[var(--accent)]" />
                 </div>
                 
                 <div className="flex items-center gap-2.5 mb-3">
                   <Sparkles size={12} className="text-[var(--accent)]" />
                   <span className="font-mono text-[9px] font-bold uppercase tracking-[0.25em] text-[var(--accent)]">
                     Synthetic Perspective
                   </span>
                 </div>

                 <p className="text-[13.5px] leading-relaxed text-[var(--text-primary)] font-[450] relative z-10">
                   {isExpanded ? entry.meta?.reflections : (entry.meta?.reflections && entry.meta.reflections.length > 200 ? entry.meta.reflections.substring(0, 197) + '...' : entry.meta?.reflections)}
                 </p>
               </div>
             )}
           </div>
        </div>

        {/* Footer Meta */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex flex-wrap gap-2.5 items-center">
            {entry.software_tags?.map(tag => <SoftwareChip key={tag} tag={tag} />)}
            {(entry.meta?.mood || entry.meta?.energy) && (
              <div className="flex gap-2 items-center ml-2 border-l border-[var(--border-light)] pl-4">
                {entry.meta?.mood && <MoodChip mood={entry.meta.mood} />}
                {entry.meta?.energy && (
                  <span className="text-[10px] text-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-0.5 rounded-md border border-[var(--accent)]/10 font-bold uppercase tracking-wider">
                    {entry.meta.energy} energy
                  </span>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-5">
            {showPrivacyBadge && !entry.is_public && (
              <span className="text-[9px] font-mono font-bold tracking-[0.2em] text-red-400/80 uppercase">
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
                className="flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--accent)] bg-[var(--accent-soft)] hover:bg-[var(--accent)] hover:text-white px-4 py-2 rounded-xl transition-all shadow-sm"
              >
                {isExpanded ? <>Collapse <ChevronUp size={12} /></> : <>Details <ChevronRight size={12} /></>}
              </button>
            )}
          </div>
        </div>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="mt-8 pt-8 border-t border-[var(--border-light)] animate-fade-in">
            {isLoading ? (
              <div className="flex justify-center py-16">
                <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
              </div>
            ) : (fullUploadData || entry.meta) ? (
              <div className="bg-[var(--bg-secondary)]/50 rounded-3xl p-1 border border-[var(--border-light)] shadow-inner">
                {!fullUploadData && entry.source_upload_id && (
                  <div className="flex items-center gap-3 px-5 py-3.5 mb-4 rounded-2xl bg-orange-400/5 border border-orange-400/15 text-[10px] text-orange-400 uppercase tracking-widest font-mono">
                    <AlertCircle size={16} /> Source removed · Analysis Snapshot
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
              <p className="text-xs text-[var(--text-tertiary)] text-center py-10 opacity-50 italic">Session metadata unavailable.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
