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
      <header className="sticky top-0 z-50 w-full border-b border-[var(--border-light)] bg-[var(--bg-primary)]/90 backdrop-blur-md">
        <div className="max-w-[800px] mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="font-serif text-lg font-medium tracking-tight text-[var(--text-primary)]">Log</h1>
            <div className="flex items-center gap-2 px-2 py-0.5 rounded-sm bg-green-500/5 border border-green-500/10">
               <span className="text-[8px] font-mono font-bold uppercase tracking-widest text-green-500/60">Stream Live</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative group">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] opacity-30 group-focus-within:opacity-100" />
              <input 
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-sm pl-9 pr-3 py-1.5 text-[11px] w-48 focus:w-64 transition-all focus:border-[var(--text-tertiary)] outline-none font-light"
              />
            </div>
            <button className="flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
               <SlidersHorizontal size={12} /> Filter
            </button>
          </div>
        </div>
      </header>

      {/* Narrative Feed — Optimized Flow */}
      <main className="max-w-[800px] mx-auto mt-8">
        {dates.length > 0 ? (
          <div className="space-y-6">
            {dates.map((dateStr) => {
              const dateObj = parseISO(dateStr)
              const entriesForDate = groupedEntries[dateStr]
              
              return (
                <section key={dateStr} className="relative">
                  {/* waypoint - extremely low profile */}
                  <div className="sticky top-14 z-40 flex items-center gap-4 py-4 bg-[var(--bg-primary)]/95">
                    <div className="flex flex-col items-end flex-shrink-0 w-20">
                       <span className="text-[9px] font-mono font-bold text-[var(--text-primary)] tracking-widest leading-none">
                          {isToday(dateObj) ? 'TODAY' : isYesterday(dateObj) ? 'YESTERDAY' : format(dateObj, 'MMM dd')}
                       </span>
                    </div>
                    <div className="flex-1 h-[1px] bg-[var(--border-light)]" />
                    <span className="text-[8px] font-mono text-[var(--text-tertiary)] opacity-20 uppercase tracking-[0.3em]">
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
