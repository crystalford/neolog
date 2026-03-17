'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { Calendar, Filter, Search, Plus, Loader2, Sparkles, SlidersHorizontal, ArrowUpRight, BookOpen, Layers } from 'lucide-react'
import { LogCard, type LogEntry } from '@/components/LogCard'
import { createClient } from '@/lib/supabase/client'

export default function TimelinePage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'archive' | 'script'>('archive')
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return

      const { data, error } = await supabase
        .from('log_entries')
        .select('*')
        .eq('user_id', session.user.id)
        .order('logged_at', { ascending: false })

      if (data) setEntries(data)
      setIsLoading(false)
    }
    load()
  }, [supabase])

  const filteredEntries = useMemo(() => {
    return entries.filter(e => 
      e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.body?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.entry_type.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [entries, searchQuery])

  const groupedEntries = useMemo(() => {
    const groups: Record<string, LogEntry[]> = {}
    filteredEntries.forEach(entry => {
      const date = format(parseISO(entry.logged_at), 'yyyy-MM-dd')
      if (!groups[date]) groups[date] = []
      groups[date].push(entry)
    })
    return groups
  }, [filteredEntries])

  const dates = Object.keys(groupedEntries).sort((a, b) => b.localeCompare(a))

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-20">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]" />
        <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-[var(--text-tertiary)]">Synchronizing Log Stream...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32">
      {/* High-Contrast Header */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--border-medium)] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
        <div className="max-w-[1400px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-10">
            <h1 className="font-sans text-2xl font-black tracking-tighter text-[var(--text-primary)]">Log Archive</h1>
            
            <nav className="flex items-center gap-2 p-1 bg-[var(--bg-tertiary)] border border-[var(--border-light)] rounded-lg">
               <button 
                onClick={() => setViewMode('archive')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                  viewMode === 'archive' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-2xl' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
               >
                 <Layers size={14} /> Records
               </button>
               <button 
                onClick={() => setViewMode('script')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-mono font-black uppercase tracking-widest transition-all ${
                  viewMode === 'script' ? 'bg-[var(--text-primary)] text-[var(--bg-primary)] shadow-2xl' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                }`}
               >
                 <BookOpen size={14} /> Script
               </button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input 
                type="text"
                placeholder="Search Narrative..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-lg pl-12 pr-6 py-2.5 text-[13px] w-64 focus:w-[500px] transition-all focus:border-[var(--text-primary)] outline-none font-light text-[var(--text-primary)]"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto mt-16 px-8">
        {viewMode === 'archive' ? (
          /* Standard Record View */
          dates.length > 0 ? (
            <div className="space-y-20">
              {dates.map((dateStr) => {
                const dateObj = parseISO(dateStr)
                const entriesForDate = groupedEntries[dateStr]
                
                return (
                  <section key={dateStr} className="relative">
                    <div className="flex items-baseline gap-6 mb-8 border-b border-[var(--border-light)] pb-4">
                       <h2 className="text-[14px] font-mono font-black text-[var(--text-primary)] uppercase tracking-[0.3em]">
                          {isToday(dateObj) ? 'TODAY' : isYesterday(dateObj) ? 'YESTERDAY' : format(dateObj, 'MMM dd, yyyy')}
                       </h2>
                       <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-40 font-bold uppercase tracking-widest">
                          {entriesForDate.length} EVENT{entriesForDate.length !== 1 ? 'S' : ''}
                       </span>
                    </div>

                    <div className="space-y-px">
                      {entriesForDate.map((entry) => (
                        <LogCard key={entry.id} entry={entry} />
                      ))}
                    </div>
                  </section>
                )
              })}
            </div>
          ) : (
            <EmptyState message="Zero Narrative Captured" />
          )
        ) : (
          /* Infinite Script View */
          <div className="space-y-24 pb-64">
             {filteredEntries.map((entry, idx) => {
                const segments = entry.meta?.transcript_segments || []
                return (
                  <article key={entry.id} className="relative animate-in fade-in duration-1000 slide-in-from-bottom-4">
                     <div className="flex items-center gap-6 mb-12 opacity-20 hover:opacity-100 transition-opacity duration-500">
                        <div className="h-[1px] flex-1 bg-[var(--border-medium)]" />
                        <span className="text-[9px] font-mono font-black uppercase tracking-[0.5em] text-[var(--text-tertiary)] whitespace-nowrap">
                           {format(parseISO(entry.logged_at), 'MMM dd · HH:mm')} // SIGNAL {idx + 1}
                        </span>
                        <div className="h-[1px] flex-1 bg-[var(--border-medium)]" />
                     </div>

                     {segments.length > 0 ? (
                        <div className="space-y-10">
                           {segments.map((seg: any, sIdx: number) => (
                              <div key={sIdx} className="flex gap-12 group/seg">
                                 <span className="text-[10px] font-mono text-[var(--text-tertiary)] opacity-20 w-16 pt-1 font-bold tracking-tighter group-hover/seg:opacity-100 transition-opacity">
                                    {formatTime(seg.start)}
                                 </span>
                                 <p className="text-[18px] leading-[1.8] text-[var(--text-secondary)] font-light tracking-wide">
                                    {seg.text}
                                 </p>
                              </div>
                           ))}
                        </div>
                     ) : (
                        <div className="pl-28 border-l-2 border-[var(--border-light)] py-4">
                           <p className="text-[18px] leading-[1.8] text-[var(--text-tertiary)] font-light italic opacity-40">
                              [ NO TRANSCRIPT DATA RECOVERED FOR THIS SIGNAL ]
                           </p>
                           <p className="text-[14px] mt-4 text-[var(--text-secondary)] font-light">
                              {entry.meta?.summary || entry.body}
                           </p>
                        </div>
                     )}
                  </article>
                )
             })}
             {filteredEntries.length === 0 && <EmptyState message="The script is empty." />}
          </div>
        )}
      </main>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-48 gap-8 border border-dashed border-[var(--border-light)] rounded-3xl opacity-20">
      <Sparkles size={32} />
      <p className="text-[11px] font-mono uppercase tracking-[0.6em] font-black">{message}</p>
    </div>
  )
}

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
