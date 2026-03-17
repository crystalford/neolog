'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { format, isToday, isYesterday, parseISO } from 'date-fns'
import { Calendar, Filter, Search, Plus, Loader2, Sparkles, SlidersHorizontal, ArrowUpRight } from 'lucide-react'
import { LogCard, type LogEntry } from '@/components/LogCard'
import { createClient } from '@/lib/supabase/client'

export default function TimelinePage() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-40">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)]" />
        <span className="text-[10px] font-mono uppercase tracking-[0.4em]">Initializing Dossier Stream...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32">
      {/* Narrative Header — Fixed Dossier Status */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--border-light)] bg-[var(--bg-primary)]/80 backdrop-blur-xl">
        <div className="max-w-[1000px] mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="font-serif text-xl font-medium tracking-tight text-[var(--text-primary)]">The Log</h1>
            <div className="h-4 w-[1px] bg-[var(--border-light)]" />
            <div className="flex items-center gap-2">
               <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
               <span className="text-[9px] font-mono font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-60">System Online</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input 
                type="text"
                placeholder="Search Narrative..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-sm pl-10 pr-4 py-2 text-xs w-64 focus:w-80 transition-all focus:border-[var(--accent)] outline-none font-light"
              />
            </div>
            <button className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
               <SlidersHorizontal size={14} /> Filter
            </button>
          </div>
        </div>
      </header>

      {/* Main Narrative Feed */}
      <main className="max-w-[1000px] mx-auto mt-12">
        {dates.length > 0 ? (
          <div className="space-y-24">
            {dates.map((dateStr) => {
              const dateObj = parseISO(dateStr)
              const entriesForDate = groupedEntries[dateStr]
              
              return (
                <section key={dateStr} className="relative">
                  {/* Sticky Date Waypoint */}
                  <div className="sticky top-20 z-40 flex items-center gap-8 py-8 bg-[var(--bg-primary)] mb-6 overflow-hidden">
                    <div className="flex flex-col items-end flex-shrink-0 w-24">
                       <span className="text-[10px] font-mono font-bold text-[var(--accent)] tracking-[0.2em] mb-1">
                          {isToday(dateObj) ? 'TODAY' : isYesterday(dateObj) ? 'YESTERDAY' : format(dateObj, 'yyyy')}
                       </span>
                       <span className="text-[12px] font-serif text-[var(--text-tertiary)] opacity-40 uppercase tracking-widest">
                          {format(dateObj, 'MMM dd')}
                       </span>
                    </div>
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-[var(--border-light)] to-transparent" />
                    <div className="text-[9px] font-mono text-[var(--text-tertiary)] opacity-30 uppercase tracking-[0.4em]">
                       {entriesForDate.length} EVENT{entriesForDate.length !== 1 ? 'S' : ''} ARCHIVED
                    </div>
                  </div>

                  <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
                    {entriesForDate.map((entry) => (
                      <LogCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-48 gap-6 border border-dashed border-[var(--border-light)] rounded-sm opacity-30">
            <Sparkles size={32} className="text-[var(--accent)]" />
            <div className="text-center space-y-2">
              <p className="text-[11px] font-mono uppercase tracking-[0.5em]">Narrative Stream Empty</p>
              <p className="text-sm font-light italic">No events have been captured in this temporal window.</p>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
