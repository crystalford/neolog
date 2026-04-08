'use client'export const runtime = 'edge'


import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, parseISO } from 'date-fns'
import { Loader2, Plus, DollarSign, TrendingUp, Filter, CalendarDays, ArrowRightLeft } from 'lucide-react'
import { FinanceCalendar } from '@/components/FinanceCalendar'
import { FinanceEntryPanel } from '@/components/FinanceEntryPanel'
import { FinanceStats } from '@/components/FinanceStats'

export default function FinancesPage() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const supabase = createClient()

  const loadData = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data } = await supabase
      .from('finance_logs')
      .select('*')
      .eq('user_id', session.user.id)
      .order('logged_at', { ascending: false })

    if (data) setLogs(data)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  // Aggregate Stats
  const now = new Date()
  const thisMonth = logs.filter(l => new Date(l.logged_at) >= startOfMonth(now))
  const thisWeek = logs.filter(l => new Date(l.logged_at) >= startOfWeek(now))

  const aggregate = (list: any[]) => {
    return list.reduce((acc, curr) => {
      if (curr.type === 'income') acc.income += Number(curr.amount)
      else acc.expenses += Number(curr.amount)
      return acc
    }, { income: 0, expenses: 0 })
  }

  const monthlyTotals = aggregate(thisMonth)
  const weeklyTotals = aggregate(thisWeek)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 opacity-20">
        <Loader2 className="w-5 h-5 animate-spin text-[var(--text-primary)]" />
        <span className="text-[9px] font-mono uppercase tracking-[0.4em] text-[var(--text-tertiary)]">Synchronizing Ledger...</span>
      </div>
    )
  }

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-12 space-y-12">
      {/* Header */}
      <header className="flex items-start justify-between border-b border-[var(--border-light)] pb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="px-3 py-1 rounded-sm bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-[9px] font-mono font-black uppercase tracking-widest text-emerald-400">Wealth System 1.0</span>
            </div>
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
               Financial Intelligence
            </p>
          </div>
          <h1 className="text-4xl font-black tracking-tighter text-[var(--text-primary)]">Wealth Ledger</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-2 font-light max-w-xl">
             Track flow, manage operational costs, and audit capital velocity across your global narrative nodes.
          </p>
        </div>

        <div className="flex items-center gap-4">
           <button className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-light)] text-[10px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-all">
              <Filter size={14} /> Report Settings
           </button>
        </div>
      </header>

      {/* Stats Board */}
      <FinanceStats 
        monthlyIncome={monthlyTotals.income}
        monthlyExpenses={monthlyTotals.expenses}
        weeklyIncome={weeklyTotals.income}
        weeklyExpenses={weeklyTotals.expenses}
      />

      {/* Main Grid: Calendar & Entry */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-12 items-start">
        <div className="xl:col-span-8">
           <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                 <CalendarDays size={18} className="text-[var(--accent)]" />
                 <h2 className="text-[12px] font-mono font-black uppercase tracking-[0.3em] text-[var(--text-primary)]">System Calendar</h2>
              </div>
              <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase">{logs.length} Operations Recorded</p>
           </div>
           <FinanceCalendar 
            logs={logs} 
            selectedDate={selectedDate} 
            onDateSelect={setSelectedDate} 
           />
        </div>

        <div className="xl:col-span-4 space-y-8">
           <div className="flex items-center gap-3 mb-8">
              <TrendingUp size={18} className="text-emerald-400" />
              <h2 className="text-[12px] font-mono font-black uppercase tracking-[0.3em] text-[var(--text-primary)]">Quick Transmission</h2>
           </div>
           <FinanceEntryPanel 
            onSaved={loadData} 
            initialDate={selectedDate} 
           />

           {/* Recent Activity Mini-Feed */}
           <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-6">
                 <ArrowRightLeft size={14} className="text-[var(--text-tertiary)]" />
                 <h4 className="text-[9px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-tertiary)] opacity-60">Recent Activity</h4>
              </div>
              <div className="space-y-4">
                 {logs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex items-center justify-between group">
                       <div className="flex items-center gap-4">
                          <div className={`w-1.5 h-1.5 rounded-full ${log.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                          <div>
                             <p className="text-[12px] font-bold text-[var(--text-primary)] leading-none mb-1">{log.category}</p>
                             <p className="text-[9px] font-mono text-[var(--text-tertiary)] uppercase tracking-tighter">
                                {format(parseISO(log.logged_at), 'MMM dd')} · {log.description || 'No notes'}
                             </p>
                          </div>
                       </div>
                       <p className={`text-xs font-mono font-bold ${log.type === 'income' ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {log.type === 'income' ? '+' : '-'}{Number(log.amount).toFixed(0)}
                       </p>
                    </div>
                 ))}
                 {logs.length === 0 && (
                    <div className="text-center py-10 border border-dashed border-[var(--border-light)] rounded-2xl opacity-20">
                       <p className="text-[9px] font-mono uppercase tracking-[0.2em]">Zero Activity Signals</p>
                    </div>
                 )}
              </div>
           </div>
        </div>
      </div>
    </div>
  )
}
