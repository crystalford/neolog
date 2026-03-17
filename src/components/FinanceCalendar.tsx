'use client'

import { useState, useMemo } from 'react'
import { 
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
  eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths,
  isToday, parseISO
} from 'date-fns'
import { ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from 'lucide-react'

interface FinanceCalendarProps {
  logs: any[]
  selectedDate: Date
  onDateSelect: (date: Date) => void
}

export function FinanceCalendar({ logs, selectedDate, onDateSelect }: FinanceCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth))
    const end = endOfWeek(endOfMonth(currentMonth))
    return eachDayOfInterval({ start, end })
  }, [currentMonth])

  const totalsByDay = useMemo(() => {
    const totals: Record<string, { income: number; expense: number }> = {}
    logs.forEach(log => {
      const dateKey = format(parseISO(log.logged_at), 'yyyy-MM-dd')
      if (!totals[dateKey]) totals[dateKey] = { income: 0, expense: 0 }
      if (log.type === 'income') totals[dateKey].income += Number(log.amount)
      else totals[dateKey].expense += Number(log.amount)
    })
    return totals
  }, [logs])

  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))
  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))

  return (
    <div className="bg-[var(--bg-secondary)] border border-[var(--border-light)] rounded-3xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-[var(--border-light)] bg-white/[0.02]">
        <h2 className="text-[14px] font-mono font-black uppercase tracking-[0.2em] text-[var(--text-primary)]">
          {format(currentMonth, 'MMMM yyyy')}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-tertiary)]">
            <ChevronLeft size={16} />
          </button>
          <button onClick={() => setCurrentMonth(new Date())} className="px-3 py-1 text-[9px] font-mono font-black uppercase tracking-widest text-[var(--accent)] hover:bg-[var(--accent-soft)] rounded-md transition-all">
            Today
          </button>
          <button onClick={nextMonth} className="p-2 hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors text-[var(--text-tertiary)]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 border-b border-[var(--border-light)] lg:aspect-[1.6]">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="py-2 text-center text-[9px] font-mono font-black uppercase tracking-widest text-[var(--text-tertiary)] border-r border-[var(--border-light)] last:border-r-0 opacity-40">
            {day}
          </div>
        ))}

        {calendarDays.map((day, idx) => {
          const dateKey = format(day, 'yyyy-MM-dd')
          const stats = totalsByDay[dateKey]
          const isSelected = isSameDay(day, selectedDate)
          const isCurrentMonth = isSameMonth(day, currentMonth)
          const isTodayDate = isToday(day)

          return (
            <button
              key={idx}
              onClick={() => onDateSelect(day)}
              className={`min-h-[100px] p-3 border-r border-t border-[var(--border-light)] text-left transition-all relative group
                ${!isCurrentMonth ? 'bg-white/[0.01] opacity-20' : 'bg-transparent'}
                ${isSelected ? 'bg-[var(--accent-soft)] ring-1 ring-inset ring-[var(--accent)]/30' : 'hover:bg-white/[0.02]'}
                ${idx % 7 === 6 ? 'border-r-0' : ''}
              `}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-[11px] font-mono font-bold ${isTodayDate ? 'text-[var(--accent)] bg-[var(--accent-soft)] px-1.5 py-0.5 rounded' : 'text-[var(--text-tertiary)]'}`}>
                  {format(day, 'd')}
                </span>
              </div>

              {stats && (
                <div className="space-y-1">
                  {stats.income > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-bold">
                       <ArrowUpRight size={10} /> {stats.income.toFixed(0)}
                    </div>
                  )}
                  {stats.expense > 0 && (
                    <div className="flex items-center gap-1 text-[10px] text-rose-400 font-mono font-bold">
                       <ArrowDownRight size={10} /> {stats.expense.toFixed(0)}
                    </div>
                  )}
                  {stats.income > 0 && stats.expense > 0 && (
                    <div className={`text-[9px] font-mono mt-2 pt-1 border-t border-[var(--border-light)] opacity-40 ${stats.income - stats.expense >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                       NET {(stats.income - stats.expense).toFixed(0)}
                    </div>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
