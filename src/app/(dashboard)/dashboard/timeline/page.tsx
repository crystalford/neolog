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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-20">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="text-[9px] font-mono uppercase tracking-[0.4em]">Resyncing Data...</span>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] pb-32">
      {/* Analyst Header — Compact */}
      <header className="sticky top-0 z-50 w-full border-b border-[var(--border-medium)] bg-[var(--bg-primary)]/90 backdrop-blur-md">
        <div className="max-w-[800px] mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-serif text-2xl font-medium tracking-tight text-[var(--text-primary)]">The Log</h1>
            <div className="flex items-center gap-2 px-3 py-1 rounded-sm bg-[var(--accent-softer)] border border-[var(--accent-glow)]">
               <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
               <span className="text-[9px] font-mono font-black uppercase tracking-widest text-[var(--accent)]">Stream Active</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--accent)] opacity-40 group-focus-within:opacity-100 transition-opacity" />
              <input 
                type="text"
                placeholder="Search Archive..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-sm pl-10 pr-4 py-2 text-[12px] w-48 focus:w-72 transition-all focus:border-[var(--accent)] outline-none font-light text-[var(--text-primary)]"
              />
            </div>
            <button className="flex items-center gap-2 text-[10px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-all">
               <SlidersHorizontal size={14} /> Filter
            </button>
          </div>
        </div>
      </header>

      {/* Narrative Feed — Optimized Flow */}
      <main className="max-w-[800px] mx-auto mt-10">
        {dates.length > 0 ? (
          <div className="space-y-12">
            {dates.map((dateStr) => {
              const dateObj = parseISO(dateStr)
              const entriesForDate = groupedEntries[dateStr]
              
              return (
                <section key={dateStr} className="relative">
                  {/* waypoint - extremely sharp */}
                  <div className="sticky top-16 z-40 flex items-center gap-6 py-6 bg-[var(--bg-primary)]/95">
                    <div className="flex flex-col items-end flex-shrink-0 w-20">
                       <span className="text-[10px] font-mono font-black text-[var(--accent)] tracking-[0.2em] leading-none mb-1">
                          {isToday(dateObj) ? 'TODAY' : isYesterday(dateObj) ? 'YESTERDAY' : format(dateObj, 'yyyy')}
                       </span>
                       <span className="text-[11px] font-serif text-[var(--text-tertiary)] uppercase font-bold tracking-widest opacity-60">
                          {format(dateObj, 'MMM dd')}
                       </span>
                    </div>
                    <div className="flex-1 h-[1px] bg-gradient-to-r from-[var(--border-light)] via-[var(--border-medium)] to-transparent" />
                    <span className="text-[9px] font-mono text-[var(--text-tertiary)] font-bold uppercase tracking-[0.3em] opacity-40">
                       {entriesForDate.length} EVENT{entriesForDate.length !== 1 ? 'S' : ''}
                    </span>
                  </div>

                  <div className="border border-[var(--border-light)] bg-[var(--bg-secondary)]/20 rounded-sm">
                    {entriesForDate.map((entry) => (
                      <LogCard key={entry.id} entry={entry} />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-32 gap-4 border border-dashed border-[var(--border-light)] rounded-sm opacity-20">
            <Sparkles size={20} />
            <p className="text-[9px] font-mono uppercase tracking-[0.4em]">Zero Captured Signals</p>
          </div>
        )}
      </main>
    </div>
  )
}
